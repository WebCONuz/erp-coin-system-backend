# Xavfsizlik va Barqarorlik Yangilanishi — Frontend API Qo'llanmasi

> ⚠️ **QORALAMA** — hujjat bosqichma-bosqich to'ldirilmoqda. Yakuniy versiya barcha bosqichlar tugagach beriladi. Hozir: **1-bosqich (xavfsizlik)** yozilgan.

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

## Xato holatlari

| Status | `code` | Qachon |
| --- | --- | --- |
| `400` | — | `oldPassword` yo'q; noto'g'ri `avatarUrl`; rasm emas fayl; login ma'lumotlari noto'g'ri |
| `401` | — | Sessiya yo'q yoki muddati o'tgan; user arxivlangan/o'chirilgan yoki tenant to'xtatilgan (tizimga kirib turganda) |
| `403` | `TENANT_INACTIVE` | Login: tashkilot faoliyati to'xtatilgan |
| `403` | — | Ruxsat yo'q: rol yetarli emas (kurs/xona), o'zidan yuqori/teng darajadagi user yoki rol, tizim tenanti amallari, eski parol noto'g'ri |
| `404` | — | User/o'quvchi topilmadi (admin uchun boshqa tenant useri ham "topilmadi" bo'ladi) |
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
