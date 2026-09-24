# CLAUDE.md

Loyiha haqida umumiy ma'lumot, buyruqlar, arxitektura va modullar README da:

@README.md

Quyida — kod yozishda buzib bo'lmaydigan qoidalar va README'da yo'q nozik joylar.

## Qat'iy qoidalar

- **Rol nomlari o'zgarmaydi**: `creator`, `super_admin`, `admin`, `teacher`, `student`. Ular kod bo'ylab string sifatida tekshiriladi (`@Roles(...)`, `requesterRole === 'teacher'`, `role: { name: 'student' }`). Yangi tekshiruv yozganda ham shu nomlarni ishlating.
- **Rollar faqat backend'da yaratiladi**: tenant rollari `src/roles/constants/default-roles.ts` dagi `DEFAULT_TENANT_ROLES` dan, `TenantService.create` ichida nested write orqali. Roles API'ga create/update/delete qaytarib qo'shmang. Default rol o'zgarsa — seed backfill'i ham shu konstantadan ishlaydi.
- **Asosiy coin qoidalari** (`isBuiltIn: true`): `src/coin-rules/constants/default-coin-rules.ts` dagi `DEFAULT_TENANT_COIN_RULES` tenant bilan birga shu nested write'da yaratiladi (seed ham backfill qiladi). Ularda `BUILT_IN_LOCKED_FIELDS` (direction, triggerType, sourceType, groupId) o'zgarmaydi va o'chirilmaydi. Tenantda bitta `sourceType`+`direction` uchun umumiy (`groupId: null`) auto qoida bittadan ortiq bo'lmaydi — `SessionsService` qoidani nomi bo'yicha emas, shu kombinatsiya bo'yicha topadi.
- **Level barcha tenantlarda bir xil**: `RolesGuard` levelni rol nomi bo'yicha tenant filtrisiz qidiradi. `users.service.ts` dagi `MAX_VISIBLE_LEVEL` ham creator=100 / super_admin=90 ga bog'langan — level o'zgartirilsa, u ham moslanishi kerak.
- **Wallet balansi faqat `CoinTransaction` orqali** (`$transaction` ichida `increment`/`decrement`). Tizim ichida coin berish — `createInternalTransaction()`.
- **Real DELETE yo'q** (faqat `Tenant.remove`) — soft delete: `isDeleted: true`, `deletedAt`. Har bir query'da `isDeleted: false`.
- **Tenant izolyatsiyasi**: har bir query `tenantId` bilan filtrlanadi. `tenantId` controllerda `@TenantContext()` orqali olinadi. Boshqa jadvaldan kelgan ID (`roleId`, `groupId`, ...) shu tenantga tegishliligini tekshiring.
- **`src/generated/prisma` ni tahrirlamang** — `npx prisma generate` bilan qayta yaratiladi. Import: `src/generated/prisma/client`, enumlar: `src/generated/prisma/enums`.

## Nozik joylar

- `@TenantContext()` super_admin/creator uchun `?tenantId=` ni **majburiy** qiladi (yo'q bo'lsa 403). Lekin ayrim servislar (`findOneOrFail`, `students.service`) `requesterRole !== 'super_admin'` bo'lsa tenant filtri qo'yadi — ya'ni super_admin'da tenant filtri yo'q, creator'da bor. Super_admin uchun tekshiruvda query'dagi emas, yozuvning haqiqiy `tenantId` sini ishlating.
- Servis javob formati bir xil emas: ba'zilari `{ status, message, data }`, ba'zilari `{ data, meta }` qaytaradi. Mavjud modul uslubiga moslang.
- `.env` faqat lokal; `.env.example` yo'q.
- Mavjud DB'ga ta'sir qiladigan buyruqlar (`prisma migrate`, `prisma db seed`, yozuvchi SQL) — foydalanuvchi tasdig'isiz ishga tushirilmaydi.

## Ish uslubi

- Foydalanuvchi bilan **o'zbek tilida** muloqot qilinadi; kod izohlari ham o'zbekcha.
- API o'zgarishidan keyin frontend uchun `docs/<mavzu>-api.md` hujjat yoziladi (mavjud `docs/` fayllari uslubida: Base URL, mundarija, request/response misollari, xato holatlari, o'zgarishlar jurnali) va README'dagi docs jadvaliga qo'shiladi.
- Tekshirish: `npx tsc --noEmit -p tsconfig.json`, `npx eslint <fayllar>`, `npx prettier --write <fayllar>`. Loyihada hozircha test (`*.spec.ts`) yo'q.
- Pre-commit (Husky): `npm run lint && npm run format`.
