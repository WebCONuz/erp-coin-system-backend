# CLAUDE.md

Loyiha haqida umumiy ma'lumot, buyruqlar, arxitektura va modullar README da:

@README.md

Quyida — kod yozishda buzib bo'lmaydigan qoidalar va README'da yo'q nozik joylar.

## Qat'iy qoidalar

- **Rol nomlari o'zgarmaydi**: `creator`, `super_admin`, `admin`, `teacher`, `student`. Ular kod bo'ylab string sifatida tekshiriladi (`@Roles(...)`, `requesterRole === 'teacher'`, `role: { name: 'student' }`). Yangi tekshiruv yozganda ham shu nomlarni ishlating.
- **Rollar faqat backend'da yaratiladi**: tenant rollari `src/roles/constants/default-roles.ts` dagi `DEFAULT_TENANT_ROLES` dan, `TenantService.create` ichida nested write orqali. Roles API'ga create/update/delete qaytarib qo'shmang. Default rol o'zgarsa — seed backfill'i ham shu konstantadan ishlaydi.
- **Asosiy coin qoidalari** (`isBuiltIn: true`): `src/coin-rules/constants/default-coin-rules.ts` dagi `DEFAULT_TENANT_COIN_RULES` tenant bilan birga shu nested write'da yaratiladi (seed ham backfill qiladi). Ularda `BUILT_IN_LOCKED_FIELDS` (direction, triggerType, sourceType, groupId) o'zgarmaydi va o'chirilmaydi. Tenantda bitta `sourceType`+`direction` uchun umumiy (`groupId: null`) auto qoida bittadan ortiq bo'lmaydi — `SessionsService` qoidani nomi bo'yicha emas, shu kombinatsiya bo'yicha topadi.
- **Level barcha tenantlarda bir xil**: `RolesGuard` DB'ga murojaat qilmaydi — userning leveli `req.user.roleLevel` (JwtStrategy DB'dan o'qiydi), talab qilingan rollar leveli `ROLE_LEVELS` konstantasidan (`src/roles/constants/default-roles.ts`, seed ham shundan yozadi). Yangi rol qo'shilsa — `ROLE_LEVELS` ga ham. `users.service.ts` dagi `MAX_VISIBLE_LEVEL` ham creator=100 / super_admin=90 ga bog'langan — level o'zgartirilsa, u ham moslanishi kerak.
- **Login — `username` bo'yicha** (global unique, doim kichik harf: `src/users/constants/username.ts`). `phone` faqat `@@unique([tenantId, phone])` — telefon bo'yicha `findUnique({ phone })` yozmang, userni telefon orqali qidirsangiz `tenantId` ham bering. `email` unique emas.
- **Wallet balansi faqat `CoinTransaction` orqali** (`$transaction` ichida `increment`/`decrement`). Tizim ichida coin berish — `createInternalTransaction()`. Balansni o'zgartiradigan har bir tx avval hamyonni `CoinTransactionsService.lockWallet()` (`SELECT … FOR UPDATE`) bilan qulflaydi; qulflash tartibi: sessiya → hamyon(lar) id bo'yicha.
- **Coin tranzaksiyasi o'chirilmaydi va soft-delete qilinmaydi** — bekor qilish teskari yozuv (`reversalOfId`) bilan (`reverseInTx`). Statistika/yig'indilarda `EFFECTIVE_COIN_TX_WHERE`, tarix ro'yxatlarida `VISIBLE_COIN_TX_WHERE` (`src/coin-transaction/constants/effective-transaction.ts`). `isDeleted: true` coin yozuvlari — 2026-11 gacha bo'lgan eski bekor qilishlar.
- DB'da `CHECK`: `wallets.balance >= 0`, `coin_transactions.amount > 0`. Qo'lda coin manbasi faqat `manual`/`bonus`; teacher kiritadigan miqdorlarga `assertTeacherCoinLimit()` (tenant `teacherCoinLimit`).
- **Real DELETE yo'q** (faqat `Tenant.remove`) — soft delete: `isDeleted: true`, `deletedAt`. Har bir query'da `isDeleted: false`. `@@unique([tenantId, name])` li modellarda (Subject, RewardCategory) o'chirilgan yozuv nomi `archivedName()` bilan bo'shatiladi (`src/common/utils/soft-delete-unique.ts`) — partial unique index ishlatmang. Bitta boolean ustunga (`isDeleted`/`isActive`) alohida `@@index` qo'shmang.
- **Tenant izolyatsiyasi**: har bir query `tenantId` bilan filtrlanadi. `CoinTransaction`, `Purchase`, `AttendanceRecord` da ham o'z `tenantId` si bor — yaratishda albatta yozing va filtrda `student: { tenantId }` join o'rniga shuni ishlating. `tenantId` controllerda `@TenantContext()` orqali olinadi. Boshqa jadvaldan kelgan ID (`roleId`, `groupId`, ...) shu tenantga tegishliligini tekshiring.
- **`src/generated/prisma` ni tahrirlamang** — `npx prisma generate` bilan qayta yaratiladi. Import: `src/generated/prisma/client`, enumlar: `src/generated/prisma/enums`.

## Nozik joylar

- `@TenantContext()` super_admin/creator uchun `?tenantId=` ni **majburiy** qiladi (yo'q bo'lsa 403). Lekin ayrim servislar (`findOneOrFail`, `students.service`) `requesterRole !== 'super_admin'` bo'lsa tenant filtri qo'yadi — ya'ni super_admin'da tenant filtri yo'q, creator'da bor. Super_admin uchun tekshiruvda query'dagi emas, yozuvning haqiqiy `tenantId` sini ishlating.
- Servis javob formati bir xil emas: ba'zilari `{ status, message, data }`, ba'zilari `{ data, meta }` qaytaradi. Mavjud modul uslubiga moslang.
- Yo'qlama/natija `persistCheck()` orqali bitta tranzaksiyada saqlanadi (sessiya bir marta qulflanadi, o'quvchilar `studentId` tartibida). Uzoq interaktiv tranzaksiyalar uchun `PrismaService` da global `transactionOptions` (timeout 30s) bor.
- Sessiya tekshiruvi logikasi `sessionType` ga emas, `evaluationMode` ga qaraydi (`src/sessions/constants/session-types.ts`). Tekshiruv coinlari `CoinTransactionsService.replaceSessionTransactions()` orqali `AttendanceRecord` upsert bilan bitta `tx` da almashtiriladi — `sessionId` + `SESSION_MANAGED_SOURCE_TYPES` dagi manbali tranzaksiyalar qayta saqlashda bekor qilinadi.
- Sessiya yaratish/generatsiya/shablon sinxronlash `lockTenantSchedule()` (tenant bo'yicha advisory lock) ostida, dublikat (guruh+sana+startTime) va bandlik `findSessionConflict()` bilan tekshiriladi (`src/sessions/utils/session-conflicts.ts`). Partial unique index ishlatilmagan — Prisma uni sxemada ifodalay olmaydi va `migrate dev` o'chirib yuboradi.
- "Bugun"/"hozir" — server vaqti emas, tenant timezone'i: `getTenantTimezone()` + `nowInTimeZone()` (`src/common/utils/tenant-time.ts`). Vaqtlar qat'iy `HH:MM` (`HHMM_REGEX`) va matn sifatida solishtiriladi.
- Shablon yoki istisno o'zgarsa `syncTemplateSessions()` chaqiriladi — kelajakdagi tekshirilmagan `templateId` li sessiyalar moslashadi. Teacher saqlangan yo'qlamani `checkedAt` dan 3 kun tahrirlaydi, o'tgan sanaga sessiyani 7 kungacha yaratadi.
- Yo'qlama holati `AttendanceRecord.status` (present/late/excused/absent); `isPresent` u bilan sinxron saqlanadi (present/late → true) — yangi kod `status` ga qarasin. `late` coini `sourceType: late` qoidasidan, bo'lmasa davomat coini. Yo'qlamaga faqat dars sanasidagi a'zolar (`joinedAt`/`leftAt`, `membersAtSessionDate`).
- Dars generatsiyasi `computeOccurrences()` orqali: shablon `validFrom/validTo`, tenant `Holiday`, istisno (bekor/vaqt/`roomId`/`teacherId`) shu yerda hisobga olinadi — yangi qoida qo'shilsa ham shu yerga.
- Teacher'ning guruhga kirish huquqi — faqat `src/common/utils/teacher-group-access.ts` (`teacherGroupAccessWhere` / `canTeacherAccessGroup`): asosiy o'qituvchi **yoki** guruhda unga sessiya/jadval shabloni biriktirilgan. `group: { teacherId }` deb qo'lda yozmang. Istisno: sessiya yaratish (`SessionsService.create`) faqat asosiy o'qituvchiga.
- `.env` faqat lokal; `.env.example` yo'q.
- Mavjud DB'ga ta'sir qiladigan buyruqlar (`prisma migrate`, `prisma db seed`, yozuvchi SQL) — foydalanuvchi tasdig'isiz ishga tushirilmaydi.

## Ish uslubi

- Foydalanuvchi bilan **o'zbek tilida** muloqot qilinadi; kod izohlari ham o'zbekcha.
- API o'zgarishidan keyin frontend uchun `docs/<mavzu>-api.md` hujjat yoziladi (mavjud `docs/` fayllari uslubida: Base URL, mundarija, request/response misollari, xato holatlari, o'zgarishlar jurnali). README'ga docs jadvali qo'shilmaydi.
- Tekshirish: `npx tsc --noEmit -p tsconfig.json`, `npx eslint <fayllar>`, `npx prettier --write <fayllar>`, `npm test`.
- Testlar — faqat unit (`src/**/*.spec.ts`, DB'siz; Prisma mock bilan). Integratsion/e2e test va test bazasi yo'q — foydalanuvchi qarori. Biznes qoidani o'zgartirsangiz mos `*.spec.ts` ni yangilang; sof logika (coin hisobi, vaqt, ruxsatlar) servisdan `utils/` ga ajratilgan, yangi logikani ham shunday yozing.
- Pre-commit (Husky): `npm run lint && npm run format`.
