# Audit tuzatishlari — Frontend API Qo'llanmasi

> **Holati:** yakuniy · 2026-11-20 · 9 bosqichning hammasi (reja: [audit-fix-plan.md](audit-fix-plan.md))

> 2026-11-20 dagi backend auditidan keyingi tuzatishlar. Asosan xavfsizlik va ma'lumotlar yaxlitligi: ayrim so'rovlar endi qat'iyroq tekshiriladi va yangi xato kodlari qaytaradi. Quyida frontendga ta'sir qiladigan har bir o'zgarish keltirilgan.

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie (`access_token`, `refresh_token`) — `withCredentials: true` shart
**Format:** JSON

---

## Mundarija

- [Mavjud frontendni buzadigan o'zgarishlar](#mavjud-frontendni-buzadigan-ozgarishlar)
- [1. Tenant izolyatsiyasi va coin oluvchi](#1-tenant-izolyatsiyasi-va-coin-oluvchi)
  - [1.1 Guruhga o'quvchi qo'shish](#11-guruhga-oquvchi-qoshish)
  - [1.2 Guruh o'qituvchisi](#12-guruh-oqituvchisi)
  - [1.3 Coin faqat faol o'quvchiga](#13-coin-faqat-faol-oquvchiga)
  - [1.4 Sovg'ani faqat o'quvchi sotib oladi](#14-sovgani-faqat-oquvchi-sotib-oladi)
  - [1.5 Reyting va dashboard — faqat o'quvchilar](#15-reyting-va-dashboard--faqat-oquvchilar)
  - [1.6 Student uchun guruh tafsiloti](#16-student-uchun-guruh-tafsiloti)
  - [1.7 Teacher — o'quvchi profili](#17-teacher--oquvchi-profili)
- [2. Autentifikatsiya va xabarlar](#2-autentifikatsiya-va-xabarlar)
  - [2.1 Bir nechta qurilmadan kirish](#21-bir-nechta-qurilmadan-kirish)
  - [2.2 Token yangilash (refresh)](#22-token-yangilash-refresh)
  - [2.3 Chiqish va barcha qurilmalardan chiqish](#23-chiqish-va-barcha-qurilmalardan-chiqish)
  - [2.4 Parol siyosati](#24-parol-siyosati)
  - [2.5 Parolni tiklash](#25-parolni-tiklash)
  - [2.6 Xabar yuborish (SMS / email)](#26-xabar-yuborish-sms--email)
- [3. Validatsiya](#3-validatsiya)
  - [3.1 Sahifalash (`page`, `limit`)](#31-sahifalash-page-limit)
  - [3.2 Sana maydonlari](#32-sana-maydonlari)
  - [3.3 Matn uzunligi](#33-matn-uzunligi)
  - [3.4 Sovg'alar](#34-sovgalar)
- [4. "Bugun" — tenant timezone bo'yicha](#4-bugun--tenant-timezone-boyicha)
- [5. Audit log](#5-audit-log)
- [6. Unumdorlik va parallel so'rovlar](#6-unumdorlik-va-parallel-sorovlar)
- [7. Takroriy so'rovdan himoya (Idempotency-Key) va tenant o'chirish](#7-takroriy-sorovdan-himoya-idempotency-key-va-tenant-ochirish)
  - [7.1 Idempotency-Key](#71-idempotency-key)
  - [7.2 Tenantni o'chirish](#72-tenantni-ochirish)
- [8. Xato javoblari formati va so'rov ID'si](#8-xato-javoblari-formati-va-sorov-idsi)
- [9. Tozalash](#9-tozalash)
- [Deploy eslatmasi](#deploy-eslatmasi)
- [Xato holatlari](#xato-holatlari)
- [O'zgarishlar jurnali](#ozgarishlar-jurnali)

---

## Mavjud frontendni buzadigan o'zgarishlar

| # | O'zgarish | Avval | Endi | Bo'lim |
| --- | --- | --- | --- | --- |
| 1 | `POST /groups/:id/students/bulk` — boshqa tenant useri, xodim yoki arxivlangan o'quvchi ID'si | qo'shilardi | `400 STUDENTS_NOT_FOUND` (hech kim qo'shilmaydi) | [1.1](#11-guruhga-oquvchi-qoshish) |
| 2 | `POST /groups/:id/students/bulk` — takroriy ID yoki 300 tadan ko'p | `409` / qabul qilinardi | `400` (validatsiya) | [1.1](#11-guruhga-oquvchi-qoshish) |
| 3 | `POST /groups/:id/students` — xodim yoki arxivlangan o'quvchi | qo'shilardi | `404` | [1.1](#11-guruhga-oquvchi-qoshish) |
| 4 | `POST/PATCH /groups` — `teacherId` student yoki nofaol user | saqlanardi | `404` | [1.2](#12-guruh-oqituvchisi) |
| 5 | Qo'lda coin (`manual`, `bulk-manual`, `apply-rule`) — oluvchi xodim yoki arxivlangan o'quvchi | coin berilardi | `404` (bulk'da — shu element `success: false`) | [1.3](#13-coin-faqat-faol-oquvchiga) |
| 6 | `POST /rewards/:id/purchase` — student bo'lmagan user | xarid yaratilardi | `403` | [1.4](#14-sovgani-faqat-oquvchi-sotib-oladi) |
| 7 | `GET /groups/:id` (student) — guruhdoshlar telefoni | ko'rinardi | `phone: null` | [1.6](#16-student-uchun-guruh-tafsiloti) |
| 8 | Deploy'dan keyin | — | **barcha userlar bir marta qayta login qiladi** (eski refresh tokenlar va tiklash havolalari yaroqsiz) | [Deploy eslatmasi](#deploy-eslatmasi) |
| 9 | `POST /auth/refresh` — cookie yo'q / user topilmadi | `400` / `404` | `401` | [2.2](#22-token-yangilash-refresh) |
| 10 | Yangi parol (`POST /users`, `PATCH /users/:id/change-password`, `POST /auth/reset-password`) — 6–7 belgi | qabul qilinardi | `400` — kamida 8, ko'pi bilan 72 belgi | [2.4](#24-parol-siyosati) |
| 11 | `POST /messages/send` — bo'sh yoki takroriy `channels`, 2000 belgidan uzun `message` | qabul qilinardi | `400` | [2.6](#26-xabar-yuborish-sms--email) |
| 12 | `POST /messages/send` — tez-tez yuborish | cheklanmagan (global limit) | `429` — soniyada 1, daqiqada 20 | [2.6](#26-xabar-yuborish-sms--email) |
| 13 | Email xabaridagi HTML teglar | HTML sifatida ko'rinardi | oddiy matn sifatida ko'rinadi | [2.6](#26-xabar-yuborish-sms--email) |
| 14 | Ro'yxatlar — `limit` 100 dan katta, `page`/`limit` kasr son | qabul qilinardi | `400` | [3.1](#31-sahifalash-page-limit) |
| 15 | `GET /coin-transactions/leaderboard?limit=` — 50 dan katta yoki son emas | qabul qilinardi / `400` (Prisma) | `400` (validatsiya) | [3.1](#31-sahifalash-page-limit) |
| 16 | Sana maydoni — mavjud bo'lmagan sana (`2026-02-30`) yoki noto'g'ri format | ba'zan qabul qilinardi | `400` | [3.2](#32-sana-maydonlari) |
| 17 | Uzun matnlar (tavsif > 1000, mavzu > 300, ism > 150, qidiruv > 100 belgi) | qabul qilinardi yoki `400 "So'rovni bajarib bo'lmadi"` | `400` aniq xabar bilan | [3.3](#33-matn-uzunligi) |
| 18 | Sovg'a: `categoryId` UUID emas; `imageUrl` — `http://`, `data:` va h.k. | qabul qilinardi / DB xatosi | `400` | [3.4](#34-sovgalar) |
| 19 | Sovg'a: `description`, `imageUrl` berilmasa | `""` | `null` | [3.4](#34-sovgalar) |
| 20 | `GET /students/me/dashboard` — `wallet.weekDelta` | yakshanbadan boshlanuvchi hafta | **dushanbadan** boshlanuvchi hafta | [4](#4-bugun--tenant-timezone-boyicha) |
| 21 | Yo'qlamani o'zgartirmasdan qayta saqlash — coin tarixi | har bir o'quvchiga teskari + yangi yozuv juftligi | yozuv qo'shilmaydi (faqat o'zgargan o'quvchilarda) | [6](#6-unumdorlik-va-parallel-sorovlar) |
| 22 | `POST /coin-transactions/manual`, `/bulk-manual`, `/apply-rule`, `POST /rewards/:id/purchase` — `Idempotency-Key` header'isiz | `200`/`201` | **`400 IDEMPOTENCY_KEY_REQUIRED`** | [7.1](#71-idempotency-key) |
| 23 | `DELETE /tenants/:id` (super_admin) | butunlay o'chirardi (ko'pincha DB xatosi bilan yiqilardi) | soft delete — `GET /tenants` da ko'rinmaydi, slug bo'shaydi | [7.2](#72-tenantni-ochirish) |
| 24 | Takrorlangan qiymat (`409`) xabari | `"Bu tenant_id, phone allaqachon mavjud"` | `"Telefon raqam allaqachon mavjud"`, `code: "DUPLICATE_VALUE"`, `fields: ["phone"]` | [8](#8-xato-javoblari-formati-va-sorov-idsi) |
| 25 | Boshqa DB xatolari | `400`, `code: "P2003"` kabi Prisma kodi | holatga mos status va o'qiladigan `code` (jadval) | [8](#8-xato-javoblari-formati-va-sorov-idsi) |
| 26 | `role` obyekti (`/auth/me`, `/users`, `/roles/:id` va h.k.) — `canDelete`, `canManageAdmins`, `canManageUsers`, `isSystem`; `/roles/:id` — `permissions` | bor edi (hech qayerda ishlatilmasdi, `permissions` doim `[]`) | **yo'q** | [9](#9-tozalash) |
| 27 | O'quvchi holatini o'zgartirish | `DELETE /students/:id` (body bilan) | **`PATCH /students/:id/status`** (DELETE vaqtincha ishlaydi, eskirgan) | [9](#9-tozalash) |

---

## 1. Tenant izolyatsiyasi va coin oluvchi

### 1.1 Guruhga o'quvchi qo'shish

`POST /groups/:id/students/bulk` (admin)

```json
{ "studentIds": ["c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33", "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44"] }
```

- Har bir ID **shu tenantdagi faol student** bo'lishi shart. Bittasi mos kelmasa ham **hech kim qo'shilmaydi**:

```json
{
  "statusCode": 400,
  "message": "Ayrim o'quvchilar topilmadi yoki faol emas",
  "code": "STUDENTS_NOT_FOUND",
  "studentIds": ["d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44"]
}
```

  `studentIds` — mos kelmagan ID'lar; frontend ularni ro'yxatda belgilab ko'rsatishi mumkin. Boshqa tenant useri, xodim va arxivlangan o'quvchi bir xil javob oladi.
- Massiv: 1–300 ta, takrorsiz. Aks holda `400` (class-validator xabari).

`POST /groups/:id/students` (admin, bitta o'quvchi) — `studentId` faol student bo'lmasa `404 "O'quvchi topilmadi"`.

### 1.2 Guruh o'qituvchisi

`POST /groups`, `PATCH /groups/:id` — `teacherId` shu tenantdagi **faol `teacher` yoki `admin`** bo'lishi kerak (sessiya va jadval shablonidagi bilan bir xil). Aks holda `404 "O'qituvchi topilmadi"`.

Frontend: o'qituvchi tanlash ro'yxati `GET /users/teachers?isActive=true` (yoki admin rolidagi xodimlar) dan olinsin.

### 1.3 Coin faqat faol o'quvchiga

`POST /coin-transactions/manual`, `POST /coin-transactions/bulk-manual`, `POST /coin-transactions/apply-rule`

- Oluvchi shu tenantdagi **faol student** bo'lishi shart. Admin o'ziga, boshqa xodimga yoki arxivlangan o'quvchiga coin bera olmaydi.
- `manual` — `404 "O'quvchi topilmadi"`.
- `bulk-manual` / `apply-rule` — so'rov bajariladi, mos kelmagan o'quvchi natijada:

```json
{ "studentId": "…", "success": false, "direction": "earn", "error": "O'quvchi topilmadi" }
```

Yo'qlama va natijalarda ham faqat dars sanasida guruhda bo'lgan **shu tenantdagi studentlar** hisobga olinadi (`GET /sessions/:id/roster` ro'yxati shunga mos).

### 1.4 Sovg'ani faqat o'quvchi sotib oladi

`POST /rewards/:id/purchase` — student bo'lmagan user uchun `403 "Sovg'ani faqat o'quvchi sotib oladi"`. Frontend: "Sotib olish" tugmasini faqat student roliga ko'rsating.

### 1.5 Reyting va dashboard — faqat o'quvchilar

- `GET /coin-transactions/leaderboard` — faqat faol studentlar (avval xodimlar ham 0 balans bilan chiqishi mumkin edi).
- `GET /dashboard/admin` — `leaderboard` faqat faol studentlar; `coinEconomy.totalInCirculation` faqat o'quvchilar hamyonlari yig'indisi.

Javob formati o'zgarmagan.

### 1.6 Student uchun guruh tafsiloti

`GET /groups/:id` student so'rasa — boshqa o'quvchilarning `student.phone` maydoni `null` qaytadi (o'ziniki ko'rinadi). Admin va teacher uchun o'zgarish yo'q.

### 1.7 Teacher — o'quvchi profili

`GET /users/:id` (teacher) — endi o'rinbosar o'qituvchi (guruhda unga sessiya yoki jadval shabloni biriktirilgan) ham shu guruh o'quvchisini ko'ra oladi (avval faqat asosiy o'qituvchi; `GET /students` ro'yxati bilan bir xil qoida). Avval `403` bo'lgan holatlar endi `200`.

---

## 2. Autentifikatsiya va xabarlar

### 2.1 Bir nechta qurilmadan kirish

Har bir `POST /auth/login` — alohida **qurilma sessiyasi**. Boshqa qurilmada login qilish avvalgi qurilmani chiqarib yubormaydi (masalan, o'quvchi darsda telefonidan, ota-onasi uydan bir vaqtda kiradi).

- Bitta userda bir vaqtda ko'pi bilan **10 ta** faol sessiya; 11-login eng uzoq ishlatilmagan sessiyani yopadi.
- Sessiya **1 kun** ishlatilmasa tugaydi. Har bir refresh muddatni 1 kunga uzaytiradi.
- Request/response formati o'zgarmagan.

### 2.2 Token yangilash (refresh)

`POST /auth/refresh` — format o'zgarmagan (`{ "message": "Token yangilandi" }`), refresh token har safar almashtiriladi.

- Bir nechta tab bir vaqtda refresh qilsa — hammasi `200` oladi (30 soniyalik muhlat). Shunga qaramay refresh so'rovlarini bitta umumiy promise'ga yig'ish tavsiya etiladi.
- Eski (allaqachon almashtirilgan) refresh token muhlatdan keyin qayta ishlatilsa — token o'g'irlangan deb hisoblanadi va **faqat shu qurilma sessiyasi** yopiladi.
- Barcha muvaffaqiyatsiz holatlar endi `401`:

```json
{ "statusCode": 401, "message": "Sessiya tugagan. Qayta kiring", "error": "Unauthorized" }
```

  Frontend: refresh `401` qaytarsa — login sahifasiga yo'naltiring (avval `400`/`404` ham kelishi mumkin edi).

### 2.3 Chiqish va barcha qurilmalardan chiqish

`POST /auth/logout` — **faqat joriy qurilma** yopiladi. Access token talab qilinmaydi: muddati o'tgan bo'lsa ham refresh cookie bo'yicha ishlaydi va doim `200` qaytaradi, cookie'lar tozalanadi.

```json
{ "message": "Muvaffaqiyatli chiqildi" }
```

**Yangi:** `POST /auth/logout-all` (tizimga kirgan har qanday user) — barcha qurilmalardagi sessiyalar yopiladi, joriy cookie'lar tozalanadi. Boshqa qurilmalardagi access token ko'pi bilan 15 daqiqa amal qilib turadi, keyin refresh `401` beradi.

```json
{ "message": "Barcha qurilmalardan chiqildi" }
```

Parol o'zgartirilganda, tiklanganda, user (o'quvchi) arxivlanganda yoki o'chirilganda — uning **barcha** sessiyalari avtomatik yopiladi.

### 2.4 Parol siyosati

Yangi parol: **8–72 belgi**. Qo'llanadi:

- `POST /users` — `password`
- `PATCH /users/:id/change-password` — `newPassword`
- `POST /auth/reset-password` — `newPassword`

```json
{ "statusCode": 400, "message": ["Parol kamida 8 belgidan iborat bo'lishi kerak"], "error": "Bad Request" }
```

`POST /auth/login` da uzunlik tekshirilmaydi — avval 6–7 belgili parol qo'ygan userlar kira oladi (parolni almashtirganda yangi siyosat qo'llanadi).

### 2.5 Parolni tiklash

- `POST /auth/forgot-password` — javob o'zgarmagan, endi tezroq qaytadi (email fonda yuboriladi; SMTP xatosi `500` emas).
- Emaildagi havola formati o'zgarmagan: `<FRONTEND_DOMEN>/reset-password?token=...`.
- Deploy'dan oldin yuborilgan tiklash havolalari yaroqsiz (`400 "Token yaroqsiz yoki muddati o'tgan"`) — qaytadan so'rash kerak.

### 2.6 Xabar yuborish (SMS / email)

`POST /messages/send` (admin, super_admin — `?tenantId=` bilan)

```json
{
  "channels": ["sms", "email"],
  "recipientPhone": "+998901234567",
  "recipientEmail": "parent@example.com",
  "userId": "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
  "subject": "Dars jadvali o'zgardi",
  "message": "Ertangi dars 10:00 ga ko'chirildi."
}
```

| Maydon | Majburiy | Izoh |
| --- | --- | --- |
| `channels` | ha | `sms` / `email`, kamida 1 ta, takrorsiz |
| `recipientPhone` | `sms` bo'lsa | `+998XXXXXXXXX` — ixtiyoriy raqam (ota-ona, lid) |
| `recipientEmail` | `email` bo'lsa | ixtiyoriy email, ≤150 belgi |
| `userId` | yo'q | **yangi.** Qabul qiluvchi tenant useri bo'lsa (o'quvchi yoki uning ota-onasi uchun — o'quvchi ID'si) — logda bog'lanadi. Boshqa tenant useri — `404` |
| `subject` | yo'q | **yangi.** Email mavzusi, ≤200 belgi. Berilmasa: `CoinLearn — <yuboruvchi> dan xabar` |
| `message` | ha | ≤2000 belgi, **oddiy matn** (HTML teglar matn sifatida ko'rinadi, qator ko'chishi saqlanadi) |

Javob formati o'zgarmagan:

```json
{
  "message": "Xabar qisman yuborildi",
  "results": [
    { "channel": "sms", "success": true },
    { "channel": "email", "success": false, "error": "Email yuborilmadi" }
  ]
}
```

- `error` endi umumiy matn (`SMS yuborilmadi` / `Email yuborilmadi`). Tafsilot server logida va SMS/email logida saqlanadi.
- Qabul qiluvchilar yuborishdan **oldin** tekshiriladi — avval SMS yuborilib, keyin email uchun `400` qaytadigan holat endi yo'q.
- Limit: soniyada 1, daqiqada 20 so'rov — oshsa `429 "Juda ko'p urinish..."`. Ommaviy yuborish uchun frontend so'rovlarni navbat bilan jo'natsin.

---

## 3. Validatsiya

### 3.1 Sahifalash (`page`, `limit`)

Barcha ro'yxat endpointlarida `page` ≥ 1 va `limit` 1–**100** — butun son. Standart qiymatlar o'zgarmagan (har bir endpointda avvalgidek 10 yoki 20).

Qo'llanadi: `GET /coin-rules`, `/coin-transactions/history`, `/coin-transactions/my-history`, `/courses`, `/groups`, `/purchases`, `/rewards`, `/roles`, `/rooms`, `/sessions`, `/sessions/me/attendance`, `/subjects` (`/users`, `/students`, `/schedule`, `/audit-logs` da avvaldan cheklangan edi).

```json
{ "statusCode": 400, "message": ["limit must not be greater than 100"], "error": "Bad Request" }
```

`GET /coin-transactions/leaderboard` — `limit` 1–**50** (standart 10).

### 3.2 Sana maydonlari

Kalendar sanasi bo'lgan maydonlar — **`YYYY-MM-DD`**, haqiqiy sana bo'lishi shart (`2026-02-30` → `400`):

| Endpoint | Maydonlar |
| --- | --- |
| `POST /sessions` | `sessionDate` |
| `GET /sessions` | `date` |
| `GET /sessions/me/attendance` | `from`, `to` |
| `POST /holidays`, `GET /holidays` | `date`; `from`, `to` |
| `POST /schedule/generate-sessions` | `fromDate`, `toDate` |
| `POST/PATCH /schedule` (shablon) | `validFrom`, `validTo` |
| `POST/PATCH` istisno | `exceptionDate` |
| `GET /audit-logs` | `fromDate`, `toDate` |

```json
{ "statusCode": 400, "message": ["Sana formati YYYY-MM-DD bo'lishi kerak (masalan 2026-11-20)"], "error": "Bad Request" }
```

Moslik uchun to'liq ISO satr (`2026-11-20T02:00:00+05:00`) ham qabul qilinadi, lekin **faqat birinchi 10 belgi** (yozilgan kalendar sana) olinadi — UTC ga aylantirilmaydi. Tavsiya: frontend faqat `YYYY-MM-DD` yuborsin (`new Date().toISOString()` UTC sanasini beradi — Toshkentda 00:00–05:00 oralig'ida kechagi kun chiqadi).

Tuzatilgan xato: `POST /sessions` da vaqtli sana yuborilganda dublikat/bandlik bir sanada tekshirilib, dars boshqa sanaga yozilishi mumkin edi — endi tekshiruv va saqlash doim bir xil sanada.

### 3.3 Matn uzunligi

| Maydon | Chegara |
| --- | --- |
| `description` (kurs, fan, xona, sovg'a) | 1000 |
| `topic` (sessiya) | 300 |
| `note` (jadval istisnosi) | 300 |
| `fullName` (`POST /users`) | 150, bo'sh bo'lmasin |
| `email` (`POST /users`, `PATCH /users/:id`, `PATCH /users/me`) | 150 |
| `search` (ro'yxat filtrlari) | 100 |

Avval bunday qiymatlar DB xatosiga (`400 "So'rovni bajarib bo'lmadi"`) olib kelardi yoki cheksiz saqlanardi — endi tushunarli validatsiya xabari qaytadi.

### 3.4 Sovg'alar

`POST /rewards`, `PATCH /rewards/:id`:

- `categoryId` — UUID (`GET /rewards?categoryId=` ham).
- `imageUrl` — `/uploads/...` yoki `https://...`, ≤500 belgi. Bo'sh satr `""` — rasmni olib tashlash.
- `rewardType` — `privilege` / `physical` / `digital`.
- `description` yoki `imageUrl` berilmasa — javobda `null` (avval `""`).
- `stock` berilmasa — avvalgidek `0` (admin zaxirani kiritmaguncha sotilmaydi); cheksiz uchun `-1` yuboring.

---

## 4. "Bugun" — tenant timezone bo'yicha

Dashboard va statistikalardagi "bugun", "shu hafta", "shu oy", "oxirgi N kun" endi **tenant timezone'i** (`GET /tenant-settings` → `timezone`, standart `Asia/Tashkent`) bo'yicha hisoblanadi. Avval server vaqti ishlatilardi: server UTC'da bo'lsa, Toshkentda har kuni 00:00–05:00 oralig'ida "bugungi darslar" va grafiklar bir kunga siljirdi. Sessiyalar va yo'qlama allaqachon tenant vaqtida ishlardi.

Javob formatlari o'zgarmagan. Ta'sir qiladigan endpointlar:

| Endpoint | Nima o'zgardi |
| --- | --- |
| `GET /students/me/dashboard` | `todaySessions`, `upcomingSessions`, `attendance.last30Days`, `wallet.weekDelta` / `monthDelta` — tenant kunlari. `weekDelta` — **dushanbadan** boshlanadigan hafta (avval yakshanbadan) |
| `GET /teachers/me/dashboard` | `todaySessions`, `upcomingSessions`, `pendingAttendanceSessions` |
| `GET /dashboard/admin` | `todaySessionsCount`, `pendingAttendanceSessions`, `earnedThisMonth` / `deductedThisMonth`, `weeklyTrend` |
| `GET /groups/:id/stats` | `avgBalance.trend`, `weeklyActivity` |
| `GET /coin-transactions/my-stats` | `buckets` (`from` / `to`) — oxirgi bucket tenantdagi bugun bilan tugaydi |
| `GET /coin-transactions/my-history` | `from` / `to` `YYYY-MM-DD` ko'rinishida bo'lsa — tenant kunining boshidan / oxirigacha (`to` kiradi) |
| `GET /audit-logs` | `fromDate` / `toDate` — tenant kunlari (`toDate` kiradi) |

Grafiklardagi sanalar (`date`, `from`, `to`) — tenant mahalliy kalendar sanasi (`YYYY-MM-DD`).

Timezone `PATCH /tenant-settings` orqali o'zgartirilsa — ko'pi bilan 1 daqiqada hamma joyda kuchga kiradi.

---

## 5. Audit log

`GET /audit-logs` (admin, super_admin) avval doim bo'sh qaytardi — hech qanday amal yozilmasdi. Endi quyidagi amallar yoziladi (request/response formati o'zgarmagan).

| Amal | `actionType` | `entityType` | `entityId` | `changes` (asosiy maydonlar) |
| --- | --- | --- | --- | --- |
| Qo'lda coin (`POST /coin-transactions/manual`) | `coin_transaction` | `CoinTransaction` | tranzaksiya | `studentId`, `amount`, `direction`, `sourceType`, `ruleId`, `groupId`, `sessionId` |
| Bulk coin / qoidani qo'llash | `coin_transaction` | `CoinOperation` | operatsiya ID'si | `kind` (`bulk_manual` / `apply_rule`), `amount`, `direction`, `transactions[]` (`studentId`, `transactionId`), `failedCount` |
| Tranzaksiyani bekor qilish | `coin_transaction` | `CoinTransaction` | asl tranzaksiya | `operation: "cancel"`, `reversalTransactionId`, `amount`, `direction` |
| Coin qoidasi yaratish / tahrirlash / o'chirish | `create` / `update` / `delete` | `CoinRule` | qoida | yuborilgan maydonlar, `before` |
| User yaratish | `create` | `User` | user | `username`, `fullName`, `role` |
| User tahrirlash | `update` (rol o'zgarsa `assign`) | `User` | user | yuborilgan maydonlar; rol o'zgarsa `roleFrom`, `roleTo` |
| Parol o'zgartirish | `update` | `User` | user | `field: "password"`, `self` (o'zinikimi) |
| User arxivlash / tiklash | `archive` / `restore` | `User` | user | `username` |
| O'quvchi arxivlash / o'chirish / tiklash (`DELETE /students/:id`) | `archive` / `delete` / `restore` | `User` | o'quvchi | `username`, `isActive`, `isDeleted` |
| Xarid holati | `approve` / `update` (topshirildi) / `reject` (bekor) | `Purchase` | xarid | `from`, `to`, `studentId`, `rewardId`, `coinSpent`, `restock` |
| Sessiya qulflash / qulfdan chiqarish | `update` | `Session` | sessiya | `isLocked` |
| Sessiya o'chirish | `delete` | `Session` | sessiya | `keepCoins`, `reversedTransactions`, `sessionDate`, `groupId` |
| Tenant sozlamalari (`PATCH /tenant-settings`) | `update` | `Tenant` | tenant | `settings`, `before` |
| SMS / email yuborish | `sms_sent` / `email_sent` | `SmsLog` / `EmailLog` | log yozuvi | `userId`, `messageLength` |
| Tenant yaratish / tahrirlash / faollashtirish (super_admin) | `create` / `update` / `archive` / `restore` | `Tenant` | tenant | yuborilgan maydonlar |

- Har bir yozuvda: amalni bajargan user (`createdByUser`), vaqt, IP manzil (`ipAddress`), brauzer (`userAgent`).
- Parol, token kabi maxfiy qiymatlar `changes` ga yozilmaydi.
- Coin, xarid, sessiya, qoida, parol, arxivlash amallari audit bilan **bitta tranzaksiyada** saqlanadi — amal bo'lsa, izi ham bor.
- Filtrlar: `actionType`, `entityType` (jadvaldagi qiymatlar), `entityId` (masalan bitta o'quvchi yoki xarid tarixi), `userId` (kim bajargan), `fromDate` / `toDate`.

Frontend tavsiyasi: o'quvchi/xarid sahifasida "Tarix" bo'limi — `GET /audit-logs?entityId=<id>`.

---

## 6. Unumdorlik va parallel so'rovlar

Request/response formatlari o'zgarmagan. Frontend sezadigan farqlar:

**Yo'qlama / natijani saqlash** (`POST /sessions/:id/attendance`, `/results`) — butun guruh endi o'quvchilar soniga bog'liq bo'lmagan so'rovlar bilan saqlanadi (300 kishilik guruh ham tez).
- Qayta saqlashda **coinlari o'zgarmagan o'quvchiga yozuv qo'shilmaydi** — avval har safar har bir o'quvchiga "bekor qilindi" + "berildi" juftligi tushardi. Coin tarixi toza qoladi; o'zgargan o'quvchilarda avvalgidek teskari yozuv + yangisi.
- Shu sababli coinlari o'zgarmagan o'quvchi uchun `coinsSkippedFor` da `COINS_ALREADY_SPENT` endi chiqmaydi (o'zgarish bo'lmasa, qaytaradigan narsa yo'q).
- Holati o'zgarmagan yo'qlama yozuvi qayta yozilmaydi (`recordedAt` / yozgan o'qituvchi saqlanadi).

**Bulk coin** (`POST /coin-transactions/bulk-manual`, `/apply-rule`) — barcha o'quvchilar bitta tranzaksiyada. Javob formati va har bir o'quvchi bo'yicha xato matnlari o'zgarmagan.

**Guruhga qo'shish** (`POST /groups/:id/students`, `/bulk`) — bir vaqtda kelgan so'rovlar guruh sig'imidan (`maxStudents`) oshira olmaydi: oshib ketadigan so'rov `400 "Guruhda joy yetarli emas…"` oladi (avval ikkalasi ham o'tib ketishi mumkin edi).

**Jadval:**
- `POST /schedule/generate-sessions` — `conflicts` endi shu so'rovda yaratilayotgan darslar orasidagi to'qnashuvni ham ko'rsatadi (masalan bir o'qituvchining ikki shablondagi bir vaqtdagi darslari).
- Shablon va istisnoni yaratish/tahrirlash/o'chirish sessiyalarni moslash bilan **bitta tranzaksiyada** — moslash xato bersa, shablon o'zgarishi ham saqlanmaydi (avval shablon o'zgarib, sessiyalar eski holida qolishi mumkin edi). Parallel ikki so'rov bir slotga ikkita shablon yarata olmaydi (`409 SCHEDULE_CONFLICT`).

---

## 7. Takroriy so'rovdan himoya (Idempotency-Key) va tenant o'chirish

### 7.1 Idempotency-Key

Coin beradigan/ayiradigan va xarid qiladigan so'rovlarda **`Idempotency-Key` header'i majburiy**:

| Endpoint |
| --- |
| `POST /coin-transactions/manual` |
| `POST /coin-transactions/bulk-manual` |
| `POST /coin-transactions/apply-rule` |
| `POST /rewards/:id/purchase` |

Maqsad: tugmani ikki marta bosish, sekin tarmoqda qayta urinish yoki sahifani yangilash coinni ikki marta bermasin / ikki marta sotib olmasin.

**Qoida:** har bir **yangi amal** uchun yangi kalit; **o'sha amalni qayta yuborganda** — o'sha kalit.

```js
// Forma ochilganda (yoki "Saqlash" bosilganda) bir marta yaratiladi
const idempotencyKey = crypto.randomUUID();

await axios.post('/api/coin-transactions/manual', body, {
  withCredentials: true,
  headers: { 'Idempotency-Key': idempotencyKey },
});
// Tarmoq xatosida retry — o'sha `idempotencyKey` bilan.
// Muvaffaqiyatli bo'lgach keyingi amal uchun yangi kalit yarating.
```

- Format: 8–100 belgi, `A-Z a-z 0-9 - _` (UUID mos).
- Kalit har bir user uchun alohida, **24 soat** saqlanadi.

**Javoblar:**

| Holat | Javob |
| --- | --- |
| Birinchi so'rov | odatdagi javob |
| Shu kalit + shu so'rov, avvalgisi tugagan | **avvalgi javobning o'zi** (status va body), amal qayta bajarilmaydi; header `Idempotent-Replayed: true` |
| Shu kalit, avvalgisi hali bajarilmoqda | `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` — biroz kutib, ro'yxatni yangilang |
| Shu kalit, lekin boshqa body/URL | `422 IDEMPOTENCY_KEY_REUSED` — frontend xatosi: yangi amal uchun yangi kalit kerak |
| Header yo'q | `400 IDEMPOTENCY_KEY_REQUIRED` |
| Noto'g'ri format | `400 IDEMPOTENCY_KEY_INVALID` |
| Amal xato bilan tugadi (masalan `400` balans yetmaydi) | odatdagi xato; kalit bo'shatiladi — tuzatib, **o'sha kalit** bilan qayta yuborish mumkin |

```json
{
  "statusCode": 400,
  "message": "Idempotency-Key header'i majburiy (har bir yangi amal uchun noyob qiymat, masalan UUID)",
  "code": "IDEMPOTENCY_KEY_REQUIRED"
}
```

`Idempotent-Replayed` header'i CORS orqali o'qiladi (`response.headers['idempotent-replayed']`) — masalan "Bu amal allaqachon bajarilgan" xabarini ko'rsatish uchun.

### 7.2 Tenantni o'chirish

`DELETE /tenants/:id` (super_admin) — endi **soft delete**:

- Tenant `GET /tenants` va `GET /tenants/:id` da ko'rinmaydi (`404`).
- Uning userlari kira olmaydi (login'da `403 TENANT_INACTIVE`), barcha qurilma sessiyalari yopiladi.
- Ma'lumotlar (coin tarixi, yo'qlama, xaridlar) bazada saqlanadi.
- Slug bo'shatiladi — shu slug bilan yangi tenant yaratish mumkin.
- Javob avvalgidek `204`.

Vaqtincha to'xtatish uchun avvalgidek `PATCH /tenants/:id/toggle-active`.

---

## 8. Xato javoblari formati va so'rov ID'si

Barcha xato javoblari bir xil asosga ega (avvalgi maydonlar — `code`, `conflict`, `studentIds`, `limit` va h.k. — saqlangan):

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Username allaqachon mavjud",
  "code": "DUPLICATE_VALUE",
  "fields": ["username"],
  "path": "/api/users",
  "requestId": "3f2c1a9e-7b1d-4c2e-9a77-5d0e8b3c1f42"
}
```

| Maydon | Doim bor | Izoh |
| --- | --- | --- |
| `statusCode`, `error`, `message` | ha | `message` — matn yoki (validatsiyada) matnlar massivi |
| `path` | ha | so'rov URL'i |
| `requestId` | ha | shu so'rov ID'si — javob header'ida ham: `X-Request-Id` |
| `code` | ko'p hollarda | frontend i18n / mantiq uchun barqaror kod |

**So'rov ID'si:** har bir javobda `X-Request-Id` header'i (CORS orqali o'qiladi). Xato ekranida "Xato kodi: …" sifatida ko'rsatish tavsiya etiladi — foydalanuvchi xabar qilganda server logidan aniq topiladi. Frontend o'zi `X-Request-Id` yuborsa (8–64 belgi, `A-Z a-z 0-9 - _`), shu ishlatiladi.

**Ma'lumotlar bazasi xatolari** — endi tushunarli status va kod (ichki tafsilot — jadval/ustun nomlari — chiqmaydi):

| `code` | HTTP | Ma'nosi |
| --- | --- | --- |
| `DUPLICATE_VALUE` | 409 | Takrorlangan qiymat; `fields` — qaysi maydon (`username`, `phone`, `slug`, `name`, `date` …) |
| `RECORD_NOT_FOUND` | 404 | Yozuv topilmadi |
| `RELATED_RECORD_CONSTRAINT` | 409 | Bog'liq yozuv yo'q yoki bu yozuv boshqa joyda ishlatilmoqda |
| `VALUE_TOO_LONG` | 400 | Qiymat juda uzun |
| `CONCURRENT_UPDATE` | 409 | Bir vaqtdagi o'zgarish — qayta urinish mumkin |
| `DATABASE_UNAVAILABLE` | 503 | Baza vaqtincha javob bermayapti — keyinroq qayta urinish |
| `DATABASE_REQUEST_FAILED` | 400 | Boshqa DB xatosi |

Kutilmagan server xatosi — `500`, `message: "Serverda xatolik yuz berdi"` (+ `requestId`).

---

## 9. Tozalash

### 9.1 O'quvchi holati — `PATCH /students/:id/status`

`DELETE /students/:id` body bilan ishlardi — ba'zi proxy va HTTP klientlar DELETE so'rovining body'sini tashlab yuboradi. Yangi endpoint (body, javob va ruxsatlar avvalgidek):

```http
PATCH /students/:id/status
{ "isActive": false }          // arxivlash
{ "isActive": true }           // arxivdan qaytarish
{ "isDeleted": true }          // o'chirish (soft delete)
{ "isDeleted": false }         // tiklash (faqat super_admin)
```

`DELETE /students/:id` vaqtincha ishlaydi (Swagger'da *deprecated*), frontend o'tgach olib tashlanadi.

### 9.2 Rol obyektidan ishlatilmaydigan maydonlar olib tashlandi

`canDelete`, `canManageAdmins`, `canManageUsers`, `isSystem` (rol javoblarida) va `GET /roles/:id` dagi `permissions` (doim bo'sh massiv edi). Ruxsatlar avvalgidek rol `level` i bo'yicha. Frontend bu maydonlarni ishlatgan bo'lsa — `role.level` / `role.name` ga o'ting.

### 9.3 Avatar almashtirilganda eski fayl o'chiriladi

`PATCH /students/:id/avatar`, `PATCH /users/:id`, `PATCH /users/me` da `avatarUrl` o'zgarsa, eski `/uploads/...` fayli (boshqa hech kim ishlatmasa) diskdan o'chiriladi — eski URL `404` qaytaradi. Keshlangan eski URL'ni ko'rsatmang, javobdagi yangi `avatarUrl` dan foydalaning.

---

## Deploy eslatmasi

Migration'lar (`npx prisma migrate deploy`):

| Migration | Ta'siri |
| --- | --- |
| `20261120120000_refresh_sessions_message_logs` | barcha userlar **bir marta qayta login** qiladi (eski refresh tokenlar ishlamaydi — refresh `401` → login sahifasi); deploy'dan oldin yuborilgan parol tiklash havolalari ishlamaydi |
| `20261120130000_idempotency_audit_index` | yangi `idempotency_keys` jadvali, audit log indekslari. Frontend `Idempotency-Key` header'ini backend bilan **bir vaqtda** yuborishni boshlashi kerak (aks holda coin berish va xarid `400`) |
| `20261120140000_remove_unused_models` | ishlatilmaydigan `role_permissions`, `import_logs` jadvallari va rol maydonlari o'chiriladi (rol javobidagi maydonlar — [9.2](#92-rol-obyektidan-ishlatilmaydigan-maydonlar-olib-tashlandi)) |

---

## Xato holatlari

| Kod | HTTP | Qayerda | Ma'nosi |
| --- | --- | --- | --- |
| `STUDENTS_NOT_FOUND` | 400 | `POST /groups/:id/students/bulk` | Ayrim ID'lar shu tenantdagi faol student emas — `studentIds` da ro'yxat |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | coin / xarid POST'lari | `Idempotency-Key` header'i yo'q |
| `IDEMPOTENCY_KEY_INVALID` | 400 | coin / xarid POST'lari | Kalit formati noto'g'ri |
| `IDEMPOTENCY_REQUEST_IN_PROGRESS` | 409 | coin / xarid POST'lari | Shu kalit bilan so'rov hali bajarilmoqda |
| `IDEMPOTENCY_KEY_REUSED` | 422 | coin / xarid POST'lari | Kalit boshqa so'rov uchun ishlatilgan |

---

## O'zgarishlar jurnali

| Sana | Bosqich | O'zgarish |
| --- | --- | --- |
| 2026-11-20 | 1 | Guruhga qo'shishda tenant va rol tekshiruvi, guruh o'qituvchisi roli, coin va xarid faqat faol o'quvchiga, reyting faqat o'quvchilar, student uchun guruhdoshlar telefoni yashirildi, teacher uchun o'quvchi profili ruxsati kengaytirildi |
| 2026-11-20 | 9 | `PATCH /students/:id/status`, rol javobidan ishlatilmaydigan maydonlar olib tashlandi, eski avatar fayli o'chiriladi |
| 2026-11-20 | 8 | Yagona xato formati (`path`, `requestId`), `X-Request-Id` header'i, DB xatolari uchun o'qiladigan kodlar |
| 2026-11-20 | 7 | Majburiy `Idempotency-Key` (coin berish, bulk, qoida, xarid), `Idempotent-Replayed` header'i, tenant soft delete |
| 2026-11-20 | 6 | Yo'qlama va bulk coin batch saqlanadi (o'zgarmagan coinlarga yozuv yo'q), guruh sig'imi va shablon to'qnashuvi qulf ostida, shablon o'zgarishi + sinxronlash bitta tx'da, generatsiyada ichki to'qnashuvlar |
| 2026-11-20 | 5 | Audit log yoziladi: coin, coin qoidalari, userlar, o'quvchilar, xaridlar, sessiyalar, tenant sozlamalari, xabarlar (IP va user-agent bilan) |
| 2026-11-20 | 4 | Dashboard, statistika, coin tarixi va audit log sanalari tenant timezone'i bo'yicha; talaba haftasi dushanbadan |
| 2026-11-20 | 3 | `limit` ≤ 100 (leaderboard ≤ 50), sana maydonlari `YYYY-MM-DD`, sessiya sanasi xatosi tuzatildi, matn uzunligi cheklovlari, sovg'a `categoryId`/`imageUrl` validatsiyasi |
| 2026-11-20 | 2 | Ko'p qurilmali sessiyalar, `POST /auth/logout-all`, logout access tokensiz, refresh xatolari `401`, parol 8–72 belgi, parol tiklash tokeni hash bilan; xabarlar: `subject`/`userId`, HTML escape, log, limit |
