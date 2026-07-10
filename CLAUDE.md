# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ERP Coin System — o'quv markazlari uchun multi-tenant gamifikatsiya backend. O'quvchilar davomat va uy vazifasi asosida avtomatik tanga (coin) oladi, yig'gan tangalarini virtual do'kondan sovg'alarga almashadi.

**Stack**: NestJS 11, Prisma 7 (PrismaPg adapter), PostgreSQL, Passport JWT (cookie-based)

## Commands

```bash
npm run start:dev        # Dev server (watch mode)
npm run build            # Production build
npm run start:prod       # Production start
npm run lint             # ESLint + autofix
npm run format           # Prettier

# Prisma
npx prisma migrate dev --name <migration_name>   # Yangi migration
npx prisma generate                               # Prisma client regenerate
npx prisma db seed                                # Seed (faqat bir marta)
npx prisma studio                                 # DB GUI (localhost:5555)

# Testing
npm run test             # Unit tests
npm run test:watch       # Watch mode
npm run test:cov         # Coverage
npm run test:e2e         # E2E tests
```

**Pre-commit hook** (Husky): `npm run lint && npm run format` — har commit oldidan ishga tushadi.

## Architecture

### Multi-Tenancy

Barcha ma'lumotlar `tenantId` bo'yicha izolyatsiya qilingan. Controllerda `tenantId` olish uchun `@TenantContext()` dekoratori ishlatiladi:
- Oddiy userlar (admin, teacher, student): tokendan avtomatik olinadi
- Elevated rollar (super_admin, creator): URL params yoki query `?tenantId=...` dan olinadi

### Role Hierarchy (level asosida)

```
creator (100) > super_admin (90) > admin > teacher > student
```

`RolesGuard` rol nomini emas, **darajasini (level)** tekshiradi. `@Roles('admin', 'super_admin')` deb yozilsa, shu darajalardan yuqori bo'lgan har qanday rol kirishi mumkin.

### Authentication

- JWT **HttpOnly cookie**larda saqlanadi (`access_token` 15 daqiqa, `refresh_token` 1 kun)
- `JwtStrategy` cookie'dan token o'qiydi (Authorization header emas)
- Refresh token hash sifatida DB da saqlanadi, logout qilganda null bo'ladi
- `@CurrentUser('id')`, `@CurrentUser('role')` — `req.user` dan field oladi

### Coin System (Core Business Logic)

**Muhim invariant**: Wallet balansi hech qachon to'g'ridan-to'g'ri o'zgartirilmaydi. Faqat `CoinTransaction` orqali `increment`/`decrement` qilinadi (Prisma `$transaction` ichida).

`CoinTransactionsService` ikki xil interfeysi bor:
- `createManualTransaction()` — controller chaqiradi (teacher qo'lda beradi)
- `createInternalTransaction()` — tizim ichki servislari chaqiradi (SessionsService kabi)

**Avtomatik coin**: `SessionsService.saveAttendanceAndProcessCoins()` yo'qlama saqlaganda `triggerType: auto` li `CoinRule`larni topib, har bir kelgan o'quvchiga davomat + uy vazifasi coinlarini beradi.

### Prisma Setup (Muhim!)

Prisma client **standard path emas**, custom outputga generate qilinadi:
```
src/generated/prisma
```

Import har doim shu yo'ldan: `import { PrismaClient } from '../generated/prisma/client'`

`PrismaService` `PrismaPg` adapter ishlatadi (`@prisma/adapter-pg`) — standart direct connection emas.

### Soft Delete Pattern

Deyarli barcha modellar `isDeleted: Boolean @default(false)` va `deletedAt` fieldlariga ega. **Hech qachon real DELETE ishlatilmaydi** (faqat Tenant.remove bundan mustasno). Query filtrlarda har doim `isDeleted: false` qo'shiladi.

### Module Structure

Har bir domain (users, groups, sessions, ...) o'z modulida: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/` papka. Global shared narsalar `src/common/` da.

### Seed Data

`npx prisma db seed` quyidagilarni yaratadi:
- `system` slug li System Tenant
- `creator` (level 100) va `super_admin` (level 90) rollari
- Creator va Super Admin userlari (`.env` dagi CREATOR_* va SUPER_ADMIN_* o'zgaruvchilaridan)

### API Docs (Swagger)

`http://localhost:3031/api/docs` — Basic auth bilan himoyalangan (`kottaAdmin` / `12345`)

Global prefix: `/api`, barcha endpointlar shu prefix bilan boshlanadi.

## Environment Variables

```env
PORT=3031
DATABASE_URL="postgresql://..."
JWT_ACCESS_SECRET="..."
JWT_REFRESH_SECRET="..."
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD   # Gmail SMTP
ESKIZ_EMAIL, ESKIZ_PASSWORD, ESKIZ_SENDER        # SMS service
CREATOR_PHONE, CREATOR_PASSWORD, CREATOR_NAME, CREATOR_EMAIL
SUPER_ADMIN_PHONE, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL
FRONTEND_DOMEN="http://localhost:3000"
NODE_ENV="development"
```
