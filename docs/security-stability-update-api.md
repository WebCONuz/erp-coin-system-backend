# Xavfsizlik va Barqarorlik Yangilanishi — Frontend API Qo'llanmasi

> ⚠️ **QORALAMA** — hujjat bosqichma-bosqich to'ldirilmoqda. Yakuniy versiya barcha bosqichlar tugagach beriladi. Hozir: **1-bosqich (xavfsizlik)** **2-bosqich (coin yaxlitligi)** **3-bosqich (jadval va sessiyalar)** **4-bosqich (DB tozalash)** va **5-bosqich (unumdorlik)** yozilgan.

> Backend'da xavfsizlik teshiklari yopildi, coin hisob-kitobi mustahkamlandi va jadval/sessiya qoidalari aniqlashtirildi. Ayrim endpointlarda ruxsatlar qattiqlashdi, yangi majburiy maydonlar va yangi xato holatlari paydo bo'ldi. Quyida frontendga ta'sir qiladigan har bir o'zgarish keltirilgan.

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie (`access_token`, `refresh_token`) — `withCredentials: true` shart
**Format:** JSON

Rol darajalari (`role.level`, `/auth/me` javobida bor): `creator` 100 › `super_admin` 90 › `admin` 60 › `teacher` 40 › `student` 20.

---

## Mundarija

- [Qisqacha: frontendda nima qilish kerak](#qisqacha-frontendda-nima-qilish-kerak)
- [1. Autentifikatsiya va foydalanuvchilar](#1-autentifikatsiya-va-foydalanuvchilar)
  - [1.1 Parolni o'zgartirish](#11-parolni-ozgartirish)
  - [1.2 Kurslar va xonalar — ruxsatlar](#12-kurslar-va-xonalar--ruxsatlar)
  - [1.3 Avatar yuklash va `avatarUrl`](#13-avatar-yuklash-va-avatarurl)
  - [1.4 Javoblardan maxfiy maydonlar olib tashlandi](#14-javoblardan-maxfiy-maydonlar-olib-tashlandi)
  - [1.5 To'xtatilgan tashkilot va arxivlangan userlar](#15-toxtatilgan-tashkilot-va-arxivlangan-userlar)
  - [1.6 Admin ierarxiyasi](#16-admin-ierarxiyasi)
  - [1.7 Login urinishlari limiti](#17-login-urinishlari-limiti)
  - [1.8 Tizim tenanti himoyasi (super_admin paneli)](#18-tizim-tenanti-himoyasi-super_admin-paneli)
  - [1.9 Boshqa o'zgarishlar](#19-boshqa-ozgarishlar)
- [2. Coin (tanga) tizimi](#2-coin-tanga-tizimi)
  - [2.1 Qo'lda coin berish — qat'iyroq validatsiya](#21-qolda-coin-berish--qatiyroq-validatsiya)
  - [2.2 Teacher coin limiti (tenant sozlamasi)](#22-teacher-coin-limiti-tenant-sozlamasi)
  - [2.3 Coin qoidalari](#23-coin-qoidalari)
  - [2.4 📢 Bekor qilish endi teskari yozuv bilan (alohida e'lon)](#24--bekor-qilish-endi-teskari-yozuv-bilan-alohida-elon)
  - [2.5 Parallel so'rovlar va qulflash](#25-parallel-sorovlar-va-qulflash)
- [3. Dars jadvali va sessiyalar](#3-dars-jadvali-va-sessiyalar)
  - [3.1 Vaqt formati](#31-vaqt-formati)
  - [3.2 Sessiya yaratish va tahrirlash — dublikat va bandlik](#32-sessiya-yaratish-va-tahrirlash--dublikat-va-bandlik)
  - [3.3 Yo'qlama muddatlari](#33-yoqlama-muddatlari)
  - [3.4 Jadval shablonlari — havolalar va o'qituvchi bandligi](#34-jadval-shablonlari--havolalar-va-oqituvchi-bandligi)
  - [3.5 Shablon o'zgarsa — sessiyalar avtomatik moslashadi](#35-shablon-ozgarsa--sessiyalar-avtomatik-moslashadi)
  - [3.6 Istisnolar (bekor qilish / vaqt o'zgarishi)](#36-istisnolar-bekor-qilish--vaqt-ozgarishi)
  - [3.7 Sessiyalarni generatsiya qilish](#37-sessiyalarni-generatsiya-qilish)
  - [3.8 Tenant timezone](#38-tenant-timezone)
  - [3.9 Davomat holatlari (kechikdi, sababli)](#39-davomat-holatlari-kechikdi-sababli)
  - [3.10 Yo'qlama ro'yxati — dars sanasidagi a'zolar](#310-yoqlama-royxati--dars-sanasidagi-azolar)
  - [3.11 Dam olish kunlari](#311-dam-olish-kunlari)
  - [3.12 Shablonning amal qilish muddati](#312-shablonning-amal-qilish-muddati)
  - [3.13 Istisno: o'rinbosar o'qituvchi va boshqa xona](#313-istisno-orinbosar-oqituvchi-va-boshqa-xona)
  - [3.14 Kalendar javobi](#314-kalendar-javobi)
- [4. Ma'lumotlar bazasi tozalash](#4-malumotlar-bazasi-tozalash)
- [5. Unumdorlik va ishonchlilik](#5-unumdorlik-va-ishonchlilik)
- [Xato holatlari](#xato-holatlari)
- [O'zgarishlar jurnali](#ozgarishlar-jurnali)

---

## Qisqacha: frontendda nima qilish kerak

| # | Joy | Vazifa |
| --- | --- | --- |
| 1 | "Parolni o'zgartirish" (o'z profili) | `oldPassword` maydoni majburiy. Muvaffaqiyatdan keyin login sahifasiga yo'naltirish |
| 2 | Login sahifasi | `403` + `code: "TENANT_INACTIVE"` uchun alohida xabar; `429` uchun "keyinroq urinib ko'ring" |
| 3 | Student / teacher menyusi | Kurslar va xonalarni yaratish/tahrirlash/o'chirish tugmalarini faqat admin ko'rsin. Student kurs va xonalar ro'yxatini ham ololmaydi |
| 4 | Admin paneli — userlar | Admin uchun rol tanlash ro'yxatidan `admin` rolini olib tashlash. Boshqa adminlarda tahrirlash/arxivlash/parol tugmalarini yashirish |
| 5 | Admin — o'zini tahrirlash | `PATCH /users/:id` emas, `PATCH /users/me` ishlatilsin |
| 6 | Profil — `avatarUrl` | Faqat `/uploads/avatars/...` yoki `https://...` qiymat yuborilsin |
| 7 | Coin berish formasi | `sourceType` faqat `manual` / `bonus`. Teacher uchun limitni `GET /tenant-settings` dan olib ko'rsatish; `TEACHER_COIN_LIMIT_EXCEEDED` xatosini ko'rsatish |
| 8 | Admin — sozlamalar | Yangi "Teacher coin limiti" maydoni: `GET/PATCH /tenant-settings` |
| 9 | Coin tarixi | **Teskari yozuvlar** endi tarixda ko'rinadi — [2.4](#24--bekor-qilish-endi-teskari-yozuv-bilan-alohida-elon) bo'yicha UI'ni moslash |
| 10 | Teacher — coin qoidasi yaratish | `groupId` majburiy (faqat o'z guruhi); `coinAmount` 1 dan kam bo'lmasin |
| 11 | Barcha vaqt maydonlari | Faqat `HH:MM` (ikki xonali soat): `09:00`, `9:00` emas |
| 12 | Yo'qlama sahifasi (teacher) | Dars boshlanmagan bo'lsa saqlash tugmasini o'chirish; saqlangandan 3 kun o'tgach "faqat ko'rish" rejimi (`checkedAt` + 3 kun) |
| 13 | Sessiya yaratish (teacher) | Sana tanlovchida eng erta sana — bugundan 7 kun oldin; `SCHEDULE_CONFLICT` xatosini tushunarli ko'rsatish |
| 14 | Jadval / istisno / generatsiya | Javobdagi `sessionSync` va `conflicts` ni ko'rsatish (qaysi darslar moslashtirilmagani) |
| 15 | Admin — sozlamalar | Yangi `timezone` maydoni (`GET/PATCH /tenant-settings`) |
| 16 | Yo'qlama formasi | Har bir o'quvchi uchun 4 holat: keldi / kechikdi / sababli / sababsiz → `status`. Ro'yxatni `GET /sessions/:id/roster` dan olish |
| 17 | Admin — coin qoidalari | "Kechikish" uchun qoida: `sourceType: "late"`, `direction: "earn"`, `triggerType: "auto"` |
| 18 | Admin — jadval | Yangi "Dam olish kunlari" sahifasi (`/holidays`); shablon formasida "amal qilish muddati"; istisno formasida o'rinbosar o'qituvchi va xona |
| 19 | Kalendar | `holiday`, `exception.teacher/room`, `template.validFrom/validTo` ni ko'rsatish |

---

## 1. Autentifikatsiya va foydalanuvchilar

### 1.1 Parolni o'zgartirish

`PATCH /users/:id/change-password`

| Holat | Avval | Endi |
| --- | --- | --- |
| O'z parolini o'zgartirish | `oldPassword` ixtiyoriy edi | `oldPassword` **majburiy**. Yuborilmasa `400`, noto'g'ri bo'lsa `403` |
| Admin boshqa userning paroli | Istalgan user (boshqa tenant, super_admin ham) | Faqat **o'z tenantidagi** va **o'zidan past darajadagi** user (admin → teacher/student) |
| super_admin / creator | Istalgan user | Istalgan tenantdagi, o'zidan past darajadagi user |
| teacher / student | Faqat o'zi | O'zgarmadi: faqat o'zi (`oldPassword` bilan) |
| Parol o'zgargandan keyin | Sessiyalar saqlanib qolardi | Userning **barcha sessiyalari bekor qilinadi** (refresh token o'chiriladi) |

**Request — o'z paroli:**

```json
{
  "oldPassword": "EskiParol123",
  "newPassword": "YangiParol456"
}
```

**Request — admin o'quvchi uchun:**

```json
{
  "newPassword": "YangiParol456"
}
```

**Response `200`:**

```json
{
  "message": "Parol muvaffaqiyatli o'zgartirildi. Qayta kiring."
}
```

| Status | `message` | Qachon |
| --- | --- | --- |
| `400` | `"Eski parolni kiriting"` | O'z parolida `oldPassword` yuborilmagan |
| `403` | `"Eski parol noto'g'ri"` | `oldPassword` mos kelmadi |
| `403` | `"Faqat o'zingizdan past darajadagi foydalanuvchilarni boshqara olasiz"` | Admin boshqa adminning (yoki yuqoriroq rolning) parolini o'zgartirmoqchi |
| `403` | `"Ruxsat yo'q"` | teacher/student boshqa userning parolini o'zgartirmoqchi |
| `404` | `"Foydalanuvchi topilmadi"` | User yo'q, o'chirilgan yoki boshqa tenantda (admin uchun) |

**Frontendda:**

1. O'z profilidagi formada `oldPassword` maydonini majburiy qiling.
2. O'z paroli o'zgargach userni login sahifasiga yo'naltiring. Joriy `access_token` 15 daqiqagacha ishlaydi, lekin `POST /auth/refresh` endi xato beradi.
3. Parolni tiklash tugmasini faqat `user.role.level < currentUser.role.level` bo'lgan userlar uchun ko'rsating.

---

### 1.2 Kurslar va xonalar — ruxsatlar

Avval `courses` va `rooms` endpointlarida rol tekshiruvi umuman yo'q edi: **har qanday** tizimga kirgan user (student ham) kurs/xona yaratib, o'zgartirib, o'chira olardi.

| Endpoint | Endi kim kira oladi |
| --- | --- |
| `POST /courses`, `PATCH /courses/:id`, `DELETE /courses/:id` | `admin`, `super_admin` (va `creator`) |
| `GET /courses`, `GET /courses/:id` | `admin`, `super_admin`, `teacher` |
| `POST /rooms`, `PATCH /rooms/:id`, `DELETE /rooms/:id` | `admin`, `super_admin` (va `creator`) |
| `GET /rooms`, `GET /rooms/:id` | `admin`, `super_admin`, `teacher` |

Ruxsat bo'lmasa — `403`: `"Bu amalni bajarish uchun admin yoki super_admin huquqi kerak"`.

> Student ilovasi `GET /courses` yoki `GET /rooms` ni to'g'ridan-to'g'ri chaqirayotgan bo'lsa, endi `403` oladi. Kurs nomi kerak bo'lsa guruh ma'lumotidan oling: `GET /groups/me` → `group.course.title`.

---

### 1.3 Avatar yuklash va `avatarUrl`

`PATCH /students/:id/avatar` (`multipart/form-data`, maydon nomi `avatar`, faqat admin)

Request **o'zgarmadi**. Ichki o'zgarishlar:

- Fayl turi **faylning ichidagi baytlar** bo'yicha tekshiriladi, klient yuborgan `Content-Type` va fayl nomiga ishonilmaydi. Rasm deb nomlangan HTML yoki boshqa fayl rad etiladi.
- Ruxsat: JPEG, PNG, WebP, GIF. Hajmi: 2 MB gacha (o'zgarmadi).
- Saqlangan fayl nomi endi UUID: `/uploads/avatars/3f2c1a9e-7b1d-4c2e-9a77-5d0e8b3c1f42.png`.

**Response `200` (o'zgarmadi):**

```json
{
  "id": "student-uuid",
  "avatarUrl": "/uploads/avatars/3f2c1a9e-7b1d-4c2e-9a77-5d0e8b3c1f42.png"
}
```

| Status | `message` | Qachon |
| --- | --- | --- |
| `400` | `"Faqat JPEG, PNG, WebP yoki GIF ruxsat etilgan"` | Fayl turi (Content-Type) mos emas |
| `400` | `"Fayl rasm emas yoki formati qo'llab-quvvatlanmaydi (JPEG, PNG, WebP, GIF)"` | **Yangi.** Kengaytmasi rasm, lekin ichi rasm emas |
| `400` | `"Rasm fayli yuklanmadi"` | Fayl yuborilmagan |
| `404` | `"O'quvchi topilmadi"` | O'quvchi shu tenantda yo'q (endi fayl diskka yozilishidan **oldin** tekshiriladi) |
| `413` | `"File too large"` | 2 MB dan katta |

**`avatarUrl` maydoni** — `POST /users`, `PATCH /users/:id`, `PATCH /users/me`:

Endi faqat ikki ko'rinishdagi qiymat qabul qilinadi:

- `/uploads/avatars/<fayl>` — tizimga yuklangan fayl;
- `https://...` — tashqi rasm.

`http://`, `javascript:`, `data:` va boshqalar — `400`: `"avatarUrl '/uploads/avatars/...' (yuklangan fayl) yoki 'https://...' bo'lishi kerak"`. Maksimal uzunlik — 500 belgi.

---

### 1.4 Javoblardan maxfiy maydonlar olib tashlandi

Avval ayrim endpointlar (`GET /users/:id`, `PATCH /users/:id`, `GET /auth/me`, `include: teacher` bo'lgan guruh javoblari va boshqalar) userning `refreshTokenHash`, `passwordResetToken`, `passwordResetExpiry` maydonlarini ham qaytarardi.

Endi `passwordHash`, `refreshTokenHash`, `passwordResetToken` va `passwordResetExpiry` **hech bir javobda qaytmaydi**, ichma-ich (nested) user obyektlarida ham.

> Frontend bu maydonlarga tayanmagan bo'lishi kerak. Agar biror joyda ishlatilgan bo'lsa (masalan TypeScript tipida) — olib tashlang.

---

### 1.5 To'xtatilgan tashkilot va arxivlangan userlar

Avval super_admin tenantni nofaol qilsa (`PATCH /tenants/:id/toggle-active`), uning userlari baribir kirib ishlay olardi. Arxivlangan (`isDeleted`) userlar ham ayrim hollarda kira olardi.

Endi tizimga faqat **faol va o'chirilmagan** user, **faol tenant**da kira oladi. Bu tekshiruv login'da, refresh'da va **har bir so'rovda** bajariladi.

**`POST /auth/login`:**

| Holat | Status | Javob |
| --- | --- | --- |
| Username/parol noto'g'ri, user arxivlangan yoki o'chirilgan | `400` | `"Username yoki parol noto'g'ri"` (avvalgidek) |
| Parol to'g'ri, lekin tenant to'xtatilgan | `403` | **Yangi**, quyida |

```json
{
  "statusCode": 403,
  "message": "Tashkilotingiz faoliyati vaqtincha to'xtatilgan. Administratorga murojaat qiling",
  "code": "TENANT_INACTIVE"
}
```

**Tizimga kirib turgan user:**

- Admin uni arxivlasa yoki super_admin tenantni to'xtatsa, **keyingi so'rovdayoq** `401` (`"Tizimga kiring"`) qaytadi. `POST /auth/refresh` ham xato beradi.
- Frontend `401` da avvalgidek login sahifasiga o'tkazadi. Login'da userga `TENANT_INACTIVE` xabari ko'rinadi.

**`POST /auth/forgot-password` / `reset-password`:** arxivlangan user yoki to'xtatilgan tenant uchun ishlamaydi. Javob formati o'zgarmadi: forgot-password baribir umumiy xabar qaytaradi, reset-password esa `400 "Token yaroqsiz yoki muddati o'tgan"`.

**Frontendda:** login sahifasida `error.response.data.code === 'TENANT_INACTIVE'` bo'lsa, oddiy "noto'g'ri parol" o'rniga backend'dan kelgan xabarni ko'rsating.

---

### 1.6 Admin ierarxiyasi

Qoida: **user faqat o'zidan past darajadagi userni boshqara oladi.** Admin rolini tayinlash faqat super_admin'ga (va creator'ga) ruxsat etiladi.

| Endpoint | Admin uchun o'zgarish |
| --- | --- |
| `POST /users` | `roleId` faqat `teacher` yoki `student` roli bo'lishi mumkin. `admin` roli → `403` |
| `PATCH /users/:id` | Faqat teacher/student'ni tahrirlaydi. Boshqa adminni **va o'zini** → `403`. `roleId` ni `admin` ga o'zgartirish → `403` |
| `DELETE /users/:id` (arxivlash) | Faqat teacher/student. Boshqa admin → `403`. Arxivlangan userning sessiyasi darhol bekor qilinadi |
| `PATCH /users/:id/restore` | Faqat teacher/student |
| `PATCH /users/:id/change-password` | [1.1](#11-parolni-ozgartirish) ga qarang |

super_admin: admin, teacher va student'ni boshqaradi, boshqa super_admin'ni va creator'ni boshqara olmaydi.

| Status | `message` |
| --- | --- |
| `403` | `"Faqat o'zingizdan past darajadagi rolni tayinlay olasiz"` — `roleId` sifatida tayinlovchining darajasidagi yoki undan yuqori rol berilgan |
| `403` | `"Faqat o'zingizdan past darajadagi foydalanuvchilarni boshqara olasiz"` — boshqa admin, o'zi yoki yuqoriroq rol |

**Frontendda:**

1. User yaratish/tahrirlash formasida rol tanlash ro'yxatini filtrlang: `GET /roles` → `roles.filter(r => r.level < currentUser.role.level)`.
2. User ro'yxatida tahrirlash, arxivlash, tiklash va parol tugmalarini faqat `user.role.level < currentUser.role.level` bo'lsa ko'rsating.
3. Admin o'z ma'lumotlarini `PATCH /users/me` orqali tahrirlaydi (username, fullName, phone, email, avatarUrl).

---

### 1.7 Login urinishlari limiti

`POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/reset-password`

- Bitta **username** uchun 15 daqiqada **10 ta urinish**. Oshib ketsa, shu username 15 daqiqaga bloklanadi. Limit IP bo'yicha emas, shuning uchun bitta sinfdagi o'quvchilar bir-birini bloklamaydi.
- `reset-password` da username yo'q, u IP bo'yicha hisoblanadi.
- Umumiy limitlar avvalgidek: bitta IP'dan sekundiga 10, daqiqasiga 100 so'rov.

**Response `429`:**

```json
{
  "statusCode": 429,
  "message": "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring"
}
```

> `429` endi barcha endpointlarda shu o'zbekcha xabar bilan qaytadi (avval `"ThrottlerException: Too Many Requests"` edi).

Javobda necha soniyadan keyin qayta urinish mumkinligi sarlavhada keladi: username limitida `Retry-After-auth`, umumiy limitlarda `Retry-After-short` / `Retry-After-long`. Frontend uni login formasida taymer sifatida ishlatishi mumkin. Cross-origin'da bu sarlavha brauzerga ko'rinmasligi mumkin, shuning uchun unga majburiy tayanmang.

---

### 1.8 Tizim tenanti himoyasi (super_admin paneli)

creator va super_admin joylashgan **tizim tenanti** (`slug: "system"`) uchun:

| Endpoint | Natija |
| --- | --- |
| `DELETE /tenants/:id` | `403` `"Tizim tenantini o'chirish mumkin emas"` |
| `PATCH /tenants/:id/toggle-active` (nofaol qilish) | `403` `"Tizim tenantini nofaol qilish mumkin emas"` |
| `PATCH /tenants/:id` (`slug` ni o'zgartirish) | `403` `"Tizim tenantini slug'ini o'zgartirish mumkin emas"`. Nomi va boshqa maydonlarni o'zgartirish mumkin |

**Frontendda:** tenantlar ro'yxatida `slug === 'system'` bo'lgan qatorda o'chirish/nofaol qilish tugmalarini yashiring.

---

### 1.9 Boshqa o'zgarishlar

| O'zgarish | Frontendga ta'siri |
| --- | --- |
| Kutilmagan DB xatolarida (`400`) Prisma'ning ichki matni o'rniga umumiy xabar: `"So'rovni bajarib bo'lmadi"` va `code` (masalan `"P2003"`) | Xato matnini ko'rsatayotgan bo'lsangiz, endi texnik tafsilot chiqmaydi |
| Production'da CORS faqat `FRONTEND_DOMEN` ga ruxsat beradi (`localhost` lar faqat dev'da) | Prod frontend domeni backend `.env` dagi `FRONTEND_DOMEN` bilan **aynan** mos bo'lishi shart (protokol va port bilan) |
| Production'da Swagger (`/api/docs`) standart holatda o'chiq | Prod'da Swagger'ga tayanmang |

---

## 2. Coin (tanga) tizimi

### 2.1 Qo'lda coin berish — qat'iyroq validatsiya

`POST /coin-transactions/manual`, `POST /coin-transactions/bulk-manual`, `POST /coin-transactions/apply-rule`

| Maydon / holat | Avval | Endi |
| --- | --- | --- |
| `sourceType` (manual, bulk-manual) | Istalgan qiymat (`attendance`, `purchase`, `exam` ham) | Faqat **`manual`** yoki **`bonus`**. Davomat/imtihon coinlari faqat sessiya tekshiruvi orqali, xarid — faqat xarid moduli orqali |
| `amount` | Yuqori chegara yo'q edi | 1 … **100 000**. Teacher uchun qo'shimcha tenant limiti — [2.2](#22-teacher-coin-limiti-tenant-sozlamasi) |
| `note` | Uzunligi cheklanmagan | Ko'pi bilan **500** belgi |
| `groupId`, `sessionId`, `ruleId` | Tekshirilmasdi (boshqa tenant ID'si ham o'tardi) | Shu tenantga tegishli va o'chirilmagan bo'lishi shart. Teacher uchun guruh/dars unga tegishli bo'lishi kerak. `groupId` va `sessionId` birga berilsa, dars shu guruhniki bo'lishi kerak |
| `apply-rule` — avtomatik qoida (`triggerType: auto`) | Qo'llanardi | **`400`** — avtomatik qoidalar yo'qlama orqali o'zi qo'llanadi |
| `apply-rule` — `sessionId` + sessiyaga oid turdagi qoida (`attendance`/`homework`/`exam`/`competition`) | Qo'llanardi | **`400`** — bunday coin sessiya tekshiruvi orqali beriladi |

> `bulk-manual` va `apply-rule` da `groupId`/`sessionId`/limit xatolari endi **butun so'rovni** rad etadi (`400`/`403`/`404`). Avval har bir o'quvchi uchun alohida `results[].success: false` qaytardi. O'quvchiga oid xatolar (masalan "o'z guruhingizda emas") avvalgidek `results[]` ichida qaytadi.

| Status | `message` |
| --- | --- |
| `400` | `"sourceType faqat 'manual' yoki 'bonus' bo'lishi mumkin"` |
| `400` | `"Tanga miqdori 100000 dan oshmasligi kerak"` |
| `400` | `"Avtomatik qoidani qo'lda qo'llab bo'lmaydi — u yo'qlama saqlanganda o'zi qo'llanadi"` |
| `400` | `"Bu turdagi coin sessiyaga yo'qlama/natija orqali beriladi — qoidani sessionId'siz qo'llang"` |
| `400` | `"Dars ko'rsatilgan guruhga tegishli emas"` |
| `403` | `"Siz bu guruhga tanga bera olmaysiz"` / `"Siz bu darsga tanga bera olmaysiz"` (teacher) |
| `404` | `"Guruh topilmadi"` / `"Dars topilmadi"` / `"Tanga qoidasi topilmadi"` |

---

### 2.2 Teacher coin limiti (tenant sozlamasi)

Har bir tenant teacher bir martada **bitta o'quvchiga** bera oladigan maksimal coinni o'zi belgilaydi. Standart holatda limit yo'q (`null`).

#### `GET /tenant-settings`

**Kim:** `admin`, `super_admin` (`?tenantId=` bilan), `teacher` (o'qish uchun — formada limitni ko'rsatish).

```json
{
  "status": "success",
  "data": {
    "id": "tenant-uuid",
    "teacherCoinLimit": 50
  }
}
```

#### `PATCH /tenant-settings`

**Kim:** `admin`, `super_admin`.

```json
{ "teacherCoinLimit": 50 }
```

Limitni olib tashlash: `{ "teacherCoinLimit": null }`. Qiymat: `1 … 100000` yoki `null`.

```json
{
  "status": "success",
  "message": "Sozlamalar saqlandi",
  "data": { "id": "tenant-uuid", "teacherCoinLimit": 50 }
}
```

#### Limit qayerda qo'llanadi (faqat `teacher` uchun)

| Endpoint | Nima tekshiriladi |
| --- | --- |
| `POST /coin-transactions/manual` | `amount` |
| `POST /coin-transactions/bulk-manual` | `amount` (har bir o'quvchiga) |
| `POST /coin-transactions/apply-rule` | Qoidaning `coinAmount` i |
| `POST /sessions/:id/results` | Har bir qatnashgan o'quvchining `coinAmount` i (bittasi oshsa — butun so'rov rad etiladi) |
| `POST /coin-rules` | Teacher yaratayotgan qoidaning `coinAmount` i |

Admin va undan yuqori rollar uchun limit qo'llanmaydi. Yo'qlamadagi avtomatik coinlarga (davomat, uy vazifasi) ham qo'llanmaydi.

**Xato `400`:**

```json
{
  "statusCode": 400,
  "message": "Bir o'quvchiga bir martada ko'pi bilan 50 coin bera olasiz (so'ralgan: 80)",
  "code": "TEACHER_COIN_LIMIT_EXCEEDED",
  "limit": 50
}
```

**Frontendda:** teacher uchun coin kiritish maydonlariga `max={teacherCoinLimit}` qo'ying va limitni yonida ko'rsating. Backend baribir tekshiradi.

---

### 2.3 Coin qoidalari

`POST /coin-rules`, `PATCH /coin-rules/:id`

| O'zgarish | Tafsilot |
| --- | --- |
| `coinAmount` | 1 … 100 000 (avval 0 va manfiy qiymat ham o'tardi) |
| `description` | Ko'pi bilan 1000 belgi |
| `groupId` | Shu tenantdagi, o'chirilmagan guruh bo'lishi shart |
| **Teacher** qoida yaratganda | `groupId` **majburiy** va u teacherga tegishli guruh bo'lishi kerak (tenant bo'yicha umumiy qoidani faqat admin yaratadi). `coinAmount` teacher limitidan oshmasligi kerak |

| Status | `message` |
| --- | --- |
| `400` | `"coinAmount kamida 1 bo'lishi kerak"` / `"Bu tenantga tegishli bunday guruh topilmadi"` |
| `400` | `TEACHER_COIN_LIMIT_EXCEEDED` ([2.2](#22-teacher-coin-limiti-tenant-sozlamasi)) |
| `403` | `"O'qituvchi faqat o'z guruhi uchun qoida yarata oladi (groupId majburiy)"` |
| `403` | `"Siz bu guruh uchun qoida yarata olmaysiz"` |

---

### 2.4 📢 Bekor qilish endi teskari yozuv bilan (alohida e'lon)

> **Bu o'zgarish coin tarixi UI'siga to'g'ridan-to'g'ri ta'sir qiladi.** Frontend jamoasiga alohida xabar qilinadi.

**Avval:** tranzaksiya bekor qilinganda u tarixdan **o'chib ketardi** (soft delete), balans esa jimgina o'zgarardi. O'quvchi "coinim qayerga ketdi?" deb so'rasa, izi qolmasdi.

**Endi:** asl yozuv tarixda **qoladi**. Uning ustiga **teskari yozuv** qo'shiladi: miqdori bir xil, yo'nalishi qarama-qarshi (`earn` ↔ `deduct`), `sourceType` va bog'lanishlari (`sessionId`, `groupId`, `ruleId`, `purchaseId`) ham bir xil. Bu buxgalteriyadagi "storno" yozuviga o'xshaydi.

#### Qachon teskari yozuv paydo bo'ladi

| Amal | Natija tarixda |
| --- | --- |
| `DELETE /coin-transactions/:id/cancel` | Asl yozuv + teskari yozuv (`note: "Tranzaksiya bekor qilindi"`) |
| Yo'qlama yoki natijani **qayta saqlash** (`POST /sessions/:id/attendance` yoki `results`) | Avvalgi coin yozuvlariga teskari yozuv (`"Tekshiruv qayta saqlandi — avvalgi yozuv bekor qilindi"`) + yangi yozuvlar |
| Sessiyani o'chirish (`DELETE /sessions/:id`, `keepCoins` siz) | Shu sessiya coinlariga teskari yozuvlar (`"Dars o'chirildi — ..."`) |
| Xaridni bekor qilish (`PATCH /purchases/:id/status` → `cancelled`) | Xarid tranzaksiyasiga teskari yozuv (avval ham kirim yozilardi, endi u asl yozuvga `reversalOfId` orqali bog'langan) |

> Masalan, teacher yo'qlamani 3 marta saqlasa, o'quvchi tarixida 3 ta "+5 davomat" va 2 ta "−5 (bekor qilindi)" ko'rinadi. Sof natija +5.

#### Yangi maydonlar

`GET /coin-transactions/history` va `GET /coin-transactions/my-history` javobidagi har bir yozuvda:

| Maydon | Tip | Ma'nosi |
| --- | --- | --- |
| `reversalOfId` | `string \| null` | Bu yozuv **teskari yozuv** bo'lsa — qaysi tranzaksiyani bekor qilgani. Oddiy yozuvda `null` |
| `reversal` | `{ id, createdAt } \| null` | Bu yozuv **bekor qilingan** bo'lsa — unga yozilgan teskari yozuv. Bekor qilinmagan bo'lsa `null` |
| `purchaseId` | `string \| null` | Xarid yoki xaridni bekor qilish tranzaksiyasi bo'lsa — xarid ID'si (`history` da) |

```json
[
  {
    "id": "b2c...",
    "amount": 5,
    "direction": "deduct",
    "sourceType": "attendance",
    "note": "Tekshiruv qayta saqlandi — avvalgi yozuv bekor qilindi",
    "createdAt": "2026-11-18T10:05:00.000Z",
    "reversalOfId": "a1f...",
    "reversal": null
  },
  {
    "id": "a1f...",
    "amount": 5,
    "direction": "earn",
    "sourceType": "attendance",
    "note": "Darsda qatnashgani uchun avtomatik bonus (Matematika)",
    "createdAt": "2026-11-18T09:00:00.000Z",
    "reversalOfId": null,
    "reversal": { "id": "b2c...", "createdAt": "2026-11-18T10:05:00.000Z" }
  }
]
```

#### `DELETE /coin-transactions/:id/cancel` — yangi javob va qoidalar

**Response `200`:**

```json
{
  "message": "Tranzaksiya muvaffaqiyatli bekor qilindi va balans qayta hisoblandi",
  "reversalTransactionId": "b2c...",
  "newBalance": 120
}
```

| Status | `message` | Qachon |
| --- | --- | --- |
| `400` | `"Bu yozuvning o'zi bekor qilish (teskari) yozuvi — uni bekor qilib bo'lmaydi"` | Teskari yozuvni bekor qilishga urinish |
| `400` | `"Xarid tranzaksiyasini bu yerdan bekor qilib bo'lmaydi — xaridning o'zini bekor qiling (PATCH /purchases/:id/status)"` | `sourceType: purchase`. **Yangi.** Avval o'quvchi ham sovg'ani, ham coinni olib qolishi mumkin edi |
| `400` | `"Bu coin sessiya tekshiruvi orqali berilgan — yo'qlama/natijani o'zgartiring"` | Davomat/uy vazifasi/imtihon coini (sessiyaga bog'langan). **Yangi** |
| `400` | `"Tranzaksiyani bekor qilib bo'lmaydi, talaba coinlarni ishlatib yuborgan."` | Avvalgidek |
| `409` | `"Tranzaksiya allaqachon bekor qilingan"` | **Yangi.** Avval `404` edi |

#### Statistika o'zgarmaydi

Jami olingan/ayirilgan coin, haftalik/oylik grafiklar, admin dashboard, guruh statistikasi, sessiyadagi `coinAwarded` — bularning hammasi bekor qilingan juftlikni (asl + teskari) **hisobga olmaydi**. Raqamlar avvalgi soft-delete bilan bir xil chiqadi. Balans ham o'zgarmaydi: asl + teskari = 0.

> Bitta istisno — **yaxshilanish:** guruh statistikasidagi "o'rtacha balans tarixi" (`avgBalance.trend`) endi aniqroq. Avval o'chirilgan yozuvlar tarixdan yo'qolgani uchun tarixiy balans biroz noto'g'ri tiklanardi.

#### Frontendda (tavsiya)

1. **Teskari yozuv** (`reversalOfId !== null`): kulrang yoki "↩ Bekor qilish" belgisi bilan ko'rsating. "Bekor qilish" tugmasini ko'rsatmang.
2. **Bekor qilingan yozuv** (`reversal !== null`): summasini ustidan chizilgan (strikethrough) qilib, "Bekor qilingan · {sana}" yorlig'ini qo'ying. "Bekor qilish" tugmasini yashiring.
3. Ikkalasini vizual bog'lash mumkin (masalan, bosganda juftligi highlight bo'ladi): `reversal.id` ↔ `reversalOfId`.
4. "Bekor qilish" tugmasini faqat `reversalOfId === null && reversal === null && sourceType !== 'purchase'` bo'lsa va yozuv sessiyaga oid avtomatik coin bo'lmasa ko'rsating.
5. Tarixda `direction` filtri (`earn`/`deduct`) teskari yozuvlarni ham qaytaradi: "faqat kirimlar" filtrida bekor qilingan ayirishlarning teskari yozuvlari ham chiqadi.

---

### 2.5 Parallel so'rovlar va qulflash

Request va response o'zgarmadi. Ichki tuzatishlar:

| Muammo (avval) | Endi |
| --- | --- |
| "Saqlash" tugmasi ikki marta bosilsa, yo'qlama coinlari ikki marta yozilishi mumkin edi | Bitta o'quvchi bo'yicha barcha coin amallari navbat bilan bajariladi — dublikat bo'lmaydi |
| Parallel ayirishlarda balans manfiyga tushishi mumkin edi | Balans tekshiruvi qulf ostida; DB ham manfiy balansni qabul qilmaydi |
| Bitta tranzaksiyani parallel ikki marta bekor qilish balansni ikki marta o'zgartirardi | Ikkinchisi `409` oladi |
| Sessiya o'chirilayotgan paytda yo'qlama saqlansa, o'chirilgan sessiyaga coin yozilishi mumkin edi | Sessiya qulflanadi; kech qolgan so'rov `404 "Dars topilmadi"` oladi |

**Yo'qlama/natija saqlash — hammasi yoki hech narsa** ([5-bosqich](#5-unumdorlik-va-ishonchlilik)): butun ro'yxat bitta tranzaksiyada saqlanadi. Xato bo'lsa (masalan, shu payt boshqa user sessiyani qulflasa — `400`, `code: "SESSION_LOCKED"`) **hech bir** o'quvchi saqlanmaydi, qisman saqlangan holat bo'lmaydi.

---

## 3. Dars jadvali va sessiyalar

### 3.1 Vaqt formati

Barcha vaqt maydonlari (`startTime`, `endTime`) endi **qat'iy `HH:MM`** formatida, soat doim ikki xonali:

| Qiymat | Avval | Endi |
| --- | --- | --- |
| `09:00` | ✅ | ✅ |
| `9:00` | ✅ (lekin tartib buzilardi: `"9:00" > "14:00"`) | ❌ `400` |
| `24:00` | ❌ | ❌ |

Qo'llanadigan endpointlar: `POST/PATCH /sessions`, `POST/PATCH /schedule-templates`, `POST/PATCH /schedule-templates/:id/exceptions`, `PATCH /schedule-exceptions/:id`.

Xato: `400` — `"Vaqt formati HH:MM bo'lishi kerak (masalan 09:00)"`. Tugash vaqti boshlanishdan keyin bo'lmasa: `400`, `code: "INVALID_TIME_RANGE"`.

---

### 3.2 Sessiya yaratish va tahrirlash — dublikat va bandlik

`POST /sessions`, `PATCH /sessions/:id`

**Dublikat.** Avval bir xil guruh, sana va vaqtga ikkinchi dars faqat barcha maydonlar (tur, tugash vaqti, o'qituvchi) mos kelsagina rad etilardi. Endi **guruh + sana + boshlanish vaqti** bir xil bo'lsa — `409`:

```json
{
  "statusCode": 409,
  "message": "Bu guruh uchun ko'rsatilgan sana va vaqtda dars allaqachon mavjud",
  "code": "SESSION_DUPLICATE",
  "sessionId": "mavjud-sessiya-uuid"
}
```

**Bandlik (yangi).** Shu sanada vaqti kesishadigan boshqa dars bo'lsa — `409`:
- shu **guruhning** boshqa darsi;
- shu **xonada** boshqa dars;
- shu **o'qituvchining** boshqa darsi.

```json
{
  "statusCode": 409,
  "message": "Bu xonada 14:00–15:30 da boshqa darsi bor (\"9-B\")",
  "code": "SCHEDULE_CONFLICT",
  "conflict": {
    "kind": "room",
    "sessionId": "uuid",
    "groupName": "9-B",
    "startTime": "14:00",
    "endTime": "15:30"
  }
}
```

`conflict.kind`: `group` | `room` | `teacher`. Chegaralar tegib tursa to'qnashuv emas (`09:00–10:00` va `10:00–11:00` — mumkin).

`PATCH /sessions/:id` da bandlik faqat vaqt, xona yoki o'qituvchi o'zgarganda tekshiriladi.

**O'qituvchi.** `teacherId` faqat `teacher` (yoki `admin`) rolidagi faol user bo'lishi mumkin — avval student ham o'tardi. Aks holda `404 "O'qituvchi topilmadi"`.

**Teacher uchun qo'shimcha cheklovlar:**

| Holat | Natija |
| --- | --- |
| `POST /sessions` — sana bugundan **7 kundan** eski | `403`, `code: "SESSION_DATE_TOO_OLD"`, javobda `earliestDate` |
| `PATCH /sessions/:id` — `teacherId` ni boshqasiga o'zgartirish | `403` `"O'qituvchini faqat administrator almashtira oladi"` |

```json
{
  "statusCode": 403,
  "message": "O'qituvchi 7 kundan eski sanaga dars qo'sha olmaydi (eng erta: 2026-11-11). Administratorga murojaat qiling",
  "code": "SESSION_DATE_TOO_OLD",
  "earliestDate": "2026-11-11"
}
```

Admin istalgan sanaga dars yarata oladi.

---

### 3.3 Yo'qlama muddatlari

`POST /sessions/:id/attendance`, `POST /sessions/:id/results`

| Qoida | Kimga | Xato |
| --- | --- | --- |
| Yo'qlama/natija faqat **dars boshlangandan keyin** qo'yiladi (sana + `startTime`, tenant timezone bo'yicha) | Hamma | `400`, `code: "SESSION_NOT_STARTED"` |
| Hali saqlanmagan yo'qlama | Hamma | Muddat **yo'q** — istalgan vaqtda qo'yish mumkin |
| Saqlangan yo'qlamani tahrirlash — **birinchi saqlashdan keyin 3 kun** ichida | Faqat `teacher` | `403`, `code: "ATTENDANCE_EDIT_WINDOW_EXPIRED"` |
| Admin / super_admin | — | Muddatsiz tahrirlay oladi |

```json
{
  "statusCode": 400,
  "message": "Dars hali boshlanmagan (2026-11-20 14:00) — yo'qlamani dars boshlangandan keyin qo'ying",
  "code": "SESSION_NOT_STARTED",
  "startsAt": { "date": "2026-11-20", "time": "14:00" }
}
```

```json
{
  "statusCode": 403,
  "message": "Saqlangan yo'qlamani 3 kun ichida tahrirlash mumkin edi. O'zgartirish uchun administratorga murojaat qiling",
  "code": "ATTENDANCE_EDIT_WINDOW_EXPIRED",
  "checkedAt": "2026-11-10T09:12:00.000Z",
  "editableUntil": "2026-11-13T09:12:00.000Z"
}
```

**Yangi maydonlar** — `GET /sessions` va sessiya javoblarida:

| Maydon | Tip | Ma'nosi |
| --- | --- | --- |
| `checkedAt` | `string \| null` | Yo'qlama/natija **birinchi** saqlangan vaqt. Qayta saqlash uni o'zgartirmaydi. Teacher uchun tahrirlash muddati: `checkedAt + 3 kun` |
| `templateId` | `string \| null` | Sessiya jadval shablonidan yaratilgan bo'lsa — shablon ID'si; qo'lda yaratilgan bo'lsa `null` |

> Mavjud tekshirilgan sessiyalar uchun `checkedAt` migratsiyada eng birinchi yo'qlama yozuvi vaqtidan to'ldirildi.

**Frontendda:**
1. Teacher yo'qlama sahifasida `checkedAt && now > checkedAt + 3 kun` bo'lsa formani faqat ko'rish rejimida oching va "Tahrirlash muddati tugagan" deb yozing.
2. Kelajakdagi darsda "Saqlash" tugmasini o'chiring (backend baribir `SESSION_NOT_STARTED` qaytaradi).

---

### 3.4 Jadval shablonlari — havolalar va o'qituvchi bandligi

`POST /schedule-templates`, `PATCH /schedule-templates/:id`

| O'zgarish | Avval | Endi |
| --- | --- | --- |
| `groupId`, `roomId`, `teacherId`, `subjectId` | Tekshirilmasdi (boshqa tenant ID'si ham o'tardi) | Shu tenantdagi, o'chirilmagan yozuv bo'lishi shart → aks holda `404` (`"Guruh topilmadi"`, `"Xona topilmadi"`, `"O'qituvchi topilmadi"`, `"Fan topilmadi"`) |
| `teacherId` | Istalgan user | Faqat `teacher`/`admin` rolidagi faol user |
| O'qituvchi bandligi | Tekshirilmasdi — bitta o'qituvchi bir vaqtda ikki guruhga qo'yilishi mumkin edi | `409`, `code: "SCHEDULE_CONFLICT"`, `conflict.kind: "teacher"` |

O'qituvchi bandligi shablonning **haqiqiy** o'qituvchisi bo'yicha tekshiriladi: shablondagi `teacherId`, bo'lmasa guruhning asosiy o'qituvchisi. Xona va guruh bandligi avvalgidek.

```json
{
  "statusCode": 409,
  "message": "Bu o'qituvchi monday kuni 09:00–10:30 da \"10-A\" guruhida dars beradi",
  "code": "SCHEDULE_CONFLICT",
  "conflict": { "kind": "teacher", "groupName": "10-A" }
}
```

---

### 3.5 Shablon o'zgarsa — sessiyalar avtomatik moslashadi

**Avval:** shablon (vaqt, xona, o'qituvchi, hafta kuni) o'zgartirilsa yoki o'chirilsa, undan oldin generatsiya qilingan kelajakdagi sessiyalar eski holicha qolardi.

**Endi:** shablon yoki uning istisnosi o'zgarganda shu shablondan yaratilgan **kelajakdagi** sessiyalar (bugundan boshlab) avtomatik moslashtiriladi:

| Holat | Natija |
| --- | --- |
| Vaqt / xona / o'qituvchi / fan o'zgardi | Sessiyalar yangilanadi. Mavzu (`topic`) saqlanadi |
| Hafta kuni o'zgardi | Eski kundagi sessiyalar o'chiriladi, yangi kunga yaratiladi (avval generatsiya qilingan oxirgi sanagacha) |
| Shablon o'chirildi | Kelajakdagi sessiyalari o'chiriladi |
| Tekshirilgan (`isChecked`) yoki qulflangan sessiya | **Tegilmaydi** — bu tarix |
| Qo'lda yaratilgan sessiya (`templateId: null`) | Tegilmaydi |
| O'zgarish boshqa dars bilan to'qnashadi | O'sha sessiya o'zgartirilmaydi va `conflicts` da qaytariladi |

> Shablondan yaratilgan sessiyaning vaqti/xonasi qo'lda o'zgartirilgan bo'lsa, shablon keyingi safar o'zgarganda u shablon qiymatiga qaytariladi.

**Javobga qo'shilgan maydon** — `PATCH /schedule-templates/:id`, `DELETE /schedule-templates/:id`, istisno yaratish/tahrirlash/o'chirish:

```json
{
  "id": "template-uuid",
  "weekday": "wednesday",
  "startTime": "10:00",
  "...": "...",
  "sessionSync": {
    "updated": 6,
    "removed": 0,
    "created": 0,
    "conflicts": [
      {
        "date": "2026-12-02",
        "startTime": "10:00",
        "endTime": "11:30",
        "kind": "room",
        "groupName": "8-A"
      }
    ]
  }
}
```

**Frontendda:** `sessionSync.conflicts` bo'sh bo'lmasa, adminga "N ta dars yangi jadvalga ko'chirilmadi (to'qnashuv)" degan ogohlantirish va ro'yxatini ko'rsating.

---

### 3.6 Istisnolar (bekor qilish / vaqt o'zgarishi)

`POST /schedule-templates/:id/exceptions`, `PATCH /schedule-exceptions/:id`, `DELETE /schedule-exceptions/:id`

| O'zgarish | Tafsilot |
| --- | --- |
| O'chirilgan istisno sanasiga qayta istisno qo'yish | Avval xato berardi (DB cheklovi). Endi o'chirilgan istisno qayta tiklanadi |
| `isCancelled: false` | `startTime` va `endTime` majburiy, `endTime > startTime` (`400`) |
| `isCancelled: true` | `startTime`/`endTime` saqlanmaydi (`null`) |
| Istisno qo'yilganda/o'zgarganda/o'chirilganda | Shu sanadagi generatsiya qilingan sessiya avtomatik moslashadi ([3.5](#35-shablon-ozgarsa--sessiyalar-avtomatik-moslashadi)): bekor qilinsa — o'chiriladi, vaqt o'zgarsa — yangilanadi, istisno o'chirilsa — asl holiga qaytadi |

Javobga `sessionSync` qo'shildi (3.5 dagi format).

---

### 3.7 Sessiyalarni generatsiya qilish

`POST /schedule-templates/generate-sessions`

| O'zgarish | Avval | Endi |
| --- | --- | --- |
| Sana oralig'i | Cheklanmagan | Ko'pi bilan **92 kun**. Oshsa `400` |
| Parallel ikki so'rov | Dublikat sessiyalar yaratilishi mumkin edi | Navbat bilan bajariladi, dublikat yo'q |
| Boshqa guruh darsi bilan xona/o'qituvchi to'qnashuvi | Tekshirilmasdi | Bunday dars yaratilmaydi va `conflicts` da qaytariladi |
| `skipped` | Oraliqdagi mavjud sessiyalar soni | Mavjud sessiya tufayli **o'tkazib yuborilgan** darslar soni |
| Yaratilgan sessiyalar | — | `templateId` bilan bog'lanadi ([3.5](#35-shablon-ozgarsa--sessiyalar-avtomatik-moslashadi)) |

**Response:**

```json
{
  "message": "Sessiyalar muvaffaqiyatli yaratildi",
  "created": 24,
  "skipped": 2,
  "cancelled": 1,
  "conflicts": [
    {
      "date": "2026-12-09",
      "startTime": "14:00",
      "endTime": "15:30",
      "kind": "teacher",
      "groupName": "11-B"
    }
  ]
}
```

---

### 3.8 Tenant timezone

"Bugun", "dars boshlandimi", "tekshirilmagan darslar" filtri va teacher uchun 7 kunlik oyna endi **tenant timezone'i** bo'yicha hisoblanadi (avval — server vaqti). Standart: `Asia/Tashkent`.

`GET /tenant-settings` javobiga `timezone` qo'shildi. `PATCH /tenant-settings`:

```json
{ "timezone": "Asia/Tashkent" }
```

Noto'g'ri qiymat — `400` `"timezone noto'g'ri — IANA nomi bo'lishi kerak (masalan Asia/Tashkent)"`.

---

### 3.9 Davomat holatlari (kechikdi, sababli)

`POST /sessions/:id/attendance` — har bir yozuvda yangi **`status`** maydoni:

| `status` | Ma'nosi | Coin | `isPresent` |
| --- | --- | --- | --- |
| `present` | Keldi | Davomat coini | `true` |
| `late` | Kechikdi | **"Kechikish" qoidasi** bo'yicha; qoida bo'lmasa — oddiy davomat coini | `true` |
| `excused` | Sababli kelmadi | Coin ham, jarima ham **yo'q** | `false` |
| `absent` | Sababsiz kelmadi | Jarima qoidasi bo'lsa — jarima | `false` |

Uy vazifasi (`homeworkDone`) coini holatdan qat'i nazar avvalgidek beriladi.

**Request (yangi format):**

```json
{
  "records": [
    { "studentId": "uuid-1", "status": "present", "homeworkDone": true },
    { "studentId": "uuid-2", "status": "late", "homeworkDone": false },
    { "studentId": "uuid-3", "status": "excused", "homeworkDone": false },
    { "studentId": "uuid-4", "status": "absent", "homeworkDone": false }
  ]
}
```

**Eski format ham ishlaydi** (o'tish davri): `status` yuborilmasa, `isPresent: true` → `present`, `false` → `absent`. Ikkalasi birga yuborilsa mos bo'lishi kerak (`isPresent: true` ↔ `present`/`late`), aks holda butun so'rov `400`:

```json
{
  "statusCode": 400,
  "message": "status (excused) va isPresent (true) bir-biriga mos emas",
  "code": "ATTENDANCE_STATUS_MISMATCH",
  "studentId": "uuid-3"
}
```

**Javoblarda:** yo'qlama yozuvlarida (`GET /sessions/:id/attendance`, `GET /sessions/:id/roster`, `GET /sessions/me/attendance`, `GET /students/:id` dagi davomat tarixi) yangi `status` maydoni bor. `isPresent` saqlanib qoldi va `status` bilan sinxron (`present`/`late` → `true`).

> Mavjud yozuvlar migratsiyada: `isPresent: true` → `present`, `false` → `absent` (eski ma'lumotda sababi noma'lum).

**"Kechikish" coin qoidasi** — admin `POST /coin-rules` orqali yaratadi (ixtiyoriy):

```json
{
  "name": "Kechikib keldi",
  "coinAmount": 2,
  "direction": "earn",
  "triggerType": "auto",
  "sourceType": "late"
}
```

Guruhga xos qoida (`groupId` bilan) umumiy qoidadan ustun, boshqa avtomatik qoidalar kabi. Tranzaksiya tarixida bunday coin `sourceType: "late"` bilan ko'rinadi.

> Statistikadagi "kelmagan" soni (`absentCount`) hozircha `isPresent: false` bo'yicha hisoblanadi — sababli kelmaganlar ham kiradi.

---

### 3.10 Yo'qlama ro'yxati — dars sanasidagi a'zolar

**Avval:** yo'qlamaga guruhning **hozirgi** a'zolari qo'yilardi. Kecha qo'shilgan o'quvchi o'tgan haftadagi darsga ham "kelmadi" deb belgilanib jarima olishi, guruhdan chiqarilgan o'quvchini esa uning o'z darslariga ham belgilab bo'lmasligi mumkin edi.

**Endi:** o'quvchi faqat **dars sanasida** guruh a'zosi bo'lgan bo'lsa yo'qlamaga qo'yiladi:
- guruhga dars sanasigacha (shu kun ham) qo'shilgan;
- hali chiqarilmagan yoki dars sanasidan keyin chiqarilgan.

Aks holda `400` `code: "STUDENTS_NOT_IN_GROUP"` (avvalgidek).

#### `GET /sessions/:id/roster` (yangi)

**Kim:** `admin`, `super_admin`, `teacher` (o'z darsi). Yo'qlama/natija formasi uchun **shu endpointdan** foydalaning.

```json
{
  "session": {
    "id": "session-uuid",
    "sessionDate": "2026-11-18T00:00:00.000Z",
    "evaluationMode": "attendance"
  },
  "students": [
    {
      "student": { "id": "uuid-1", "fullName": "Aliyev Vali", "avatarUrl": null },
      "joinedAt": "2026-09-01T05:00:00.000Z",
      "leftAt": null,
      "record": {
        "status": "late",
        "isPresent": true,
        "homeworkDone": true,
        "score": null,
        "note": null
      },
      "coinAwarded": 12
    },
    {
      "student": { "id": "uuid-2", "fullName": "Karimova Laylo", "avatarUrl": "/uploads/avatars/..." },
      "joinedAt": "2026-09-01T05:00:00.000Z",
      "leftAt": "2026-11-20T08:00:00.000Z",
      "record": null,
      "coinAwarded": 0
    }
  ]
}
```

- `record: null` — hali yo'qlama qilinmagan.
- `leftAt` bo'lsa — o'quvchi keyinroq guruhdan chiqarilgan (formada belgi qo'yish mumkin).
- Ro'yxat ism bo'yicha tartiblangan.

> Cheklov: guruhga **qayta** qo'shilgan o'quvchida `joinedAt` yangilanadi — undan oldingi a'zolik davridagi darslar ro'yxatda faqat yozuvi bo'lsa ko'rinadi.

---

### 3.11 Dam olish kunlari

Tenant bo'yicha bayram/dam olish kunlari. Shu sanada jadval shablonlaridan dars **yaratilmaydi**, allaqachon yaratilgan kelajakdagi **tekshirilmagan** darslar avtomatik o'chiriladi. Dam olish kuni o'chirilsa — darslar qaytariladi.

#### `GET /holidays?from=2026-01-01&to=2026-12-31`

**Kim:** `admin`, `super_admin`, `teacher`.

```json
{
  "data": [
    { "id": "uuid", "date": "2026-12-31T00:00:00.000Z", "name": "Yangi yil", "createdAt": "..." }
  ]
}
```

#### `POST /holidays`

**Kim:** `admin`, `super_admin`.

```json
{ "date": "2026-12-31", "name": "Yangi yil" }
```

**Response `201`:**

```json
{
  "id": "uuid",
  "date": "2026-12-31T00:00:00.000Z",
  "name": "Yangi yil",
  "sessionSync": { "updated": 0, "removed": 7, "created": 0, "conflicts": [] },
  "manualSessionsOnDate": 1
}
```

- `sessionSync.removed` — shu sanadan o'chirilgan jadval darslari soni.
- `manualSessionsOnDate` — shu sanada **qo'lda yaratilgan** darslar soni. Ular avtomatik o'chirilmaydi — admin ko'rib chiqishi kerak (frontend ogohlantirish ko'rsatsin).

Shu sana allaqachon dam olish kuni bo'lsa — `409 "Bu sana allaqachon dam olish kuni"`.

#### `DELETE /holidays/:id`

```json
{
  "message": "Dam olish kuni o'chirildi",
  "sessionSync": { "updated": 0, "removed": 0, "created": 7, "conflicts": [] }
}
```

`generate-sessions` javobiga ham yangi `holidays` maydoni qo'shildi — dam olish kuniga to'g'ri kelib yaratilmagan darslar soni.

---

### 3.12 Shablonning amal qilish muddati

`POST /schedule-templates`, `PATCH /schedule-templates/:id` — yangi ixtiyoriy maydonlar:

| Maydon | Tip | Ma'nosi |
| --- | --- | --- |
| `validFrom` | `YYYY-MM-DD` | Shablon shu sanadan amal qiladi |
| `validTo` | `YYYY-MM-DD` | Shablon shu sanagacha (shu kun ham) amal qiladi |

`PATCH` da `null` yuborilsa — cheklov olib tashlanadi. `validFrom > validTo` — `400`.

```json
{
  "weekday": "monday",
  "startTime": "09:00",
  "endTime": "10:30",
  "groupId": "group-uuid",
  "roomId": "room-uuid",
  "validFrom": "2026-09-01",
  "validTo": "2026-12-27"
}
```

Ta'siri:
- muddatdan tashqari sanalarga dars generatsiya qilinmaydi va kalendarda ko'rinmaydi;
- muddat o'zgarsa kelajakdagi darslar sinxronlanadi ([3.5](#35-shablon-ozgarsa--sessiyalar-avtomatik-moslashadi));
- **to'qnashuv tekshiruvi muddatni hisobga oladi:** muddatlari kesishmaydigan ikki shablon (masalan 1-chorak va 2-chorak jadvali) bir xil xona/vaqtda bo'lishi mumkin.

Shablon javoblarida `validFrom`, `validTo` maydonlari bor.

---

### 3.13 Istisno: o'rinbosar o'qituvchi va boshqa xona

`POST /schedule-templates/:id/exceptions`, `PATCH /schedule-exceptions/:id` — yangi ixtiyoriy maydonlar:

| Maydon | Ma'nosi |
| --- | --- |
| `teacherId` | Shu kuni darsni o'tadigan **o'rinbosar** o'qituvchi (`teacher`/`admin` roli) |
| `roomId` | Shu kuni dars o'tadigan boshqa xona |

`isCancelled: false` bo'lsa endi vaqt **majburiy emas** — istisno quyidagilardan kamida bittasini o'zgartirishi kerak: vaqt (`startTime` + `endTime` birga), `roomId` yoki `teacherId`. Aks holda `400`.

```json
{
  "exceptionDate": "2026-11-25",
  "isCancelled": false,
  "teacherId": "substitute-teacher-uuid",
  "note": "Asosiy o'qituvchi kasal"
}
```

- Shu sanadagi darsga o'rinbosar o'qituvchi biriktiriladi ([3.5](#35-shablon-ozgarsa--sessiyalar-avtomatik-moslashadi) bo'yicha sinxronlanadi). U shu darsni ko'radi va yo'qlama qila oladi; guruhga kirish huquqini ham shu dars orqali oladi.
- `PATCH` da `"teacherId": null` / `"roomId": null` — shablondagisiga qaytarish.
- `isCancelled: true` bo'lsa `teacherId`/`roomId` saqlanmaydi.

| Status | `message` |
| --- | --- |
| `400` | `"Vaqt o'zgarsa startTime va endTime birga berilishi kerak"` |
| `400` | `"Bekor qilinmagan istisnoda yangi vaqt, xona yoki o'qituvchi berilishi kerak"` |
| `404` | `"Xona topilmadi"` / `"O'qituvchi topilmadi"` |

---

### 3.14 Kalendar javobi

`GET /schedule-templates/calendar` va `GET /schedule-templates/calendar/me` — har bir kun elementiga qo'shimchalar:

```json
{
  "2026-11-25": [
    {
      "holiday": null,
      "template": {
        "id": "template-uuid",
        "weekday": "wednesday",
        "startTime": "09:00",
        "endTime": "10:30",
        "validFrom": "2026-09-01T00:00:00.000Z",
        "validTo": null,
        "room": { "id": "...", "name": "101" },
        "subject": null,
        "teacher": { "id": "...", "fullName": "Asosiy O'qituvchi" }
      },
      "exception": {
        "id": "exception-uuid",
        "isCancelled": false,
        "startTime": null,
        "endTime": null,
        "room": null,
        "teacher": { "id": "...", "fullName": "O'rinbosar O'qituvchi" },
        "note": "Asosiy o'qituvchi kasal"
      },
      "session": { "id": "session-uuid", "templateId": "template-uuid", "...": "..." }
    }
  ]
}
```

| Maydon | O'zgarish |
| --- | --- |
| `holiday` | **Yangi.** Dam olish kuni bo'lsa `{ id, name }` — bu kunda dars yo'q deb ko'rsating |
| `template.validFrom/validTo` | **Yangi.** Muddatdan tashqari kunlarda shablon umuman qaytmaydi |
| `exception.room` / `exception.teacher` | **Yangi.** Shu kunga xona / o'rinbosar (`null` — shablondagisi) |
| `session.templateId` | **Yangi.** Sessiya endi shablonga `templateId` orqali bog'lanadi (avval vaqt bo'yicha taxmin qilinardi) |

---

## 4. Ma'lumotlar bazasi tozalash

Bu bosqich asosan ichki o'zgarishlar (indexlar, tenant izolyatsiyasi). Frontendga ta'siri kichik:

| Endpoint | O'zgarish |
| --- | --- |
| `POST /subjects`, `PATCH /subjects/:id` | Shu nomli **faol** fan bo'lsa — `409 "Bu nomli fan allaqachon mavjud"` (avval tushunarsiz `"Bu tenantId, name allaqachon mavjud"`). **O'chirilgan** fan nomini qayta ishlatish mumkin (avval bloklanardi) |
| `DELETE /reward-category/:id` | Endi **soft delete** (avval bazadan butunlay o'chirilardi). Javob — o'chirilgan kategoriya obyekti, uning `name` i `"... [o'chirilgan xxxxxxxx]"` ko'rinishiga o'zgaradi. Faol sovg'asi bor kategoriyani o'chirib bo'lmaydi — `409` (avvalgidek) |
| `GET /reward-category`, `GET /reward-category/:id` | O'chirilgan kategoriyalar endi qaytmaydi. `_count.rewards` — faqat o'chirilmagan sovg'alar soni |
| `POST /reward-category`, `PATCH /reward-category/:id` | O'chirilgan kategoriya nomini qayta ishlatish mumkin. Faol nom band bo'lsa — `409 "Bu nomli kategoriya allaqachon mavjud"` |
| `POST /rewards`, `PATCH /rewards/:id` | `categoryId` shu tenantdagi o'chirilmagan kategoriya bo'lishi shart — aks holda `404 "Kategoriya topilmadi"` (avval boshqa tenant kategoriyasi ham o'tardi) |
| Coin tranzaksiyalari, xaridlar, yo'qlama yozuvlari | Javoblarda yangi `tenantId` maydoni (qo'shimcha, hech narsa o'zgarmaydi) |

> O'chirilgan fan/kategoriya nomi `"Matematika [o'chirilgan 3f2c1a9e]"` ko'rinishida saqlanadi. Ular ro'yxatlarda ko'rinmaydi, lekin eski sessiya yoki sovg'a ma'lumotida (masalan, tarixdagi darsning fani) shu nom chiqishi mumkin.

---

## 5. Unumdorlik va ishonchlilik

Request va response formatlari **o'zgarmadi**. Frontend sezishi mumkin bo'lgan farqlar:

| O'zgarish | Frontendga ta'siri |
| --- | --- |
| Har bir so'rovda auth/rol tekshiruvi 3 ta DB so'rovi o'rniga 1 ta | Barcha endpointlar biroz tezroq |
| `POST /sessions/:id/attendance` va `POST /sessions/:id/results` — butun ro'yxat **bitta tranzaksiyada** | Xato bo'lsa hech kim saqlanmaydi (avval xato chiqqan joygacha saqlanib qolardi). Xatodan keyin formani o'zgarishsiz qayta yuborish xavfsiz. Katta guruhlarda tezroq |
| Yangi `GET /api/health` | Monitoring uchun (auth talab qilinmaydi) |

### `GET /api/health`

Auth talab qilinmaydi. Load balancer, docker healthcheck yoki status sahifasi uchun.

**Response `200`:**

```json
{
  "status": "ok",
  "db": "up",
  "dbLatencyMs": 3,
  "uptimeSeconds": 86400
}
```

**Response `503`** — server ishlayapti, lekin DB'ga ulanib bo'lmadi:

```json
{ "status": "error", "db": "down" }
```

> Frontend xato sahifasida (masalan, ko'p `5xx` kelganda) shu endpoint orqali "server texnik ishlarda" degan holatni aniqlashi mumkin.

---

## Xato holatlari

| Status | `code` | Qachon |
| --- | --- | --- |
| `400` | — | `oldPassword` yo'q; noto'g'ri `avatarUrl`; rasm emas fayl; login ma'lumotlari noto'g'ri |
| `401` | — | Sessiya yo'q yoki muddati o'tgan; user arxivlangan/o'chirilgan yoki tenant to'xtatilgan (tizimga kirib turganda) |
| `400` | `TEACHER_COIN_LIMIT_EXCEEDED` | Teacher coin miqdori tenant limitidan oshdi (javobda `limit`) |
| `400` | `SESSION_LOCKED` | Yo'qlama/natija saqlash paytida sessiya qulflandi |
| `400` | `SESSION_NOT_STARTED` | Dars hali boshlanmagan — yo'qlama qo'yib bo'lmaydi |
| `400` | `INVALID_TIME_RANGE` | Tugash vaqti boshlanishdan keyin emas |
| `403` | `ATTENDANCE_EDIT_WINDOW_EXPIRED` | Teacher: saqlangan yo'qlamani tahrirlash muddati (3 kun) tugagan |
| `403` | `SESSION_DATE_TOO_OLD` | Teacher: 7 kundan eski sanaga dars yaratish |
| `409` | `SESSION_DUPLICATE` | Shu guruh, sana va vaqtda dars allaqachon bor |
| `409` | `SCHEDULE_CONFLICT` | Guruh, xona yoki o'qituvchi shu vaqtda band (`conflict.kind`) |
| `400` | `ATTENDANCE_STATUS_MISMATCH` | Yo'qlamada `status` va `isPresent` mos emas |
| `400` | `STUDENTS_NOT_IN_GROUP` | O'quvchi dars sanasida guruh a'zosi bo'lmagan |
| `403` | `TENANT_INACTIVE` | Login: tashkilot faoliyati to'xtatilgan |
| `403` | — | Ruxsat yo'q: rol yetarli emas (kurs/xona), o'zidan yuqori/teng darajadagi user yoki rol, tizim tenanti amallari, eski parol noto'g'ri |
| `404` | — | User/o'quvchi topilmadi (admin uchun boshqa tenant useri ham "topilmadi" bo'ladi); guruh/dars/qoida topilmadi |
| `409` | — | Tranzaksiya allaqachon bekor qilingan |
| `429` | — | Juda ko'p urinish |

---

## O'zgarishlar jurnali

| Sana | O'zgarish |
| --- | --- |
| 2026-11-18 | `PATCH /users/:id/change-password`: o'z parolida `oldPassword` majburiy, admin faqat o'z tenantidagi past darajadagi userga; parol o'zgarganda barcha sessiyalar bekor qilinadi |
| 2026-11-18 | `courses` va `rooms`: yozish faqat admin/super_admin, o'qish admin/super_admin/teacher |
| 2026-11-18 | Avatar yuklash: fayl turi baytlar bo'yicha tekshiriladi, nomi UUID; `avatarUrl` faqat `/uploads/avatars/...` yoki `https://...` |
| 2026-11-18 | `passwordHash`, `refreshTokenHash`, `passwordResetToken`, `passwordResetExpiry` hech bir javobda qaytmaydi |
| 2026-11-18 | Login/refresh/har bir so'rov: arxivlangan user va to'xtatilgan tenant bloklanadi; login'da `403 TENANT_INACTIVE` |
| 2026-11-18 | Admin ierarxiyasi: faqat o'zidan past darajadagi userni boshqarish va rol tayinlash; admin rolini faqat super_admin beradi |
| 2026-11-18 | Login, forgot/reset-password: username bo'yicha 15 daqiqada 10 urinish; `429` xabari o'zbekcha |
| 2026-11-18 | Tizim tenantini o'chirish, nofaol qilish va slug'ini o'zgartirish taqiqlandi |
| 2026-11-18 | Prisma ichki xato matni klientga chiqmaydi; production'da CORS faqat `FRONTEND_DOMEN`, Swagger o'chiq |
| 2026-11-18 | Qo'lda coin: `sourceType` faqat `manual`/`bonus`, `amount` ≤ 100 000, `note` ≤ 500; `groupId`/`sessionId`/`ruleId` tenant va teacher bo'yicha tekshiriladi; `apply-rule` avtomatik qoidalarni rad etadi |
| 2026-11-18 | Yangi `GET/PATCH /tenant-settings` — `teacherCoinLimit`; teacher uchun manual, bulk, apply-rule, results va coin qoidalarida `TEACHER_COIN_LIMIT_EXCEEDED` |
| 2026-11-18 | Coin qoidalari: `coinAmount` 1…100 000; teacher faqat o'z guruhi uchun (`groupId` majburiy) |
| 2026-11-18 | **Bekor qilish teskari yozuv bilan:** asl yozuv tarixda qoladi; `reversalOfId`, `reversal`, `purchaseId` maydonlari; cancel javobida `reversalTransactionId`, `newBalance`; xarid va sessiya coinlarini cancel orqali bekor qilib bo'lmaydi; qayta bekor qilish `409` |
| 2026-11-18 | Coin amallari va yo'qlama saqlash qulf ostida — dublikat coin va manfiy balans imkonsiz |
| 2026-11-18 | Vaqt maydonlari qat'iy `HH:MM`; sessiya yaratish/tahrirlashda `SESSION_DUPLICATE` va guruh/xona/o'qituvchi bandligi (`SCHEDULE_CONFLICT`); sessiya o'qituvchisi faqat teacher/admin rolida |
| 2026-11-18 | Teacher: 7 kundan eski sanaga sessiya yarata olmaydi (`SESSION_DATE_TOO_OLD`), sessiya o'qituvchisini almashtira olmaydi |
| 2026-11-18 | Yo'qlama faqat dars boshlangandan keyin (`SESSION_NOT_STARTED`); teacher saqlangan yo'qlamani 3 kun tahrirlaydi (`ATTENDANCE_EDIT_WINDOW_EXPIRED`); yangi `checkedAt`, `templateId` maydonlari |
| 2026-11-18 | Jadval shablonlari: havolalar tenant bo'yicha tekshiriladi, o'qituvchi bandligi; shablon/istisno o'zgarganda kelajakdagi sessiyalar sinxronlanadi (`sessionSync`) |
| 2026-11-18 | Istisnolar: o'chirilgan sanaga qayta qo'yish mumkin, vaqt majburiyligi; `generate-sessions` ≤ 92 kun, `conflicts`, `skipped` ma'nosi o'zgardi |
| 2026-11-18 | Tenant `timezone` (`GET/PATCH /tenant-settings`), "bugun" tenant vaqti bo'yicha |
| 2026-11-18 | Davomat holatlari: `status` (`present`/`late`/`excused`/`absent`), `late` coin qoidasi (`sourceType: "late"`); `isPresent` eski format sifatida ishlaydi |
| 2026-11-18 | Yo'qlama faqat dars sanasidagi guruh a'zolari uchun; yangi `GET /sessions/:id/roster`; `GroupStudent.leftAt` |
| 2026-11-18 | Dam olish kunlari: `GET/POST/DELETE /holidays`; `generate-sessions` javobida `holidays` |
| 2026-11-18 | Shablon `validFrom`/`validTo` (to'qnashuv tekshiruvi muddatni hisobga oladi); istisnoda o'rinbosar `teacherId` va `roomId`; kalendar javobiga `holiday`, `exception.teacher/room`, `template.validFrom/validTo`, `session.templateId` |
| 2026-11-18 | Fan va sovg'a kategoriyasi: o'chirilgan nomni qayta ishlatish mumkin, aniq `409` xabarlari; kategoriya soft delete; sovg'ada `categoryId` tenant bo'yicha tekshiriladi; tranzaksiya/xarid/yo'qlama javoblarida `tenantId` |
| 2026-11-18 | Yo'qlama/natija bitta tranzaksiyada (hammasi yoki hech narsa); auth tekshiruvi 1 ta DB so'rovi; yangi `GET /api/health` |
