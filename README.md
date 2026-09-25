# ERP Coin System — Backend

O'quv markazlari va maktablar uchun **multi-tenant gamifikatsiya backend**. O'quvchilar davomat va uy vazifasi asosida avtomatik tanga (coin) oladi, yig'gan tangalarini virtual do'kondan sovg'alarga almashtiradi.

## Stack

|               |                                     |
| ------------- | ----------------------------------- |
| Framework     | NestJS 11                           |
| ORM           | Prisma 7 (PrismaPg adapter)         |
| Database      | PostgreSQL                          |
| Auth          | Passport JWT (HttpOnly cookie)      |
| API Docs      | Swagger (Basic auth)                |
| Validation    | class-validator + class-transformer |
| Upload        | Multer (`/uploads` static)          |
| Notifications | Gmail SMTP + Eskiz SMS              |

---

## Ishga tushirish

### 1. O'rnatish

```bash
npm install
```

### 2. Environment o'zgaruvchilar

Loyiha ildizida `.env` fayl yarating:

```env
PORT=3031
DATABASE_URL="postgresql://user:password@localhost:5432/erp_coin"

JWT_ACCESS_SECRET="your_access_secret"
JWT_REFRESH_SECRET="your_refresh_secret"

SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your@gmail.com"
SMTP_PASSWORD="app_password"

ESKIZ_EMAIL="your@email.com"
ESKIZ_PASSWORD="eskiz_password"
ESKIZ_SENDER="4546"

CREATOR_USERNAME="creator"               # login uchun (3–30 belgi: a-z, 0-9, _ .)
CREATOR_PHONE="+998901234567"
CREATOR_PASSWORD="StrongPass123!"
CREATOR_NAME="Creator User"
CREATOR_EMAIL="creator@email.com"

SUPER_ADMIN_USERNAME="superadmin"
SUPER_ADMIN_PHONE="+998907654321"
SUPER_ADMIN_PASSWORD="StrongPass123!"
SUPER_ADMIN_NAME="Super Admin"
SUPER_ADMIN_EMAIL="superadmin@email.com"

FRONTEND_DOMEN="http://localhost:3000"   # CORS uchun ruxsat berilgan origin
NODE_ENV="development"                   # "production" da cookie'lar secure bo'ladi
```

### 3. Database va seed

```bash
# Migrationlarni qo'llash
npx prisma migrate dev

# Boshlang'ich ma'lumotlar (system tenant, creator, super_admin, tenant rollari)
npx prisma db seed
```

Seed **idempotent** — qayta ishga tushirish xavfsiz (qarang: [Seed ma'lumotlari](#seed-malumotlari)).

### 4. Dev server

```bash
npm run start:dev
```

- API: `http://localhost:3031/api`
- Swagger: `http://localhost:3031/api/docs` (login: `kottaAdmin` / `12345`)

---

## Asosiy buyruqlar

```bash
npm run start:dev        # Dev server (watch mode)
npm run build            # Production build
npm run start:prod       # Production start
npm run lint             # ESLint + autofix
npm run format           # Prettier

# Prisma
npx prisma migrate dev --name <migration_name>
npx prisma generate      # Client → src/generated/prisma
npx prisma db seed
npx prisma studio        # DB GUI — localhost:5555

# Testing
npm run test
npm run test:watch
npm run test:cov
npm run test:e2e
```

---

## Arxitektura

### Multi-Tenancy

Barcha ma'lumotlar `tenantId` bo'yicha izolyatsiya qilingan. Controllerda `@TenantContext()` dekoratori ishlatiladi:

- **Oddiy foydalanuvchilar** (admin, teacher, student): tokendan avtomatik
- **Elevated rollar** (super_admin, creator): URL params yoki `?tenantId=...` query'dan (majburiy)

Tenant turi (`Tenant.type`): `learning_center`, `school`, `academic_lyceum`, `college`, `university`.

### Rollar

| `name`        | `level` | Qayerda        | Kim yaratadi                |
| ------------- | ------- | -------------- | --------------------------- |
| `creator`     | 100     | system tenant  | seed                        |
| `super_admin` | 90      | system tenant  | seed                        |
| `admin`       | 60      | har bir tenant | `POST /tenants` (avtomatik) |
| `teacher`     | 40      | har bir tenant | `POST /tenants` (avtomatik) |
| `student`     | 20      | har bir tenant | `POST /tenants` (avtomatik) |

- **Rollar faqat backend tomonidan boshqariladi.** API'da faqat `GET /roles` va `GET /roles/:id` bor — create/update/delete ataylab yo'q.
- Tenant yaratilganda 3 ta default rol **bitta atomik nested write**da yaratiladi (tenant rolsiz qolib ketmaydi). Ro'yxat: [src/roles/constants/default-roles.ts](src/roles/constants/default-roles.ts).
- **Rol nomlari (`name`) kod bo'ylab qattiq tekshiriladi** (`@Roles('admin')`, `requesterRole === 'teacher'` va h.k.) — ularni o'zgartirmang. Foydalanuvchiga ko'rinadigan nom — `displayName`.
- `RolesGuard` rol nomini emas, **darajasini (level)** tekshiradi: `@Roles('admin', 'super_admin')` — talab qilingan rollarning eng kichik levelidan yuqori har qanday rol kira oladi. Guard levelni nom bo'yicha **tenantdan qat'i nazar** qidiradi, shuning uchun bir nomdagi rol barcha tenantlarda **bir xil level**ga ega bo'lishi shart.
- `POST /users` / `PATCH /users/:id` da `roleId` userning tenantiga tegishli faol rol bo'lishi tekshiriladi (boshqa tenant rolini berib huquq oshirishning oldi olinadi).

### Autentifikatsiya

- Login **`username` + parol** orqali. `username` butun tizimda unique; `phone` faqat tenant ichida unique (bir odam turli tenantlarda bir xil raqam bilan alohida user bo'la oladi); `email` unique emas, parol tiklash username orqali
- JWT tokenlar **HttpOnly cookie**da saqlanadi (`access_token` 15 daqiqa, `refresh_token` 1 kun)
- `JwtStrategy` cookie'dan token o'qiydi — Authorization header ishlatilmaydi
- Refresh token hash sifatida DB da saqlanadi, logout bo'lganda `null` bo'ladi
- `@CurrentUser('id')`, `@CurrentUser('role')` — `req.user` dan maydon oladi
- Frontend: `credentials: 'include'` (fetch) yoki `withCredentials: true` (axios) bo'lishi shart

### Prisma

Prisma client **custom path**ga generate qilinadi:

```
src/generated/prisma
```

Import doim shu yo'ldan:

```typescript
import { PrismaClient } from '../generated/prisma/client';
```

`PrismaService` `PrismaPg` adapter ishlatadi (`@prisma/adapter-pg`).

### Soft Delete

Deyarli barcha modellarda `isDeleted: Boolean @default(false)` va `deletedAt` bor. Real `DELETE` ishlatilmaydi (yagona istisno — `Tenant.remove`). Barcha query'larda `isDeleted: false` filtr qo'shiladi.

---

## Modul tuzilmasi

Har bir domen o'z modulida: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`.

```
src/
├── auth/                # Login, logout, refresh, JWT strategy
│   ├── decorators/      # @CurrentUser, @TenantContext, @Roles, @Public
│   ├── guards/          # JwtAuthGuard, RolesGuard
│   └── strategies/      # JwtStrategy (cookie)
├── tenant/              # Tenantlar (faqat super_admin) + default rollar va coin qoidalari
├── roles/               # Rollar (faqat o'qish) + DEFAULT_TENANT_ROLES
├── users/               # Foydalanuvchilar (xodimlar, teacherlar, studentlar)
├── students/            # O'quvchilar ro'yxati, profil, statistika
├── teachers/            # O'qituvchi profili va dashboard
├── dashboard/           # Admin dashboard
├── courses/             # Kurslar (maktabda — sinf)
├── subjects/            # Fanlar (ixtiyoriy, asosan maktab uchun)
├── groups/              # Guruhlar, student qo'shish/chiqarish
├── rooms/               # Xonalar
├── schedule/            # Haftalik jadval shablonlari + istisno kunlar + kalendar
├── sessions/            # Darslar, yo'qlama, lock/unlock, avtomatik coin
├── coin-rules/          # Tanga qoidalari (auto/manual, earn/deduct, guruh ustuvorligi) + DEFAULT_TENANT_COIN_RULES
├── coin-transaction/    # Tanga tranzaksiyalari (manual, bulk) + wallet
├── reward-category/     # Sovg'a kategoriyalari
├── rewards/             # Sovg'alar do'koni
├── purchases/           # Xaridlar
├── messages/            # SMS (Eskiz) + email yuborish
├── mail/                # SMTP mailer
├── audit-log/           # Audit trail (kim, qachon, nima qildi)
├── common/
│   ├── filters/         # Prisma exception filter
│   ├── middleware/      # Tenant middleware
│   └── types/           # Umumiy tiplar (auth, coin)
├── prisma/              # PrismaService + seed.ts
└── generated/prisma/    # Prisma client (auto-generated, tahrirlamang)
```

---

## Tanga tizimi (Coin System)

**Asosiy invariant**: Wallet balansi hech qachon to'g'ridan-to'g'ri o'zgartirilmaydi. Faqat `CoinTransaction` orqali `increment`/`decrement` qilinadi (`$transaction` ichida).

`CoinTransactionsService` ikki xil interfeys:

- `createManualTransaction()` — controller chaqiradi (teacher qo'lda beradi; bulk variant ham bor)
- `createInternalTransaction()` — tizim ichki servislari chaqiradi (SessionsService)

**Avtomatik coin logikasi** (`POST /sessions/:id/attendance` → `SessionsService.saveAttendanceAndProcessCoins`):

1. Yo'qlama saqlanadi (`upsert`), sessiya `isChecked: true` bo'ladi
2. `triggerType: auto` va `isActive: true` coin qoidalari topiladi
3. Qoida tanlash ustuvorligi: **guruhga maxsus** qoida (`groupId === session.groupId`) → **tenant-wide** qoida (`groupId: null`) → hardcoded default
4. Har bir o'quvchi uchun shu sessiya bo'yicha avvalgi avtomatik tranzaksiyalar bekor qilinib, joriy holatga mos yangisi yaratiladi — qayta saqlashda **coin dublikat bo'lmaydi**. O'quvchi coinni allaqachon sarflagan bo'lsa, u o'tkazib yuboriladi (`coinsSkippedFor`)

| `sourceType` | `direction` | Nima uchun                    | Qoida bo'lmasa |
| ------------ | ----------- | ----------------------------- | -------------- |
| `attendance` | `earn`      | Darsga kelgani uchun          | 5 coin         |
| `homework`   | `earn`      | Uy vazifasini bajargani uchun | 10 coin        |
| `attendance` | `deduct`    | Sababsiz kelmagani uchun      | jarima yo'q    |

### Asosiy (built-in) coin qoidalari

Tenant yaratilganda (`POST /tenants`) rollar bilan **bitta atomik nested write**da 2 ta asosiy qoida yaratiladi — `isBuiltIn: true`. Ro'yxat: [src/coin-rules/constants/default-coin-rules.ts](src/coin-rules/constants/default-coin-rules.ts).

| `name`      | `sourceType` | `direction` | `triggerType` | Default coin |
| ----------- | ------------ | ----------- | ------------- | ------------ |
| Davomat     | `attendance` | `earn`      | `auto`        | 5            |
| Uyga vazifa | `homework`   | `earn`      | `auto`        | 10           |

- Tenant o'z qoidasida `coinAmount`, `name`, `description` ni o'zgartiradi. `direction`, `triggerType`, `sourceType`, `groupId` o'zgartirilsa — `409`. Asosiy qoidani o'chirib bo'lmaydi (`409`).
- Har bir `sourceType` + `direction` uchun **umumiy** (`groupId: null`) auto qoida tenantda bittadan ortiq bo'lmaydi — dublikat yaratish/ga aylantirish `409`. Guruhga xos qoidalar (`groupId` bilan) cheklanmaydi va umumiy qoidadan ustun turadi.
- Qoida nomi logikada ishlatilmaydi — yo'qlama qoidani `triggerType` + `sourceType` + `direction` bo'yicha topadi.

---

## Dars Jadvali (Schedule)

Jadval tizimi ikki qatlamli:

1. **ScheduleTemplate** — haftalik takrorlanuvchi jadval (masalan, Dushanba 09:00–11:00, 101-xona, ixtiyoriy fan)
2. **ScheduleException** — istisno kunlar (bekor qilinish yoki vaqt o'zgarishi)

**`generate-sessions` API** jadval shablonlari asosida belgilangan sana oralig'ida avtomatik `Session` yozuvlari yaratadi:

- Bekor qilingan istisnolar o'tkazib yuboriladi
- Vaqt o'zgargan istisnolar yangi vaqt bilan yaratiladi
- Allaqachon mavjud sessiyalar qaytadan yaratilmaydi
- Guruhning teacherId'si va shablonning `subjectId`'si sessiyaga nusxalanadi

Qulflangan (`isLocked: true`) sessiyada yo'qlamani o'zgartirib bo'lmaydi, lekin `topic`/`subjectId` kabi metama'lumotlar tahrirlanadi.

---

## Seed ma'lumotlari

`npx prisma db seed` (idempotent, `upsert` asosida):

- `system` slug li System Tenant
- `creator` (level 100) va `super_admin` (level 90) rollari
- Creator va Super Admin userlari (`.env` dagi `CREATOR_*` va `SUPER_ADMIN_*` dan). Mavjud bo'lsa, `username`i `CREATOR_USERNAME` / `SUPER_ADMIN_USERNAME` ga keltiriladi
- **Backfill:** mavjud barcha tenantlarga yetishmayotgan `admin`/`teacher`/`student` rollarini yaratadi va ularning `level`ini standart qiymatga keltiradi
- **Backfill:** har bir tenantda asosiy coin qoidalari (Davomat, Uyga vazifa) bo'lishini ta'minlaydi — mos umumiy auto qoida bo'lsa `isBuiltIn: true` deb belgilaydi (coin miqdori saqlanadi), bo'lmasa default qiymat bilan yaratadi (`createdBy` — super_admin)

---

## Frontend uchun hujjatlar

API o'zgarishlari bo'yicha batafsil qo'llanmalar [docs/](docs/) papkasida:

| Fayl                                                                                            | Mavzu                                                                        |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [api-docs.md](docs/api-docs.md)                                                                 | Umumiy API qo'llanma                                                         |
| [roles-readonly-api.md](docs/roles-readonly-api.md)                                             | Rollar faqat o'qish uchun, tenant bilan avtomatik yaratilishi                |
| [coin-rules-built-in-api.md](docs/coin-rules-built-in-api.md)                                   | Asosiy coin qoidalari (`isBuiltIn`), tenant bilan avtomatik yaratilishi      |
| [subject-fani-api.md](docs/subject-fani-api.md)                                                 | Fanlar (Subject)                                                             |
| [coin-rules-priority-and-session-lock-api.md](docs/coin-rules-priority-and-session-lock-api.md) | Coin qoidalari ustuvorligi, qulflangan sessiya                               |
| [attendance-coin-dedup-and-ischecked-api.md](docs/attendance-coin-dedup-and-ischecked-api.md)   | Yo'qlamada coin dublikati tuzatilishi, `isChecked`                           |
| [bulk-coin-api.md](docs/bulk-coin-api.md)                                                       | Bir nechta o'quvchiga coin berish                                            |
| [students-list-filters-api.md](docs/students-list-filters-api.md)                               | O'quvchilar ro'yxati filtrlari                                               |
| [student-parent-profile-api.md](docs/student-parent-profile-api.md)                             | O'quvchi / ota-ona profili                                                   |
| [teacher-profile-api.md](docs/teacher-profile-api.md)                                           | O'qituvchi profili                                                           |
| [student-dashboard-reward-prices-api.md](docs/student-dashboard-reward-prices-api.md)           | Student dashboard'da sovg'a narxlari oralig'i (GardenPath)                   |
| [username-auth-and-profile-api.md](docs/username-auth-and-profile-api.md)                       | Username bilan login, tenant ichida unique telefon, o'z profilini tahrirlash |

---

## Pre-commit Hook

Husky orqali har commit oldidan ishga tushadi:

```bash
npm run lint && npm run format
```

---

## 📞 Kontakt

- **Yaratuvchi**: Muxammadi Toshtemirov
- **Telefon**: +998(94) 542-63-07
- **Email**: muxammadi0799@gmail.com
- **Telegram**: @Mukhammadi_Dev
