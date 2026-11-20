# Audit tuzatish rejasi

Manba: 2026-11-20 dagi to'liq backend audit (H — HIGH, M — MEDIUM, L — LOW).
Har bosqich alohida bajariladi, tekshiriladi va tasdiqdan keyin commit qilinadi.

## Umumiy qoidalar

- Har bosqich oxirida: `npx tsc --noEmit -p tsconfig.json`, `npx eslint <fayllar>`, `npx prettier --write <fayllar>`. `npm test` har bosqichda ishga tushirilmaydi.
- Biznes qoida o'zgarsa — mos `*.spec.ts` yangilanadi; yangi sof logika `utils/` ga yoziladi va unit test bilan qoplanadi.
- API o'zgarishlari frontend uchun bitta faylda yig'iladi: `docs/audit-fixes-api.md` (har bosqichda to'ldiriladi).
- Migration fayllari yoziladi, lekin `prisma migrate` / `db seed` / yozuvchi SQL — faqat foydalanuvchi tasdig'idan keyin.
- Commit qilinmaydi — foydalanuvchi oxirida o'zi tekshirib commit qiladi.
- Production'da Redis va S3 yo'q — ularga tayanadigan yechimlar kiritilmaydi.

---

## 1-bosqich — Tenant izolyatsiyasi va coin oluvchi (H1, H3, M9, L1)

Migration: yo'q.

1. `src/common/utils/student-guard.ts` — `assertActiveStudents(db, tenantId, ids)` (rol `student`, `isActive`, `isDeleted: false`, shu tenant). Unit test.
2. `GroupsService.addStudentsBulk` — ID'lar util orqali tekshiriladi; DTO'ga `ArrayMaxSize(300)` + `ArrayUnique`.
3. `GroupsService.addStudent` — rol tekshiruvi.
4. `GroupsService.create/update` — `teacherId` faqat faol `teacher`/`admin` (sessions bilan bir xil).
5. `CoinTransactionsService.executeCoinProcess` — oluvchi faol student bo'lishi shart.
6. `SessionsService.assertStudentsBelongToSession` — a'zolar shu tenantdagi student bo'lishi sharti (ikki tomonlama himoya).
7. `RewardsService.purchase` — faqat student sotib oladi.
8. Leaderboard va admin dashboard reytingi — faqat studentlar.
9. `GroupsService.findOne` — student uchun qisqartirilgan select (telefon/balanssiz) (M9).
10. `UsersService.findOne` — teacher tekshiruvi `teacherGroupAccessWhere` orqali (L1).

## 2-bosqich — Messages va auth xavfsizligi (H2, M5, M6-logout, L11)

Migration: ehtimol (log jadvallarida `studentId` ixtiyoriy bo'lishi uchun) — tasdiq bilan.

1. Email shablonlarida HTML escape (`message`, `senderName`, `fullName`) — util + test.
2. `SendMessageDto` — ixtiyoriy raqam/email qoladi (ota-ona, lidlar — qaror), `message` uchun `MaxLength`; ixtiyoriy `userId` bilan tenant useriga bog'lash.
3. Har bir yuborish `SmsLog` / `EmailLog` ga yoziladi (izsiz yuborish bo'lmaydi; tenant user bo'lmagan qabul qiluvchi uchun `studentId` nullable).
4. `POST /messages/send` ga alohida throttle; Eskiz `axios` so'rovlariga timeout, 401 da token yangilash.
5. Parol tiklash tokeni `sha256` hash bilan saqlanadi; email fonda yuboriladi (javob vaqti bir xil).
6. `POST /auth/logout` — `@Public`, refresh cookie bo'yicha ishlaydi, cookie'lar doim tozalanadi. (`/auth/refresh` ga alohida throttle qo'yilmadi: u imzolangan JWT talab qiladi, IP bo'yicha limit esa maktab NAT'ida butun sinfni bloklardi — global limit yetarli.)
7. Parol siyosati: min 8, `MaxLength(72)`; bcrypt cost bitta konstantada (login'dagi dummy hash ham — timing orqali username enumeratsiyasi yopildi).
8. **7-bosqichdan ko'chirildi:** ko'p qurilmali sessiya (`RefreshSession`). Sabab — 2-bosqichda yangi topilma: refresh token bcrypt bilan hash qilinardi, bcrypt esa faqat birinchi 72 baytni hisobga oladi — bir userning barcha JWT'larida bu qism bir xil, ya'ni aylantirilgan eski refresh token ham "mos" kelardi (rotatsiya ishlamasdi). Endi sha256 + sessiya jadvali, 30 soniyalik parallel-refresh muhlati, reuse aniqlansa sessiya yopiladi, `POST /auth/logout-all`.

Migration: `20261120120000_refresh_sessions_message_logs` (yozildi, qo'llanmagan).

## 3-bosqich — Validatsiya va sessiya sanasi (M1, M3, L5, L12)

Migration: yo'q.

1. `src/common/dto/pagination-query.dto.ts` (`page`, `limit` `@Max(100)`, `TenantQueryDto` dan meros) — barcha ro'yxat DTO'lari shundan meros oladi.
2. Leaderboard uchun DTO (`limit` `@Max(50)`).
3. `SessionsService.create` — sana bitta o'zgaruvchidan yoziladi; sana maydonlari faqat `YYYY-MM-DD` (create session, holiday, generate, exception).
   Bajarilganda: `IsDateOnly()` — to'liq ISO satr ham qabul qilinadi, lekin faqat sana qismi olinadi (eski klientlarni buzmaslik uchun; kodda `slice(0, 10)` ko'p ishlatilgani — shunday klientlar borligini ko'rsatadi).
4. `RewardsService.create` — bo'sh qiymatlar `null`. Bajarilganda: `stock` default'i ataylab `0` qoldirildi (DTO hujjatida shunday va xavfsizroq — cheksiz sotuv faqat aniq `-1` bilan).
5. Matn maydonlariga `MaxLength` (fullName, topic, note, description) — DB uzunligiga mos.

## 4-bosqich — Tenant timezone (M2)

Migration: yo'q.

1. `tenant-time.ts` — `tenantDayRange(tz, date)` (tenant yarim tunining UTC instant'i), hafta/oy boshi util'lari + testlar.
2. Server vaqtidan foydalanadigan joylarni o'tkazish: `getMyStats`, `students.getMyDashboard`, `teachers.getMyDashboard`, `dashboard.getAdminDashboard`, `groups.getStats`.
3. `getTenantTimezone` uchun qisqa TTL'li in-memory cache.

## 5-bosqich — Audit log (M4)

Migration: ehtimol yo'q (`AuditLog` modeli mavjud; `AuditActionType` ga qiymat qo'shish kerak bo'lsa — migration, tasdiq bilan).

1. `AuditLogService.record(tx, {...})` — chaqiruvchining tx'i ichida.
2. Yoziladigan amallar: qo'lda/bulk coin, qoida qo'llash, tranzaksiyani bekor qilish, user yaratish/rol o'zgartirish/arxivlash/tiklash/parol almashtirish, xarid holati, tenant sozlamalari, sessiya o'chirish/qulfdan chiqarish, xabar yuborish.
3. IP va user-agent controllerdan uzatiladi.

## 6-bosqich — Performance va concurrency (M8, L3, L4, L13, L14)

Migration: yo'q.

1. `persistCheck` — batch: hamyonlarni bitta query bilan qulflash (id tartibida), avvalgi tranzaksiyalarni bitta `findMany`, yangi yozuvlar `createMany`. Qulf tartibi va natija formati saqlanadi; mavjud testlar + yangi testlar.
2. `giveBulkManual` / `applyRuleToStudents` — membership va student tekshiruvi bitta query'da.
3. Guruh sig'imi — group qatori `FOR UPDATE` ostida (L3).
4. Shablon yaratish/yangilash to'qnashuv tekshiruvi `lockTenantSchedule` ostida, `updateTemplate` + sinxronlash bitta tx'da (L4).
5. `getRoster` — takroriy query'lar olib tashlanadi (L13); `getMyAttendance` — `AttendanceRecord.tenantId` (L14).
6. `generateSessions` / `syncTemplateSessions` — oraliq sessiyalari bir marta olinib, to'qnashuv xotirada tekshiriladi.

Bajarilganda qo'shimcha qaror: qayta saqlashda coinlari o'zgarmagan o'quvchiga teskari+yangi juftlik yozilmaydi (tarix shovqini va ortiqcha yozuvlar yo'q). `syncAllTemplateSessions` (dam olish kuni) ham bitta tx'da.

## 7-bosqich — Idempotency va tenant soft delete (M10, M11)

**Migration bor — tasdiq kerak.**

1. `Idempotency-Key` header'i **majburiy** (qaror) — manual, bulk, apply-rule, purchase. Kalit va natija saqlanadi (`@@unique([tenantId, key])`); takroriy kalitda avvalgi natija qaytadi, header bo'lmasa 400. **Frontend API o'zgaradi.**
2. `TenantService.remove` — soft delete (`isDeleted`, `deletedAt`, `isActive: false`); hard delete olib tashlanadi.
3. ~~Ko'p qurilmali sessiya~~ — 2-bosqichda bajarildi.
4. (5-bosqichdan) `audit_logs` endi to'ladi — asosiy so'rov (`tenantId` + `createdAt desc`) uchun composite index; alohida `tenantId` va `createdAt` indekslari o'rniga.

## 8-bosqich — Xatolar va konfiguratsiya (M7, M12, L2, L15)

Migration: yo'q.

1. Env validatsiyasi (`ConfigModule.forRoot({ validate })`, class-validator) — majburiy kalitlar, xatoda boot to'xtaydi.
2. `MailService`, `JwtStrategy`, `PrismaService` — `ConfigService` orqali.
3. Umumiy `@Catch()` filter: yagona xato formati `{ statusCode, message, code?, path }`, 500 da stack faqat logda; P2002 da ustun nomlari o'rniga tushunarli maydon nomi.
4. Request-id + log'larda request-id — 5-bosqichdagi `requestContext` (AsyncLocalStorage, `RequestContextInterceptor`) ga qo'shiladi.
5. `users.service` ro'yxatlarida `isDeleted: false` (L2).

## 9-bosqich — Tozalash va maintainability (L6, L7, L8, L9, L10, L16)

Migration: L10 da bo'lishi mumkin — tasdiq kerak.

1. Xarid — `lockWallet` va narxni tx ichida qayta o'qish (L6).
2. `PATCH /students/:id/status` — holat o'zgartirish; eski `DELETE` vaqtincha qoladi (deprecated) (L7). **Frontend API o'zgaradi.**
3. `uploads/` `.gitignore` ga; avatar almashtirilganda eski fayl o'chiriladi (L8).
4. `tsconfig` — `noImplicitAny: true` (xatolarni tuzatish bilan) (L9).
5. Ishlatilmaydigan modellar/maydonlar (`SmsTemplate`, `EmailTemplate`, `ImportLog`, `RolePermission`, `Role.canDelete/canManage*`) — olib tashlash yoki qoldirish bo'yicha qaror (L10).
6. README'ga migration deploy tartibi (`prisma migrate deploy`).

---

## Qarorlar (2026-11-20)

- Messages — ixtiyoriy raqam/emailga yuborish mumkin (ota-ona, lidlar).
- Bir user bir vaqtda bir nechta qurilmadan kira oladi → `RefreshSession` (2-bosqichda bajarildi).
- Idempotency kaliti — majburiy.
- O'lik modellar (9-bosqich): `RolePermission`, `ImportLog` + `ImportStatus`, `Role.canDelete/canManageAdmins/canManageUsers/isSystem` + `NotificationType` — olib tashlandi; `SmsTemplate`, `EmailTemplate` — qoldirildi.

## Qoldirilganlar

- L16 (wallet balansi bo'yicha tenant reytingi indeksi) — hozirgi hajmda sezilmaydi; o'quvchilar soni o'n minglarga yetganda `wallets` ga `tenantId` (denormalizatsiya) yoki query rejasini ko'rib chiqish.
- Fayllar lokal diskda (`uploads/`) — production'da S3/MinIO yo'q (oldingi qaror); ko'p instance'li deploy'da umumiy disk (volume) kerak.
- `getTenantTimezone` keshi va throttler xotirada — Redis yo'q; bir nechta instance'da limitlar har instance uchun alohida.

## Holat

| Bosqich | Holat |
|---|---|
| 1 | ✅ 2026-11-20 |
| 2 | ✅ 2026-11-20 (migration qo'llanmagan) |
| 3 | ✅ 2026-11-20 |
| 4 | ✅ 2026-11-20 |
| 5 | ✅ 2026-11-20 (migration kerak bo'lmadi) |
| 6 | ✅ 2026-11-20 |
| 7 | ✅ 2026-11-20 (migration qo'llanmagan) |
| 8 | ✅ 2026-11-20 |
| 9 | ✅ 2026-11-20 (migration qo'llanmagan) |
