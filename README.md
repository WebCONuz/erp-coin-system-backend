# ERP Coin System — Backend

O'quv markazlari uchun **multi-tenant gamifikatsiya backend**. O'quvchilar davomat va uy vazifasi asosida avtomatik tanga (coin) oladi, yig'gan tangalarini virtual do'kondan sovg'alarga almashtiradi.

## Stack

|               |                                     |
| ------------- | ----------------------------------- |
| Framework     | NestJS 11                           |
| ORM           | Prisma 7 (PrismaPg adapter)         |
| Database      | PostgreSQL                          |
| Auth          | Passport JWT (HttpOnly cookie)      |
| API Docs      | Swagger (Basic auth)                |
| Validation    | class-validator + class-transformer |
| Upload        | Multer                              |
| Notifications | Gmail SMTP + Eskiz SMS              |

---

## Ishga tushirish

### 1. O'rnatish

```bash
npm install
```

### 2. Environment o'zgaruvchilar

`.env.example` asosida `.env` yarating:

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

CREATOR_PHONE="+998901234567"
CREATOR_PASSWORD="StrongPass123!"
CREATOR_NAME="Creator User"
CREATOR_EMAIL="creator@email.com"

SUPER_ADMIN_PHONE="+998907654321"
SUPER_ADMIN_PASSWORD="StrongPass123!"
SUPER_ADMIN_NAME="Super Admin"
SUPER_ADMIN_EMAIL="superadmin@email.com"

FRONTEND_DOMEN="http://localhost:3000"
NODE_ENV="development"
```

### 3. Database va seed

```bash
# Migration ishga tushirish
npx prisma migrate dev

# Boshlang'ich ma'lumotlar (creator + super_admin)
npx prisma db seed
```

### 4. Dev server

```bash
npm run start:dev
```

API: `http://localhost:3031/api`
Swagger: `http://localhost:3031/api/docs` (login: `kottaAdmin` / `12345`)

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
npx prisma generate
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
- **Elevated rollar** (super_admin, creator): URL params yoki `?tenantId=...` query'dan

### Rol Iyerarxiyasi

```
creator (lv 100) > super_admin (lv 90) > admin > teacher > student
```

`RolesGuard` rol nomini emas, **darajasini (level)** tekshiradi. `@Roles('admin')` yozsangiz — admin va undan yuqori barcha rollar kirishi mumkin.

### Autentifikatsiya

- JWT tokenlar **HttpOnly cookie**da saqlanadi (`access_token` 15 daqiqa, `refresh_token` 1 kun)
- `JwtStrategy` cookie'dan token o'qiydi — Authorization header ishlatilmaydi
- Refresh token hash sifatida DB da saqlanadi, logout bo'lganda `null` bo'ladi
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

Deyarli barcha modellarda `isDeleted: Boolean @default(false)` va `deletedAt` bor. Hech qachon real `DELETE` ishlatilmaydi. Barcha query'larda `isDeleted: false` filtr qo'shiladi.

---

## Modul tuzilmasi

```
src/
├── auth/                # Login, logout, refresh, JWT strategy
├── users/               # Foydalanuvchilar (teacher, admin yaratish)
├── students/            # O'quvchilar CRUD + profil + statistika
├── groups/              # Guruhlar, student qo'shish/chiqarish
├── sessions/            # Darslar, yo'qlama, lock/unlock
├── schedule/            # Haftalik jadval shablonlari + istisno kunlar
│   ├── dto/
│   ├── schedule.controller.ts
│   ├── schedule.service.ts
│   └── schedule.module.ts
├── coin-rules/          # Tanga qoidalari (auto/manual, earn/deduct)
├── coin-transaction/    # Tanga tranzaksiyalari + wallet
├── rewards/             # Sovg'alar do'koni
├── purchases/           # Xaridlar
├── messages/            # SMS + email yuborish
├── audit-log/           # Audit trail (kim, qachon, nima qildi)
├── common/              # Guard, decorator, interceptor, filter
│   ├── decorators/      # @CurrentUser, @TenantContext, @Roles
│   ├── guards/          # JwtAuthGuard, RolesGuard
│   └── filters/         # Global exception filter
├── prisma/              # PrismaService
└── generated/prisma/    # Prisma client (auto-generated)
```

---

## Tanga tizimi (Coin System)

**Asosiy invariant**: Wallet balansi hech qachon to'g'ridan-to'g'ri o'zgartirilmaydi. Faqat `CoinTransaction` orqali `increment`/`decrement` qilinadi (`$transaction` ichida).

`CoinTransactionsService` ikki xil interfeys:

- `createManualTransaction()` — controller chaqiradi (teacher qo'lda beradi)
- `createInternalTransaction()` — tizim ichki servislari chaqiradi (SessionsService)

**Avtomatik coin logikasi** (`SessionsService.saveAttendanceAndProcessCoins`):

1. Yo'qlama saqlanadi
2. `triggerType: auto` va `isActive: true` coin qoidalari topiladi
3. `sourceType` bo'yicha: `attendance earn` → kelganlarga, `homework earn` → uy vazifasi bajarganlarga, `attendance deduct` → kelmanganlarga (jarima, agar qoida mavjud bo'lsa)
4. Har bir student uchun `createInternalTransaction()` chaqiriladi

**Coin qoidalarini to'g'ri sozlash uchun 3 ta qoida yarating:**

```
sourceType: attendance, direction: earn   → Darsga kelgani uchun tanga
sourceType: homework,   direction: earn   → Uy vazifasi uchun tanga
sourceType: attendance, direction: deduct → Darsga kelmagani uchun jarima (optional)
```

---

## Dars Jadvali (Schedule)

Jadval tizimi ikki qatlamli:

1. **ScheduleTemplate** — haftalik takrorlanuvchi jadval (masalan, Dushanba 09:00–11:00, 101-xona)
2. **ScheduleException** — istisno kunlar (bekor qilinish yoki vaqt o'zgarishi)

**`generate-sessions` API** jadval shablonlari asosida belgilangan sana oralig'ida avtomatik `Session` yozuvlari yaratadi:

- Bekor qilingan istisnolar o'tkazib yuboriladi
- Vaqt o'zgargan istisnolar yangi vaqt bilan yaratiladi
- Allaqachon mavjud sessiyalar qaytadan yaratilmaydi
- Guruhning teacherId'si avtomatik olinadi

---

## Seed ma'lumotlari

`npx prisma db seed` quyidagilarni yaratadi:

- `system` slug li System Tenant
- `creator` (level 100) va `super_admin` (level 90) rollari
- Creator va Super Admin userlari (`.env` dagi `CREATOR_*` va `SUPER_ADMIN_*` dan)

---

## Pre-commit Hook

Husky orqali har commit oldidan ishga tushadi:

```bash
npm run lint && npm run format
```
