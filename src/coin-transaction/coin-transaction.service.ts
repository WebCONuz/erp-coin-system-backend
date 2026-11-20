import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCoinTransactionDto } from './dto/create-coin-transaction.dto';
import { QueryCoinTransactionDto } from './dto/query-coin-transaction.dto';
import { QueryMyCoinHistoryDto } from './dto/query-my-coin-history.dto';
import { QueryCoinStatsDto } from './dto/query-coin-stats.dto';
import { BulkGiveCoinDto } from './dto/bulk-give-coin.dto';
import { ApplyCoinRuleDto } from './dto/apply-coin-rule.dto';
import {
  CoinDirection,
  SourceType,
  TriggerType,
} from 'src/generated/prisma/enums';
import {
  ExecuteCoinProcessData,
  ReplaceSessionCoinsResult,
  SessionCoinItem,
} from 'src/common/types';
import {
  AuditActionType,
  CoinTransaction,
  Prisma,
} from 'src/generated/prisma/client';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { AUDIT_ENTITY } from 'src/audit-log/utils/audit-entry';
import {
  EFFECTIVE_COIN_TX_WHERE,
  VISIBLE_COIN_TX_WHERE,
} from './constants/effective-transaction';
import { ALL_SESSION_MANAGED_SOURCE_TYPES } from 'src/sessions/constants/session-types';
import {
  canTeacherAccessGroup,
  teacherGroupAccessWhere,
} from 'src/common/utils/teacher-group-access';
import { assertTeacherCoinLimit } from 'src/common/utils/teacher-coin-limit';
import {
  ACTIVE_STUDENT_WHERE,
  assertActiveStudent,
} from 'src/common/utils/user-role-checks';
import {
  addDays,
  getTenantTimezone,
  getTenantToday,
  isValidDateOnly,
  zonedDayStart,
} from 'src/common/utils/tenant-time';
import { buildTrendBuckets, sumByLocalDay } from 'src/common/utils/coin-trend';
import { planSessionCoins } from './utils/session-coin-plan';

export interface BulkCoinResultItem {
  studentId: string;
  success: boolean;
  direction?: CoinDirection;
  transactionId?: string;
  newBalance?: number;
  error?: string;
}

@Injectable()
export class CoinTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  // 1. MANUALLY (QO'LDA) TRANZAKSIYA YARATISH (Controller ishlatadi)
  async createManualTransaction(
    tenantId: string,
    teacherId: string,
    dto: CreateCoinTransactionDto,
    requesterRole?: string,
  ) {
    // Teacher faqat o'zi dars beradigan guruhdagi o'quvchiga coin bera oladi
    if (requesterRole === 'teacher') {
      const isOwnStudent = await this.prisma.groupStudent.findFirst({
        where: {
          studentId: dto.studentId,
          isDeleted: false,
          group: {
            tenantId,
            isDeleted: false,
            ...teacherGroupAccessWhere(teacherId),
          },
        },
      });
      if (!isOwnStudent) {
        throw new ForbiddenException(
          "Siz faqat o'z guruhingizdagi o'quvchiga tanga bera olasiz",
        );
      }
    }

    await this.assertManualRefs(tenantId, teacherId, requesterRole, {
      ruleId: dto.ruleId,
      groupId: dto.groupId,
      sessionId: dto.sessionId,
    });
    await assertTeacherCoinLimit(this.prisma, tenantId, requesterRole, [
      dto.amount,
    ]);

    return this.executeCoinProcess(
      tenantId,
      {
        studentId: dto.studentId,
        amount: dto.amount,
        direction: dto.direction,
        sourceType: dto.sourceType,
        note: dto.note,
        teacherId,
        ruleId: dto.ruleId,
        groupId: dto.groupId,
        sessionId: dto.sessionId,
      },
      teacherId,
    );
  }

  // 2. TIZIM ICHKI XIZMATLARI UCHUN INTERFEYS (Buni dars yo'qlama moduli chaqiradi)
  async createInternalTransaction(
    tenantId: string,
    data: ExecuteCoinProcessData,
  ) {
    return this.executeCoinProcess(tenantId, data);
  }

  // 2a. Qo'lda coin so'rovidagi havolalar (qoida, guruh, sessiya) shu tenantga tegishli
  // va o'chirilmagan bo'lishi shart; teacher uchun guruh/sessiya unga tegishli bo'lishi kerak.
  // Aks holda boshqa tenantning yoki begona sessiyaning ID'sini tranzaksiyaga yozish mumkin edi.
  private async assertManualRefs(
    tenantId: string,
    requesterId: string,
    requesterRole: string | undefined,
    refs: { ruleId?: string; groupId?: string; sessionId?: string },
  ) {
    const isTeacher = requesterRole === 'teacher';

    if (refs.ruleId) {
      const rule = await this.prisma.coinRule.findFirst({
        where: { id: refs.ruleId, tenantId, isDeleted: false },
        select: { id: true },
      });
      if (!rule) throw new NotFoundException('Tanga qoidasi topilmadi');
    }

    if (refs.groupId) {
      const group = await this.prisma.group.findFirst({
        where: { id: refs.groupId, tenantId, isDeleted: false },
        select: { id: true },
      });
      if (!group) throw new NotFoundException('Guruh topilmadi');
      if (
        isTeacher &&
        !(await canTeacherAccessGroup(
          this.prisma,
          refs.groupId,
          requesterId,
          tenantId,
        ))
      ) {
        throw new ForbiddenException('Siz bu guruhga tanga bera olmaysiz');
      }
    }

    if (refs.sessionId) {
      const session = await this.prisma.session.findFirst({
        where: { id: refs.sessionId, tenantId, isDeleted: false },
        select: { id: true, groupId: true, teacherId: true },
      });
      if (!session) throw new NotFoundException('Dars topilmadi');
      if (refs.groupId && session.groupId !== refs.groupId) {
        throw new BadRequestException(
          'Dars ko‘rsatilgan guruhga tegishli emas',
        );
      }
      if (
        isTeacher &&
        session.teacherId !== requesterId &&
        !(await canTeacherAccessGroup(
          this.prisma,
          session.groupId,
          requesterId,
          tenantId,
        ))
      ) {
        throw new ForbiddenException('Siz bu darsga tanga bera olmaysiz');
      }
    }
  }

  // 3. ASOSIY YORDAMCHI TRANZAKSIYA METODI (CORE LOGIC)
  // `auditActorId` berilsa — audit yozuvi coin bilan bitta tx'da yoziladi (yakka qo'lda coin)
  private async executeCoinProcess(
    tenantId: string,
    data: ExecuteCoinProcessData,
    auditActorId?: string,
  ) {
    const {
      studentId,
      amount,
      direction,
      sourceType,
      note,
      teacherId,
      ruleId,
      groupId,
      sessionId,
    } = data;

    // Coin faqat shu tenantdagi faol studentga beriladi — admin o'ziga/xodimga, yoki
    // arxivlangan o'quvchiga coin yozib bo'lmaydi
    await assertActiveStudent(this.prisma, tenantId, studentId);

    // Tranzaksiyani xavfsiz ishga tushiramiz
    return this.prisma.$transaction(async (tx) => {
      // Hamyon qulflanadi — parallel ayirishlarda balans manfiyga tushmaydi
      const wallet = await this.lockWallet(tx, studentId);

      // Agar tanga ayirilayotgan bo'lsa, balans yetarliligini tekshiramiz
      if (direction === CoinDirection.deduct && wallet.balance < amount) {
        throw new BadRequestException(
          `Talabaning balansi yetarli emas. Joriy balans: ${wallet.balance}, ayirilmoqchi: ${amount}`,
        );
      }

      const result = await this.applyCoinInTx(tx, wallet.id, tenantId, {
        studentId,
        amount,
        direction,
        sourceType,
        note,
        teacherId,
        ruleId,
        groupId,
        sessionId,
      });

      if (auditActorId) {
        await tx.auditLog.create({
          data: this.audit.data({
            tenantId,
            actorId: auditActorId,
            action: AuditActionType.coin_transaction,
            entityType: AUDIT_ENTITY.coinTransaction,
            entityId: result.transactionId,
            changes: {
              studentId,
              amount,
              direction,
              sourceType,
              ruleId: ruleId ?? null,
              groupId: groupId ?? null,
              sessionId: sessionId ?? null,
            },
            description: note ?? undefined,
          }),
        });
      }

      return { success: true, ...result };
    });
  }

  // Bir nechta o'quvchiga coin (bulk / qoida) — bitta audit yozuvi. Har bir o'quvchi alohida
  // tx'da saqlanadi, shuning uchun audit — oxirida, best-effort (coin allaqachon berilgan)
  private auditCoinOperation(
    tenantId: string,
    actorId: string,
    kind: 'bulk_manual' | 'apply_rule',
    details: Record<string, unknown>,
    results: BulkCoinResultItem[],
  ) {
    const succeeded = results.filter((r) => r.success);
    if (!succeeded.length) return Promise.resolve();
    return this.audit.recordSafe({
      tenantId,
      actorId,
      action: AuditActionType.coin_transaction,
      entityType: AUDIT_ENTITY.coinOperation,
      entityId: randomUUID(),
      changes: {
        kind,
        ...details,
        transactions: succeeded.map((r) => ({
          studentId: r.studentId,
          transactionId: r.transactionId ?? null,
        })),
        failedCount: results.length - succeeded.length,
      },
    });
  }

  // 3a. Hamyonni tx oxirigacha qulflaydi (SELECT ... FOR UPDATE) va joriy balansni qaytaradi.
  // Yo'q bo'lsa (user yaratilganda ochilmay qolgan bo'lsa) ochiladi — ON CONFLICT parallel
  // yaratishda unique xatosini oldini oladi. Balansga ta'sir qiladigan har bir tx shu
  // metod orqali hamyonni oladi: bitta o'quvchi bo'yicha o'zgarishlar navbat bilan bajariladi,
  // shuning uchun "tekshirib, keyin ayirish" orasida boshqa tx balansni o'zgartira olmaydi.
  async lockWallet(
    tx: Prisma.TransactionClient,
    studentId: string,
  ): Promise<{ id: string; balance: number }> {
    await tx.$executeRaw`
      INSERT INTO wallets (id, user_id, balance, updated_at)
      VALUES (${randomUUID()}::uuid, ${studentId}::uuid, 0, now())
      ON CONFLICT (user_id) DO NOTHING`;
    const [wallet] = await tx.$queryRaw<{ id: string; balance: number }[]>`
      SELECT id, balance FROM wallets WHERE user_id = ${studentId}::uuid FOR UPDATE`;
    return wallet;
  }

  // Bir nechta hamyonni qulflash — deadlock bo'lmasligi uchun doim id tartibida
  private async lockWalletsByIds(
    tx: Prisma.TransactionClient,
    walletIds: string[],
  ): Promise<Map<string, number>> {
    if (!walletIds.length) return new Map();
    const rows = await tx.$queryRaw<{ id: string; balance: number }[]>`
      SELECT id, balance FROM wallets
      WHERE id = ANY(${walletIds}::uuid[])
      ORDER BY id
      FOR UPDATE`;
    return new Map(rows.map((r) => [r.id, r.balance]));
  }

  // 3a1. Balansni o'zgartirish + tranzaksiya logi (faqat tx ichida chaqiriladi)
  private async applyCoinInTx(
    tx: Prisma.TransactionClient,
    walletId: string,
    tenantId: string,
    data: ExecuteCoinProcessData,
  ) {
    const updatedWallet = await tx.wallet.update({
      where: { id: walletId },
      data: {
        balance:
          data.direction === CoinDirection.earn
            ? { increment: data.amount }
            : { decrement: data.amount },
      },
    });

    const transactionRecord = await tx.coinTransaction.create({
      data: {
        amount: data.amount,
        direction: data.direction,
        sourceType: data.sourceType,
        note: data.note || null,
        ruleId: data.ruleId || null,
        walletId,
        tenantId,
        studentId: data.studentId,
        teacherId: data.teacherId || null,
        sessionId: data.sessionId || null,
        groupId: data.groupId || null,
        purchaseId: data.purchaseId || null,
        reversalOfId: data.reversalOfId || null,
      },
    });

    return {
      transactionId: transactionRecord.id,
      newBalance: updatedWallet.balance,
    };
  }

  // 3a1b. TESKARI YOZUV — tranzaksiyani bekor qilish asl yozuvni o'chirmaydi, unga
  // qarama-qarshi yo'nalishdagi yangi yozuv qo'shadi (reversalOfId). Hamyon oldindan
  // qulflangan bo'lishi kerak. Bitta yozuv faqat bir marta bekor qilinadi (DB unique).
  private reverseInTx(
    tx: Prisma.TransactionClient,
    walletId: string,
    trx: CoinTransaction,
    actorId: string | null,
    note: string,
  ) {
    return this.applyCoinInTx(tx, walletId, trx.tenantId, {
      studentId: trx.studentId,
      amount: trx.amount,
      direction:
        trx.direction === CoinDirection.earn
          ? CoinDirection.deduct
          : CoinDirection.earn,
      sourceType: trx.sourceType,
      note,
      teacherId: actorId,
      ruleId: trx.ruleId,
      groupId: trx.groupId,
      sessionId: trx.sessionId,
      purchaseId: trx.purchaseId,
      reversalOfId: trx.id,
    });
  }

  // Avval ayirishlar (ularning teskarisi — qo'shish), keyin qo'shishlar bekor qilinadi:
  // oraliq balans manfiyga tushmaydi (DB CHECK balance >= 0 har bir so'rovda tekshiriladi)
  private sortForReversal<T extends { direction: CoinDirection }>(rows: T[]) {
    return [...rows].sort(
      (a, b) =>
        (a.direction === CoinDirection.deduct ? 0 : 1) -
        (b.direction === CoinDirection.deduct ? 0 : 1),
    );
  }

  // 3a1c. BIR NECHTA O'QUVCHI HAMYONINI QULFLASH — yo'qlari bitta so'rov bilan ochiladi,
  // hammasi bitta so'rov bilan wallet id tartibida FOR UPDATE qilinadi (lockWalletsByIds
  // bilan bir xil tartib — parallel tranzaksiyalarda deadlock bo'lmaydi). Kalit — studentId
  async lockStudentWallets(
    tx: Prisma.TransactionClient,
    studentIds: string[],
  ): Promise<Map<string, { id: string; balance: number }>> {
    const ids = [...new Set(studentIds)];
    if (!ids.length) return new Map();

    const newWalletIds = ids.map(() => randomUUID());
    await tx.$executeRaw`
      INSERT INTO wallets (id, user_id, balance, updated_at)
      SELECT t.id, t.user_id, 0, now()
      FROM unnest(${newWalletIds}::uuid[], ${ids}::uuid[]) AS t(id, user_id)
      ON CONFLICT (user_id) DO NOTHING`;
    const rows = await tx.$queryRaw<
      { id: string; user_id: string; balance: number }[]
    >`
      SELECT id, user_id, balance FROM wallets
      WHERE user_id = ANY(${ids}::uuid[])
      ORDER BY id
      FOR UPDATE`;
    return new Map(
      rows.map((r) => [r.user_id, { id: r.id, balance: r.balance }]),
    );
  }

  // Bir nechta hamyon balansini bitta so'rov bilan o'zgartirish (hamyonlar qulflangan bo'lishi shart).
  // Faqat CoinTransaction yozuvlari bilan bitta tx'da chaqiriladi (balans invarianti)
  private async applyWalletDeltas(
    tx: Prisma.TransactionClient,
    deltas: Map<string, number>,
  ): Promise<void> {
    const entries = [...deltas].filter(([, delta]) => delta !== 0);
    if (!entries.length) return;
    const walletIds = entries.map(([id]) => id);
    const values = entries.map(([, delta]) => delta);
    await tx.$executeRaw`
      UPDATE wallets AS w
      SET balance = w.balance + v.delta, updated_at = now()
      FROM unnest(${walletIds}::uuid[], ${values}::int[]) AS v(id, delta)
      WHERE w.id = v.id`;
  }

  // Teskari yozuv ma'lumoti (createMany uchun) — reverseInTx bilan bir xil maydonlar
  private reversalRow(
    trx: CoinTransaction,
    actorId: string | null,
    note: string,
  ): Prisma.CoinTransactionCreateManyInput {
    return {
      amount: trx.amount,
      direction:
        trx.direction === CoinDirection.earn
          ? CoinDirection.deduct
          : CoinDirection.earn,
      sourceType: trx.sourceType,
      note,
      ruleId: trx.ruleId,
      walletId: trx.walletId,
      tenantId: trx.tenantId,
      studentId: trx.studentId,
      teacherId: actorId,
      sessionId: trx.sessionId,
      groupId: trx.groupId,
      purchaseId: trx.purchaseId,
      reversalOfId: trx.id,
    };
  }

  // 3a2. SESSIYA TEKSHIRUVI COINLARINI ALMASHTIRISH (butun guruh bitta so'rovlar to'plamida) —
  // yo'qlama/natija saqlanganda har bir o'quvchi uchun shu sessiyadagi avvalgi (sourceTypes dagi)
  // tranzaksiyalar bekor qilinib, yangilari yoziladi. Chaqiruvchining tx'i ichida ishlaydi.
  // O'quvchilar soniga bog'liq bo'lmagan so'rovlar soni: hamyonlar qulfi, avvalgi coinlar,
  // createMany va bitta balans UPDATE. Har bir o'quvchi uchun qaror — planSessionCoins:
  // - coinlar o'zgarmagan bo'lsa — hech narsa yozilmaydi;
  // - avvalgi coinlarni qaytarib bo'lmasa (sarflangan) — o'zgarmaydi, `skipped: true`;
  // - jarimaga balans yetmasa — faqat shu element o'tkazib yuboriladi.
  async replaceSessionTransactionsBulk(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      sessionId: string;
      sourceTypes: SourceType[];
      students: { studentId: string; items: SessionCoinItem[] }[];
      // Kim qayta saqladi — teskari yozuvlarda teacherId sifatida yoziladi
      actorId?: string;
    },
  ): Promise<Map<string, ReplaceSessionCoinsResult>> {
    const { tenantId, sessionId, sourceTypes, students, actorId } = params;
    const results = new Map<string, ReplaceSessionCoinsResult>();
    if (!students.length) return results;

    const studentIds = students.map((s) => s.studentId);

    // Avval hamyonlar qulflanadi, keyin avvalgi tranzaksiyalar o'qiladi: parallel saqlashda
    // ikkinchi tx qulfni kutadi va birinchisi yozganlarni ko'radi (dublikat bo'lmaydi)
    const wallets = await this.lockStudentWallets(tx, studentIds);
    const active = await tx.coinTransaction.findMany({
      where: {
        ...EFFECTIVE_COIN_TX_WHERE,
        sessionId,
        studentId: { in: studentIds },
        sourceType: { in: sourceTypes },
      },
    });
    const activeByStudent = new Map<string, CoinTransaction[]>();
    for (const trx of active) {
      const list = activeByStudent.get(trx.studentId) ?? [];
      list.push(trx);
      activeByStudent.set(trx.studentId, list);
    }

    const rows: Prisma.CoinTransactionCreateManyInput[] = [];
    const deltas = new Map<string, number>();

    for (const { studentId, items } of students) {
      const wallet = wallets.get(studentId)!;
      const previous = activeByStudent.get(studentId) ?? [];
      const plan = planSessionCoins(wallet.balance, previous, items);

      if (plan.kind === 'unchanged') {
        results.set(studentId, {
          skipped: false,
          reversed: 0,
          created: 0,
          skippedItems: [],
        });
        continue;
      }
      if (plan.kind === 'blocked') {
        results.set(studentId, {
          skipped: true,
          code: plan.code,
          reason: plan.reason,
          reversed: 0,
          created: 0,
          skippedItems: [],
        });
        continue;
      }

      for (const trx of plan.reversals) {
        rows.push(
          this.reversalRow(
            trx,
            actorId ?? null,
            'Tekshiruv qayta saqlandi — avvalgi yozuv bekor qilindi',
          ),
        );
      }
      for (const item of plan.creates) {
        rows.push({
          amount: item.amount,
          direction: item.direction,
          sourceType: item.sourceType,
          note: item.note || null,
          ruleId: item.ruleId || null,
          walletId: wallet.id,
          tenantId,
          studentId,
          teacherId: item.teacherId || null,
          sessionId: item.sessionId || null,
          groupId: item.groupId || null,
        });
      }
      deltas.set(wallet.id, plan.delta);
      results.set(studentId, {
        skipped: false,
        reversed: plan.reversals.length,
        created: plan.creates.length,
        skippedItems: plan.skippedItems,
      });
    }

    if (rows.length) await tx.coinTransaction.createMany({ data: rows });
    await this.applyWalletDeltas(tx, deltas);

    return results;
  }

  // Bitta o'quvchi uchun (replaceSessionTransactionsBulk ustidan)
  async replaceSessionTransactions(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      sessionId: string;
      studentId: string;
      sourceTypes: SourceType[];
      items: SessionCoinItem[];
      actorId?: string;
    },
  ): Promise<ReplaceSessionCoinsResult> {
    const { studentId, items, ...rest } = params;
    const results = await this.replaceSessionTransactionsBulk(tx, {
      ...rest,
      students: [{ studentId, items }],
    });
    return results.get(studentId)!;
  }

  // 3a3. SESSIYA O'CHIRILGANDA — uning tekshiruvi orqali berilgan barcha
  // coinlarni qaytarish (hammasi yoki hech biri). Kimdir coinni sarflab
  // bo'lgan bo'lsa, hech narsa o'zgarmaydi va shu o'quvchilar qaytariladi.
  async reverseSessionTransactions(
    tx: Prisma.TransactionClient,
    sessionId: string,
    sourceTypes: SourceType[],
    actorId?: string,
  ): Promise<{ reversed: number; blockedStudentIds: string[] }> {
    const where: Prisma.CoinTransactionWhereInput = {
      ...EFFECTIVE_COIN_TX_WHERE,
      sessionId,
      sourceType: { in: sourceTypes },
    };

    // Tegishli hamyonlar qulflanadi, so'ng tranzaksiyalar qulf ostida qayta o'qiladi
    const walletRows = await tx.coinTransaction.findMany({
      where,
      distinct: ['walletId'],
      select: { walletId: true },
    });
    const lockedBalances = await this.lockWalletsByIds(
      tx,
      walletRows.map((w) => w.walletId),
    );

    const activeTransactions = await tx.coinTransaction.findMany({ where });

    const perWallet = new Map<
      string,
      { studentId: string; balance: number; delta: number }
    >();
    for (const trx of activeTransactions) {
      const entry = perWallet.get(trx.walletId) ?? {
        studentId: trx.studentId,
        balance: lockedBalances.get(trx.walletId) ?? 0,
        delta: 0,
      };
      entry.delta +=
        trx.direction === CoinDirection.earn ? -trx.amount : trx.amount;
      perWallet.set(trx.walletId, entry);
    }

    const blockedStudentIds = [...perWallet.values()]
      .filter((w) => w.balance + w.delta < 0)
      .map((w) => w.studentId);

    if (blockedStudentIds.length) {
      return { reversed: 0, blockedStudentIds };
    }

    for (const trx of this.sortForReversal(activeTransactions)) {
      await this.reverseInTx(
        tx,
        trx.walletId,
        trx,
        actorId ?? null,
        "Dars o'chirildi — shu dars uchun berilgan coin bekor qilindi",
      );
    }

    return { reversed: activeTransactions.length, blockedStudentIds: [] };
  }

  // 3a4. BULK OLDIDAN TEKSHIRUV — har bir shart uchun bitta so'rov (o'quvchi soniga bog'liq emas).
  // Qaytaradi: studentId → xato matni (o'tmaganlar). Tartib: qoida guruhi → teacher guruhi → faol student
  private async precheckBulkRecipients(
    tenantId: string,
    studentIds: string[],
    opts: { ruleGroupId?: string; teacherId?: string },
  ): Promise<Map<string, string>> {
    const [ruleMembers, teacherMembers, activeStudents] = await Promise.all([
      opts.ruleGroupId
        ? this.prisma.groupStudent.findMany({
            where: {
              studentId: { in: studentIds },
              groupId: opts.ruleGroupId,
              isDeleted: false,
            },
            select: { studentId: true },
          })
        : null,
      opts.teacherId
        ? this.prisma.groupStudent.findMany({
            where: {
              studentId: { in: studentIds },
              isDeleted: false,
              group: {
                tenantId,
                isDeleted: false,
                ...teacherGroupAccessWhere(opts.teacherId),
              },
            },
            select: { studentId: true },
          })
        : null,
      this.prisma.user.findMany({
        where: { id: { in: studentIds }, tenantId, ...ACTIVE_STUDENT_WHERE },
        select: { id: true },
      }),
    ]);

    const toSet = (rows: { studentId: string }[] | null) =>
      rows ? new Set(rows.map((r) => r.studentId)) : null;
    const inRuleGroup = toSet(ruleMembers);
    const inTeacherGroup = toSet(teacherMembers);
    const active = new Set(activeStudents.map((u) => u.id));

    const failures = new Map<string, string>();
    for (const id of studentIds) {
      if (inRuleGroup && !inRuleGroup.has(id)) {
        failures.set(
          id,
          "Bu qoida faqat biriktirilgan guruh a'zolariga qo'llanadi, o'quvchi shu guruhda emas",
        );
      } else if (inTeacherGroup && !inTeacherGroup.has(id)) {
        failures.set(
          id,
          "Siz faqat o'z guruhingizdagi o'quvchiga tanga bera olasiz",
        );
      } else if (!active.has(id)) {
        failures.set(id, 'O‘quvchi topilmadi');
      }
    }
    return failures;
  }

  // 3a5. BULK COIN — tekshiruvdan o'tgan barcha o'quvchilar bitta tx'da: hamyonlar id tartibida
  // qulflanadi, balansi yetmagan ayirish shu o'quvchi uchun xato bo'ladi, qolganlari
  // createMany + bitta balans UPDATE bilan yoziladi. Natija `studentIds` tartibida
  private async applyBulkCoins(
    tenantId: string,
    studentIds: string[],
    failures: Map<string, string>,
    build: (studentId: string) => ExecuteCoinProcessData,
  ): Promise<BulkCoinResultItem[]> {
    const eligible = studentIds.filter((id) => !failures.has(id));
    const outcome = new Map<string, BulkCoinResultItem>();

    if (eligible.length) {
      await this.prisma.$transaction(async (tx) => {
        const wallets = await this.lockStudentWallets(tx, eligible);
        const rows: Prisma.CoinTransactionCreateManyInput[] = [];
        const deltas = new Map<string, number>();

        for (const studentId of eligible) {
          const data = build(studentId);
          const wallet = wallets.get(studentId)!;
          if (
            data.direction === CoinDirection.deduct &&
            wallet.balance < data.amount
          ) {
            outcome.set(studentId, {
              studentId,
              success: false,
              direction: data.direction,
              error: `Talabaning balansi yetarli emas. Joriy balans: ${wallet.balance}, ayirilmoqchi: ${data.amount}`,
            });
            continue;
          }

          const transactionId = randomUUID();
          const delta =
            data.direction === CoinDirection.earn ? data.amount : -data.amount;
          rows.push({
            id: transactionId,
            amount: data.amount,
            direction: data.direction,
            sourceType: data.sourceType,
            note: data.note || null,
            ruleId: data.ruleId || null,
            walletId: wallet.id,
            tenantId,
            studentId,
            teacherId: data.teacherId || null,
            sessionId: data.sessionId || null,
            groupId: data.groupId || null,
          });
          deltas.set(wallet.id, delta);
          outcome.set(studentId, {
            studentId,
            success: true,
            direction: data.direction,
            transactionId,
            newBalance: wallet.balance + delta,
          });
        }

        if (rows.length) await tx.coinTransaction.createMany({ data: rows });
        await this.applyWalletDeltas(tx, deltas);
      });
    }

    return studentIds.map(
      (studentId) =>
        outcome.get(studentId) ?? {
          studentId,
          success: false,
          direction: build(studentId).direction,
          error: failures.get(studentId) ?? "Noma'lum xatolik",
        },
    );
  }

  // 3b. BIR NECHTA O'QUVCHIGA BIRDANIGA BIR XIL MIQDORDA COIN BERISH/AYIRISH
  async giveBulkManual(
    tenantId: string,
    teacherId: string,
    dto: BulkGiveCoinDto,
    requesterRole?: string,
  ) {
    const uniqueStudentIds = Array.from(new Set(dto.studentIds));
    const results: BulkCoinResultItem[] = [];

    // groupId/sessionId butun so'rov uchun bir marta tekshiriladi
    await this.assertManualRefs(tenantId, teacherId, requesterRole, {
      groupId: dto.groupId,
      sessionId: dto.sessionId,
    });
    await assertTeacherCoinLimit(this.prisma, tenantId, requesterRole, [
      dto.amount,
    ]);

    const failures = await this.precheckBulkRecipients(
      tenantId,
      uniqueStudentIds,
      {
        teacherId: requesterRole === 'teacher' ? teacherId : undefined,
      },
    );
    results.push(
      ...(await this.applyBulkCoins(
        tenantId,
        uniqueStudentIds,
        failures,
        (studentId) => ({
          studentId,
          amount: dto.amount,
          direction: dto.direction,
          sourceType: dto.sourceType,
          note: dto.note,
          teacherId,
          groupId: dto.groupId,
          sessionId: dto.sessionId,
        }),
      )),
    );

    await this.auditCoinOperation(
      tenantId,
      teacherId,
      'bulk_manual',
      {
        amount: dto.amount,
        direction: dto.direction,
        sourceType: dto.sourceType,
        groupId: dto.groupId ?? null,
        sessionId: dto.sessionId ?? null,
        note: dto.note ?? null,
      },
      results,
    );

    return {
      totalRequested: uniqueStudentIds.length,
      successCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success).length,
      results,
    };
  }

  // 3c. MAVJUD COIN QOIDASINI BIR YOKI BIR NECHTA STUDENTGA QO'LLASH
  async applyRuleToStudents(
    tenantId: string,
    teacherId: string,
    dto: ApplyCoinRuleDto,
    requesterRole?: string,
  ) {
    const rule = await this.prisma.coinRule.findFirst({
      where: {
        id: dto.ruleId,
        tenantId,
        isDeleted: false,
        isActive: true,
      },
    });

    if (!rule) {
      throw new NotFoundException('Tanga qoidasi topilmadi yoki nofaol');
    }

    // Avtomatik qoidalar (davomat, uy vazifasi) faqat yo'qlama orqali qo'llanadi —
    // qo'lda qo'llansa, sessiya qayta saqlanganda o'chib ketadi yoki dublikat bo'ladi
    if (rule.triggerType === TriggerType.auto) {
      throw new BadRequestException(
        "Avtomatik qoidani qo'lda qo'llab bo'lmaydi — u yo'qlama saqlanganda o'zi qo'llanadi",
      );
    }

    // Xarid manbasi faqat xarid moduli uchun
    const sourceType =
      rule.sourceType && rule.sourceType !== SourceType.purchase
        ? rule.sourceType
        : SourceType.manual;

    if (
      dto.sessionId &&
      ALL_SESSION_MANAGED_SOURCE_TYPES.includes(sourceType)
    ) {
      throw new BadRequestException(
        "Bu turdagi coin sessiyaga yo'qlama/natija orqali beriladi — qoidani sessionId'siz qo'llang",
      );
    }

    await this.assertManualRefs(tenantId, teacherId, requesterRole, {
      sessionId: dto.sessionId,
    });
    await assertTeacherCoinLimit(this.prisma, tenantId, requesterRole, [
      rule.coinAmount,
    ]);

    const uniqueStudentIds = Array.from(new Set(dto.studentIds));
    const results: BulkCoinResultItem[] = [];
    const note = dto.note || `"${rule.name}" qoidasi asosida`;

    const failures = await this.precheckBulkRecipients(
      tenantId,
      uniqueStudentIds,
      {
        // Guruhga biriktirilgan qoida — faqat shu guruh a'zolariga
        ruleGroupId: rule.groupId ?? undefined,
        teacherId: requesterRole === 'teacher' ? teacherId : undefined,
      },
    );
    results.push(
      ...(await this.applyBulkCoins(
        tenantId,
        uniqueStudentIds,
        failures,
        (studentId) => ({
          studentId,
          amount: rule.coinAmount,
          direction: rule.direction,
          sourceType,
          note,
          teacherId,
          ruleId: rule.id,
          groupId: rule.groupId,
          sessionId: dto.sessionId,
        }),
      )),
    );

    await this.auditCoinOperation(
      tenantId,
      teacherId,
      'apply_rule',
      {
        ruleId: rule.id,
        ruleName: rule.name,
        amount: rule.coinAmount,
        direction: rule.direction,
        sessionId: dto.sessionId ?? null,
      },
      results,
    );

    return {
      rule: {
        id: rule.id,
        name: rule.name,
        coinAmount: rule.coinAmount,
        direction: rule.direction,
      },
      totalRequested: uniqueStudentIds.length,
      successCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success).length,
      results,
    };
  }

  // 4. TRANZAKSIYALAR TARIXINI OLISH
  async findAll(
    query: QueryCoinTransactionDto,
    tenantId: string,
    requesterRole?: string,
    requesterId?: string,
  ) {
    const {
      page = 1,
      limit = 10,
      studentId,
      teacherId,
      direction,
      sourceType,
    } = query;
    const skip = (page - 1) * limit;

    // Tarixda teskari yozuvlar ham ko'rinadi (reversalOfId / reversal orqali bog'langan)
    const where: Prisma.CoinTransactionWhereInput = {
      ...VISIBLE_COIN_TX_WHERE,
      tenantId,
    };

    if (studentId) where.studentId = studentId;
    if (teacherId) where.teacherId = teacherId;
    if (direction) where.direction = direction;
    if (sourceType) where.sourceType = sourceType;

    // Teacher faqat o'zi bergan/qayd etgan tranzaksiyalarni ko'radi
    if (requesterRole === 'teacher') {
      where.teacherId = requesterId;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.coinTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          student: { select: { fullName: true, phone: true } },
          teacher: { select: { fullName: true } },
          rule: { select: { name: true } },
          reversal: { select: { id: true, createdAt: true } },
        },
      }),
      this.prisma.coinTransaction.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // 5. TRANZAKSIYANI BEKOR QILISH — teskari yozuv yaratiladi, asl yozuv tarixda qoladi
  async cancelTransaction(id: string, tenantId: string, actorId: string) {
    const trx = await this.prisma.coinTransaction.findFirst({
      where: { id, ...VISIBLE_COIN_TX_WHERE, tenantId },
      include: { reversal: { select: { id: true } } },
    });

    if (!trx) throw new NotFoundException('Tranzaksiya topilmadi');

    if (trx.reversalOfId) {
      throw new BadRequestException(
        'Bu yozuvning o‘zi bekor qilish (teskari) yozuvi — uni bekor qilib bo‘lmaydi',
      );
    }
    if (trx.reversal) {
      throw new ConflictException('Tranzaksiya allaqachon bekor qilingan');
    }

    // Xarid coinlari faqat xaridni bekor qilish orqali qaytariladi — aks holda
    // o'quvchi ham sovg'ani, ham coinni olib qolishi mumkin edi
    if (trx.sourceType === SourceType.purchase) {
      throw new BadRequestException(
        'Xarid tranzaksiyasini bu yerdan bekor qilib bo‘lmaydi — xaridning o‘zini bekor qiling (PATCH /purchases/:id/status)',
      );
    }

    // Sessiya tekshiruvi (yo'qlama/natija) coinlari yo'qlamani qayta saqlash orqali boshqariladi
    if (
      trx.sessionId &&
      ALL_SESSION_MANAGED_SOURCE_TYPES.includes(trx.sourceType)
    ) {
      throw new BadRequestException(
        'Bu coin sessiya tekshiruvi orqali berilgan — yo‘qlama/natijani o‘zgartiring',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.lockWallet(tx, trx.studentId);

      // Qulf ostida qayta tekshiruv: parallel ikki so'rovda ikkinchisi shu yerda to'xtaydi
      const alreadyReversed = await tx.coinTransaction.findUnique({
        where: { reversalOfId: id },
        select: { id: true },
      });
      if (alreadyReversed) {
        throw new ConflictException('Tranzaksiya allaqachon bekor qilingan');
      }

      // Berilgan coin (earn) qaytarilayotganda balans yetishi kerak
      if (trx.direction === CoinDirection.earn && wallet.balance < trx.amount) {
        throw new BadRequestException(
          'Tranzaksiyani bekor qilib bo‘lmaydi, talaba coinlarni ishlatib yuborgan.',
        );
      }

      const result = await this.reverseInTx(
        tx,
        wallet.id,
        trx,
        actorId,
        'Tranzaksiya bekor qilindi',
      );

      await tx.auditLog.create({
        data: this.audit.data({
          tenantId,
          actorId,
          action: AuditActionType.coin_transaction,
          entityType: AUDIT_ENTITY.coinTransaction,
          entityId: trx.id,
          changes: {
            operation: 'cancel',
            reversalTransactionId: result.transactionId,
            studentId: trx.studentId,
            amount: trx.amount,
            direction: trx.direction,
          },
          description: 'Tranzaksiya bekor qilindi',
        }),
      });

      return {
        message:
          'Tranzaksiya muvaffaqiyatli bekor qilindi va balans qayta hisoblandi',
        reversalTransactionId: result.transactionId,
        newBalance: result.newBalance,
      };
    });
  }

  // 6. TALABA HAMYONINI OLISH
  async getStudentWallet(userId: string, tenantId: string) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { userId, user: { tenantId } },
    });
    if (!wallet) throw new NotFoundException('Hamyon topilmadi');
    return wallet;
  }

  // 6b. TALABANING O'Z TRANZAKSIYA TARIXI (Shaxsiy profil uchun, filtrlar bilan)
  async getMyHistory(
    studentId: string,
    tenantId: string,
    query: QueryMyCoinHistoryDto,
  ) {
    const { page = 1, limit = 20, direction, sourceType, from, to } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CoinTransactionWhereInput = {
      studentId,
      ...VISIBLE_COIN_TX_WHERE,
      tenantId,
    };

    if (direction) where.direction = direction;
    if (sourceType) where.sourceType = sourceType;
    if (from || to) {
      // 'YYYY-MM-DD' — tenant mahalliy kuni (to — shu kun oxirigacha); vaqtli ISO — aniq instant
      const tz = await getTenantTimezone(this.prisma, tenantId);
      where.createdAt = {
        ...(from
          ? {
              gte: isValidDateOnly(from)
                ? zonedDayStart(tz, from)
                : new Date(from),
            }
          : {}),
        ...(to
          ? isValidDateOnly(to)
            ? { lt: zonedDayStart(tz, addDays(to, 1)) }
            : { lte: new Date(to) }
          : {}),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.coinTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          direction: true,
          sourceType: true,
          note: true,
          createdAt: true,
          reversalOfId: true,
          reversal: { select: { id: true, createdAt: true } },
          teacher: { select: { id: true, fullName: true } },
          group: { select: { id: true, name: true } },
        },
      }),
      this.prisma.coinTransaction.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // 6c. TALABANING TANGA STATISTIKASI (Chart uchun — earn/deduct trend)
  async getMyStats(
    studentId: string,
    tenantId: string,
    query: QueryCoinStatsDto,
  ) {
    const { period = 'week', count = 7 } = query;
    const bucketDays = period === 'month' ? 7 : 1; // month → haftalik bucket, week → kunlik bucket
    const totalDays = bucketDays * count;

    // Kunlar tenant timezone'ida: oxirgi bucket bugun bilan tugaydi
    const { tz, today } = await getTenantToday(this.prisma, tenantId);
    const startDate = addDays(today, -totalDays + 1);

    const transactions = await this.prisma.coinTransaction.findMany({
      where: {
        studentId,
        ...EFFECTIVE_COIN_TX_WHERE,
        tenantId,
        createdAt: { gte: zonedDayStart(tz, startDate) },
      },
      select: { amount: true, direction: true, createdAt: true },
    });

    const buckets = buildTrendBuckets(
      sumByLocalDay(tz, transactions),
      startDate,
      count,
      bucketDays,
    );

    return {
      period,
      buckets,
      totalEarned: buckets.reduce((s, b) => s + b.earned, 0),
      totalDeducted: buckets.reduce((s, b) => s + b.deducted, 0),
    };
  }

  // 7. LEADERBOARD (REYTING)
  async getLeaderboard(tenantId: string, limit: number) {
    // Reytingda faqat faol studentlar (xodimlarning hamyonlari ham bor)
    return this.prisma.wallet.findMany({
      where: { user: { tenantId, ...ACTIVE_STUDENT_WHERE } },
      take: limit,
      orderBy: { balance: 'desc' },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
  }
}
