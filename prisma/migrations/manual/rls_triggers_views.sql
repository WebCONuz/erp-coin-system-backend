-- ============================================================
-- RLS + TRIGGERS + VIEWS
-- prisma/migrations/manual/rls_triggers_views.sql
-- Ishlatish: psql $DATABASE_URL -f rls_triggers_views.sql
-- ============================================================

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────

-- RLS yoqish
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_students    ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_rules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards           ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases         ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_logs       ENABLE ROW LEVEL SECURITY;

-- Policylar — faqat o'z tenant ma'lumotlari ko'rinadi
CREATE POLICY tenant_isolation ON users
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON courses
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON groups
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON coin_rules
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON sessions
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON rewards
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- tenant_id yo'q jadvallar uchun — join orqali filter
CREATE POLICY tenant_isolation ON group_students
    USING (
        EXISTS (
            SELECT 1 FROM groups g
            WHERE g.id = group_students.group_id
              AND g.tenant_id = current_setting('app.current_tenant_id', true)::uuid
        )
    );

CREATE POLICY tenant_isolation ON attendance_records
    USING (
        EXISTS (
            SELECT 1 FROM sessions s
            WHERE s.id = attendance_records.session_id
              AND s.tenant_id = current_setting('app.current_tenant_id', true)::uuid
        )
    );

CREATE POLICY tenant_isolation ON coin_transactions
    USING (
        EXISTS (
            SELECT 1 FROM wallets w
            JOIN users u ON u.id = w.user_id
            WHERE w.id = coin_transactions.wallet_id
              AND u.tenant_id = current_setting('app.current_tenant_id', true)::uuid
        )
    );

CREATE POLICY tenant_isolation ON purchases
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = purchases.student_id
              AND u.tenant_id = current_setting('app.current_tenant_id', true)::uuid
        )
    );

CREATE POLICY tenant_isolation ON import_logs
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = import_logs.imported_by
              AND u.tenant_id = current_setting('app.current_tenant_id', true)::uuid
        )
    );

-- Super admin va Prisma migrate uchun bypass (migrate paytida RLS ishlamasligi kerak)
-- Prisma alohida migration user bilan ishlaydi
ALTER TABLE users             FORCE ROW LEVEL SECURITY;
ALTER TABLE courses           FORCE ROW LEVEL SECURITY;
ALTER TABLE groups            FORCE ROW LEVEL SECURITY;
ALTER TABLE coin_rules        FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions          FORCE ROW LEVEL SECURITY;
ALTER TABLE rewards           FORCE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────
-- TRIGGER: wallet balansini avtomatik yangilash
-- ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_wallet_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.direction = 'earn' THEN
        UPDATE wallets
        SET balance    = balance + NEW.amount,
            updated_at = NOW()
        WHERE id = NEW.wallet_id;

    ELSIF NEW.direction = 'deduct' THEN
        -- GREATEST: balans hech qachon manfiy bo'lmaydi
        UPDATE wallets
        SET balance    = GREATEST(balance - NEW.amount, 0),
            updated_at = NOW()
        WHERE id = NEW.wallet_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- SECURITY DEFINER: trigger RLS ni bypass qiladi (to'g'ri ishlash uchun)

CREATE TRIGGER trg_wallet_on_transaction
    AFTER INSERT ON coin_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_wallet_balance();

-- ─────────────────────────────────────────
-- TRIGGER: purchase — wallet dan coin ayirish
-- ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION deduct_coins_on_purchase()
RETURNS TRIGGER AS $$
DECLARE
    v_wallet_id UUID;
    v_balance   INT;
BEGIN
    -- Studentning wallet_id va balance ni olish
    SELECT w.id, w.balance
    INTO v_wallet_id, v_balance
    FROM wallets w
    WHERE w.user_id = NEW.student_id
    FOR UPDATE; -- race condition oldini olish

    -- Balance yetarlimi tekshirish
    IF v_balance < NEW.coin_spent THEN
        RAISE EXCEPTION 'Insufficient balance: has %, needs %', v_balance, NEW.coin_spent;
    END IF;

    -- coin_transactions ga yozish (bu o'z navbatida wallet triggerini ishga tushiradi)
    INSERT INTO coin_transactions (
        wallet_id, student_id, amount, direction, source_type, note
    ) VALUES (
        v_wallet_id, NEW.student_id, NEW.coin_spent,
        'deduct', 'purchase',
        'Purchase: reward_id=' || NEW.reward_id
    );

    -- Stock kamaytirish (-1 = unlimited, o'zgartirmaslik)
    UPDATE rewards
    SET stock = CASE WHEN stock > 0 THEN stock - 1 ELSE stock END
    WHERE id = NEW.reward_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_deduct_on_purchase
    AFTER INSERT ON purchases
    FOR EACH ROW
    EXECUTE FUNCTION deduct_coins_on_purchase();

-- ─────────────────────────────────────────
-- VIEW: o'quvchi coin tarixi (teacher nomi bilan)
-- ─────────────────────────────────────────

CREATE OR REPLACE VIEW v_student_coin_history AS
SELECT
    ct.id,
    ct.student_id,
    u_student.full_name     AS student_name,
    u_student.tenant_id,
    ct.teacher_id,
    u_teacher.full_name     AS teacher_name,
    ct.amount,
    ct.direction,
    ct.source_type,
    cr.name                 AS rule_name,
    g.name                  AS group_name,
    s.session_date,
    s.session_type,
    ct.note,
    ct.created_at
FROM coin_transactions ct
JOIN users       u_student ON u_student.id = ct.student_id
LEFT JOIN users  u_teacher ON u_teacher.id = ct.teacher_id
LEFT JOIN coin_rules cr    ON cr.id = ct.rule_id
LEFT JOIN groups g         ON g.id = ct.group_id
LEFT JOIN sessions s       ON s.id = ct.session_id;

-- ─────────────────────────────────────────
-- VIEW: guruh leaderboard
-- ─────────────────────────────────────────

CREATE OR REPLACE VIEW v_group_leaderboard AS
SELECT
    gs.group_id,
    g.name          AS group_name,
    g.tenant_id,
    u.id            AS student_id,
    u.full_name     AS student_name,
    u.avatar_url,
    w.balance       AS total_coins,
    RANK() OVER (
        PARTITION BY gs.group_id
        ORDER BY w.balance DESC
    )               AS rank
FROM group_students gs
JOIN users   u ON u.id = gs.student_id
JOIN wallets w ON w.user_id = u.id
JOIN groups  g ON g.id = gs.group_id
WHERE gs.is_active = TRUE
  AND u.is_active  = TRUE;

-- ─────────────────────────────────────────
-- COMPOSITE INDEXES (performance)
-- ─────────────────────────────────────────

-- Guruhning sessiyalari — eng ko'p ishlatiladigan so'rov
CREATE INDEX IF NOT EXISTS idx_sessions_group_date
    ON sessions(group_id, session_date DESC);

-- O'quvchi coin tarixi sahifalash uchun
CREATE INDEX IF NOT EXISTS idx_txn_student_created
    ON coin_transactions(student_id, created_at DESC);

-- Faqat active sovg'alar (do'kon sahifasi)
CREATE INDEX IF NOT EXISTS idx_rewards_active
    ON rewards(tenant_id, coin_price)
    WHERE is_active = TRUE AND stock != 0;

-- Faqat active userlar (login so'rovi)
CREATE INDEX IF NOT EXISTS idx_users_active_phone
    ON users(phone)
    WHERE is_active = TRUE;

-- ─────────────────────────────────────────
-- SEED: default roles
-- ─────────────────────────────────────────

INSERT INTO roles (name, display_name, level, can_delete, can_manage_admins, is_system)
VALUES
    ('student',     'O''quvchi',   1, FALSE, FALSE, TRUE),
    ('teacher',     'O''qituvchi', 2, FALSE, FALSE, TRUE),
    ('admin',       'Admin',       3, FALSE, FALSE, TRUE),
    ('super_admin', 'Super Admin', 4, TRUE,  TRUE,  TRUE)
ON CONFLICT (name) DO NOTHING;

-- Reward kategoriyalari
INSERT INTO reward_categories (name) VALUES
    ('Digital'),
    ('Imtiyoz'),
    ('Fizik sovg''a')
ON CONFLICT (name) DO NOTHING;

-- psql $DATABASE_URL -f prisma/migrations/manual/rls_triggers_views.sql