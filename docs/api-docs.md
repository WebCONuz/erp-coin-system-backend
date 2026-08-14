# ERP Coin System — Frontend API Reference

> O'quv markazlari uchun multi-tenant gamifikatsiya tizimi. O'quvchilar davomat va uy vazifasi asosida avtomatik tanga oladi, yig'gan tangalarini virtual do'kondan sovg'alarga almashtiradi.

**Base URL:** `http://localhost:3031/api`  
**Auth:** HttpOnly Cookie (Authorization header emas)  
**Format:** JSON

---

## Mundarija

- [Autentifikatsiya](#autentifikatsiya)
- [Rol tizimi](#rol-tizimi)
- [Xato kodlari](#xato-kodlari)
- [Pagination](#pagination)
- [Auth endpointlari](#auth-endpointlari)
- [O'quvchilar (Students)](#oquvchilar-students)
- [Foydalanuvchilar (Users)](#foydalanuvchilar-users)
- [Guruhlar (Groups)](#guruhlar-groups)
- [Dars Jadvali (Schedule)](#dars-jadvali-schedule)
- [Darslar (Sessions)](#darslar-sessions)
- [Tanga Qoidalari (Coin Rules)](#tanga-qoidalari-coin-rules)
- [Tanga Tranzaksiyalari](#tanga-tranzaksiyalari)
- [Do'kon va Sovg'alar](#dokon-va-sovgalar)
- [Xaridlar (Purchases)](#xaridlar-purchases)
- [Xabar Yuborish](#xabar-yuborish)
- [Audit Log](#audit-log)

---

## Autentifikatsiya

Tizim JWT tokenlarini **HttpOnly cookie**da saqlaydi. Frontendda:

```js
// Axios
const api = axios.create({
  baseURL: 'http://localhost:3031/api',
  withCredentials: true, // ← shart!
});

// Fetch
fetch('/api/...', { credentials: 'include' });
```

Cookie nomlari:

- `access_token` — 15 daqiqa
- `refresh_token` — 1 kun

Token muddati tugaganda `401` qaytadi. Interceptor'da `/auth/refresh` chaqiring:

```js
api.interceptors.response.use(null, async (err) => {
  if (err.response?.status === 401) {
    await api.post('/auth/refresh');
    return api(err.config);
  }
  return Promise.reject(err);
});
```

---

## Rol tizimi

```
creator (lv 100) > super_admin (lv 90) > admin > teacher > student
```

- Yuqori level rollar quyi level endpointlarga ham kira oladi
- `super_admin` boshqa tenant ma'lumotlarini `?tenantId=uuid` query bilan ko'rishi mumkin
- Oddiy foydalanuvchilar tokendan faqat o'z `tenantId`larini oladi

---

## Xato kodlari

| Status | Ma'nosi                                  |
| ------ | ---------------------------------------- |
| `400`  | Validatsiya xatosi yoki noto'g'ri so'rov |
| `401`  | Token yo'q yoki muddati tugagan          |
| `403`  | Rol ruxsati yetarli emas                 |
| `404`  | Resurs topilmadi                         |
| `409`  | Duplikat (telefon, jadval to'qnashuvi)   |

```json
{
  "statusCode": 400,
  "message": "phone must match +998XXXXXXXXX",
  "error": "Bad Request"
}
```

---

## Pagination

Barcha ro'yxat endpointlari `page` + `limit` qabul qiladi:

```
GET /students?page=1&limit=20
```

Response:

```json
{
  "data": [...],
  "meta": {
    "total": 142,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

---

## Auth Endpointlari

### `POST /auth/login`

**Body:**

```json
{
  "phone": "+998901234567",
  "password": "Parol123!"
}
```

**200 Response:**

```json
{
  "user": {
    "id": "uuid",
    "fullName": "Ali Valiyev",
    "phone": "+998901234567",
    "role": { "name": "admin", "level": 50 }
  }
}
```

> Cookie: `access_token` (15min) + `refresh_token` (1kun) avtomatik set bo'ladi.

---

### `POST /auth/logout`

Cookie'larni o'chiradi, refresh token DB dan null qilinadi. Body kerak emas.

---

### `POST /auth/refresh`

Yangi `access_token` hosil qiladi. `refresh_token` cookie'dan o'qiladi. Body kerak emas.

---

### `GET /users/me`

Ruxsat: **barcha rollar**

Tizimga kirgan foydalanuvchining to'liq profili.

---

## O'quvchilar (Students)

### `GET /students`

Ruxsat: `admin`, `super_admin`, `teacher`

| Query param | Tur     | Izoh                             |
| ----------- | ------- | -------------------------------- |
| `search`    | string  | Ism yoki telefon bo'yicha        |
| `groupId`   | UUID    | Guruh bo'yicha filter            |
| `isActive`  | boolean | `true`=faol, `false`=arxivlangan |
| `page`      | number  | Default: 1                       |
| `limit`     | number  | Default: 20                      |
| `tenantId`  | UUID    | Faqat `super_admin` uchun        |

> Teacher faqat o'z guruhidagi studentlarni ko'radi.

---

### `GET /students/all`

Ruxsat: `super_admin`

O'chirilgan (`isDeleted: true`) studentlar ham ko'rinadi.

---

### `GET /students/:id`

Ruxsat: `admin`, `teacher`

To'liq profil — wallet, guruhlar, so'nggi 20 davomat, so'nggi 20 tanga, so'nggi 20 xarid va statistika.

**200 Response:**

```json
{
  "id": "uuid",
  "fullName": "Ali Valiyev",
  "phone": "+998901234567",
  "email": "ali@email.com",
  "parentPhone": "+998901111111",
  "avatarUrl": "/uploads/avatars/photo.jpg",
  "isActive": true,
  "wallet": { "balance": 250 },
  "groupMemberships": [...],
  "attendanceAsStudent": [...],
  "coinTransactionsReceived": [...],
  "purchases": [...],
  "stats": {
    "totalSessions": 48,
    "presentCount": 42,
    "absentCount": 6,
    "homeworkDoneCount": 38,
    "totalCoinsEarned": 320,
    "totalCoinsDeducted": 70,
    "totalPurchases": 5
  }
}
```

---

### `DELETE /students/:id`

Ruxsat: `admin`, `super_admin`

Body ichidagi maydonga qarab 4 xil amal bajaradi:

| Body                     | Amal                          |
| ------------------------ | ----------------------------- |
| `{ "isActive": false }`  | Arxivlash                     |
| `{ "isActive": true }`   | Arxivdan qaytarish            |
| `{ "isDeleted": true }`  | Soft delete                   |
| `{ "isDeleted": false }` | Tiklash (faqat `super_admin`) |

---

### `PATCH /students/:id/avatar`

Ruxsat: `admin`, `super_admin`

`multipart/form-data`, field nomi: `avatar`. Ruxsat: JPEG, PNG, WebP, GIF. Max: 2MB.

```js
const form = new FormData();
form.append('avatar', file);
await api.patch(`/students/${id}/avatar`, form);
```

**200 Response:**

```json
{ "id": "uuid", "avatarUrl": "/uploads/avatars/1677...jpg" }
```

---

## Foydalanuvchilar (Users)

### `POST /users`

Ruxsat: `admin`, `super_admin`

| Maydon        | Tur    |              | Izoh                   |
| ------------- | ------ | ------------ | ---------------------- |
| `phone`       | string | **required** | `+998XXXXXXXXX`        |
| `fullName`    | string | **required** |                        |
| `password`    | string | **required** | min 6 belgi            |
| `roleId`      | UUID   | **required** | `GET /roles` dan oling |
| `email`       | string | optional     |                        |
| `parentPhone` | string | optional     | `+998XXXXXXXXX`        |
| `avatarUrl`   | string | optional     |                        |

---

### `PATCH /users/:id`

Ruxsat: o'z profili yoki `admin`/`super_admin`

Barchasi optional — faqat yuborilgan maydonlar yangilanadi:

```json
{ "fullName": "...", "phone": "...", "email": "...", "parentPhone": "..." }
```

---

### `PATCH /users/:id/change-password`

Ruxsat: barcha (o'z paroli)

```json
{
  "oldPassword": "EskiParol",
  "newPassword": "YangiParol123"
}
```

> Admin boshqa foydalanuvchi parolini o'zgartirganda `oldPassword` ixtiyoriy.

---

## Guruhlar (Groups)

### `GET /groups`

Ruxsat: `admin`, `teacher`

| Query             |                       |
| ----------------- | --------------------- |
| `?courseId=uuid`  | Kurs bo'yicha         |
| `?teacherId=uuid` | O'qituvchi bo'yicha   |
| `?isActive=true`  | Faol guruhlar         |
| `?search=text`    | Nom bo'yicha qidirish |

---

### `POST /groups`

Ruxsat: `admin`, `super_admin`

```json
{
  "name": "Matematik 1-guruh",
  "courseId": "uuid",
  "teacherId": "uuid",
  "startDate": "2026-09-01",
  "endDate": "2026-12-31"
}
```

---

### `POST /groups/:id/students`

Ruxsat: `admin`, `teacher`

```json
{ "studentId": "uuid" }
```

> Agar student ilgari soft-delete qilingan bo'lsa, avtomatik tiklanadi.

---

### `POST /groups/:id/students/bulk`

Ruxsat: `admin`, `teacher`

```json
{ "studentIds": ["uuid1", "uuid2", "uuid3"] }
```

**200 Response:**

```json
{ "added": 3, "restored": 1, "alreadyIn": 0 }
```

---

### `DELETE /groups/:id/students/:studentId`

Ruxsat: `admin`, `teacher`

Guruhdan studentni chiqaradi. Student hisobi o'chirmaydi.

---

## Dars Jadvali (Schedule)

Jadval tizimi ikki qatlamli: **ScheduleTemplate** (haftalik takrorlanuvchi) + **ScheduleException** (istisno kunlar).

### `POST /schedule-templates`

Ruxsat: `admin`, `super_admin`

> Xona yoki guruh o'sha hafta kunida vaqt to'qnashsa `409 Conflict` qaytadi.

```json
{
  "weekday": "monday",
  "startTime": "09:00",
  "endTime": "11:00",
  "groupId": "uuid",
  "roomId": "uuid"
}
```

`weekday` qiymatlari: `monday` | `tuesday` | `wednesday` | `thursday` | `friday` | `saturday` | `sunday`

---

### `GET /schedule-templates`

Ruxsat: `admin`, `super_admin`, `teacher`

| Query             |                     |
| ----------------- | ------------------- |
| `?groupId=uuid`   | Guruh bo'yicha      |
| `?roomId=uuid`    | Xona bo'yicha       |
| `?weekday=monday` | Hafta kuni bo'yicha |

---

### `GET /schedule-templates/calendar`

Ruxsat: `admin`, `teacher`

| Query     |        |              |
| --------- | ------ | ------------ |
| `groupId` | UUID   | **required** |
| `year`    | number | **required** |
| `month`   | number | **required** |

**200 Response** — har sana uchun template + istisno + sessiyalar:

```json
{
  "2026-09-01": [{
    "template": { "id": "uuid", "weekday": "monday", "startTime": "09:00", "endTime": "11:00", "room": {...} },
    "exception": null,
    "sessions": [{ "id": "uuid", "isLocked": false, "topic": "Mavzu" }]
  }],
  "2026-09-08": [{
    "template": {...},
    "exception": { "isCancelled": true, "note": "Bayram" },
    "sessions": []
  }]
}
```

---

### `POST /schedule-templates/generate-sessions`

Ruxsat: `admin`, `super_admin`

Jadval shablonlaridan avtomatik Session yozuvlari yaratadi. Istisno kunlar va mavjud sessiyalar e'tiborga olinadi.

```json
{
  "groupId": "uuid",
  "fromDate": "2026-09-01",
  "toDate": "2026-09-30"
}
```

**200 Response:**

```json
{ "created": 12, "skipped": 2, "cancelled": 1 }
```

---

### `GET /schedule-templates/:id`

### `PATCH /schedule-templates/:id`

### `DELETE /schedule-templates/:id`

Ruxsat: `admin`, `super_admin`

**PATCH body** (barchasi optional):

```json
{ "startTime": "10:00", "endTime": "12:00", "roomId": "uuid" }
```

---

### `POST /schedule-templates/:id/exceptions`

Ruxsat: `admin`, `super_admin`

```json
{
  "exceptionDate": "2026-09-08",
  "isCancelled": true,
  "note": "Bayram sababli"
}
```

Agar `isCancelled: false` bo'lsa (vaqt o'zgardi):

```json
{
  "exceptionDate": "2026-09-15",
  "isCancelled": false,
  "startTime": "10:00",
  "endTime": "12:00",
  "note": "Xona almashtirish sababli"
}
```

---

### `GET /schedule-templates/:id/exceptions`

### `PATCH /schedule-exceptions/:id`

### `DELETE /schedule-exceptions/:id`

Ruxsat: `admin`, `super_admin`

---

## Darslar (Sessions)

### `POST /sessions`

Ruxsat: `admin`, `teacher`

```json
{
  "sessionDate": "2026-09-15",
  "startTime": "09:00",
  "endTime": "11:00",
  "sessionType": "lesson",
  "groupId": "uuid",
  "roomId": "uuid",
  "teacherId": "uuid",
  "topic": "Mavzu nomi"
}
```

`sessionType` qiymatlari: `lesson` | `exam` | `competition` | `extra`

---

### `GET /sessions`

Ruxsat: `admin`, `teacher`

| Query                 |     |
| --------------------- | --- |
| `?groupId=uuid`       |     |
| `?teacherId=uuid`     |     |
| `?sessionType=lesson` |     |
| `?date=2026-09-15`    |     |

---

### `PATCH /sessions/:id`

Ruxsat: `admin`, `teacher`

> Qulflangan sessiyani tahrirlash mumkin emas (`403`).

```json
{
  "topic": "...",
  "startTime": "...",
  "endTime": "...",
  "roomId": "...",
  "sessionType": "..."
}
```

---

### `POST /sessions/:id/attendance`

Ruxsat: `teacher`, `admin`

**Asosiy biznes logika:** Yo'qlama saqlaydi + avtomatik tanga beradi.

```json
{
  "records": [
    { "studentId": "uuid", "isPresent": true, "homeworkDone": true },
    { "studentId": "uuid", "isPresent": false, "homeworkDone": false }
  ]
}
```

Tanga hisoblash mantig'i:

- `isPresent: true` → davomat tangasi beriladi (`attendance earn` qoidasi bo'yicha)
- `homeworkDone: true` → uy vazifasi tangasi beriladi (`homework earn` qoidasi bo'yicha)
- `isPresent: false` + jarima qoidasi mavjud → tanga ayriladi (`attendance deduct`)

> Qulflangan sessionda yo'qlama yozib bo'lmaydi — avval unlock qiling.

---

### `POST /sessions/:id/lock`

Ruxsat: `teacher`, `admin`, `super_admin`

Darsni qulflaydi — keyinchalik tahrirlash va yo'qlama o'zgartirish bloklanadi. Body kerak emas.

**200 Response:**

```json
{ "id": "uuid", "isLocked": true, "lockedAt": "2026-09-15T10:00:00Z" }
```

---

### `POST /sessions/:id/unlock`

Ruxsat: `admin`, `super_admin` (teacher qulflay olmaydi)

Body kerak emas.

---

### `GET /sessions/:id/attendance`

Ruxsat: `admin`, `teacher`

Shu darsning yo'qlama yozuvlari.

---

### `DELETE /sessions/:id`

Ruxsat: `admin`, `super_admin`

Soft delete.

---

## Tanga Qoidalari (Coin Rules)

### `POST /coin-rules`

Ruxsat: `admin`, `super_admin`

```json
{
  "name": "Darsga kelgani uchun",
  "coinAmount": 5,
  "direction": "earn",
  "triggerType": "auto",
  "sourceType": "attendance",
  "groupId": null
}
```

| Maydon        | Qiymatlar                                                          |
| ------------- | ------------------------------------------------------------------ |
| `direction`   | `earn` \| `deduct`                                                 |
| `triggerType` | `auto` \| `manual`                                                 |
| `sourceType`  | `attendance` \| `homework` \| `competition` \| `manual` \| `bonus` |
| `groupId`     | UUID yoki `null` (barcha guruhlar)                                 |

**Tavsiya etilgan 3 ta asosiy qoida:**

| sourceType   | direction | Vazifa                            |
| ------------ | --------- | --------------------------------- |
| `attendance` | `earn`    | Kelgani uchun tanga               |
| `homework`   | `earn`    | Uy vazifasi uchun tanga           |
| `attendance` | `deduct`  | Kelmagani uchun jarima (optional) |

---

### `GET /coin-rules`

Ruxsat: `admin`, `super_admin`

---

### `PATCH /coin-rules/:id`

### `DELETE /coin-rules/:id`

Ruxsat: `admin`, `super_admin`

---

## Tanga Tranzaksiyalari

### `POST /coin-transactions/manual`

Ruxsat: `admin`, `teacher`

Teacher yoki admin qo'lda tanga beradi/ayiradi:

```json
{
  "studentId": "uuid",
  "amount": 15,
  "direction": "earn",
  "sourceType": "bonus",
  "note": "Olimpiadada 1-o'rin",
  "groupId": "uuid"
}
```

---

### `GET /coin-transactions/history`

Ruxsat: barcha

| Query                     |     |
| ------------------------- | --- |
| `?studentId=uuid`         |     |
| `?direction=earn\|deduct` |     |
| `?page=1&limit=20`        |     |

---

### `GET /coin-transactions/my-wallet`

Ruxsat: `student` (o'zi)

```json
{ "id": "uuid", "balance": 250, "updatedAt": "..." }
```

---

### `GET /coin-transactions/leaderboard`

Ruxsat: barcha

```
?limit=10
```

---

### `DELETE /coin-transactions/:id/cancel`

Ruxsat: `admin`

Tranzaksiyani bekor qiladi va wallet balansini qaytaradi.

---

## Do'kon va Sovg'alar

### `GET /rewards`

Ruxsat: barcha

| Query              |     |
| ------------------ | --- |
| `?categoryId=uuid` |     |
| `?isActive=true`   |     |
| `?page=1`          |     |

**Response (har bir sovg'a):**

```json
{
  "id": "uuid",
  "title": "Kitob",
  "coinPrice": 100,
  "stock": 5,
  "rewardType": "physical",
  "imageUrl": "/uploads/rewards/kitob.jpg"
}
```

`rewardType` qiymatlari: `physical` | `digital` | `privilege`

---

### `POST /rewards`

Ruxsat: `admin`, `super_admin`

```json
{
  "title": "Kitob",
  "description": "...",
  "coinPrice": 100,
  "stock": 10,
  "rewardType": "physical",
  "categoryId": "uuid"
}
```

---

## Xaridlar (Purchases)

### `POST /purchases`

Ruxsat: `student`

```json
{ "rewardId": "uuid" }
```

> Hamyon balansi tekshiriladi. Muvaffaqiyatli bo'lsa tanga ayriladi, xarid `pending` holatga o'tadi.

---

### `GET /purchases`

Ruxsat: barcha (student faqat o'zini)

| Query                                             |     |
| ------------------------------------------------- | --- |
| `?studentId=uuid`                                 |     |
| `?status=pending\|approved\|delivered\|cancelled` |     |
| `?page=1`                                         |     |

---

### `PATCH /purchases/:id/status`

Ruxsat: `admin`, `super_admin`

```json
{
  "status": "approved",
  "adminNote": "Topshirildi"
}
```

`status` qiymatlari: `approved` | `rejected`

---

## Xabar Yuborish

### `POST /messages/send`

Ruxsat: `admin`, `super_admin`

```json
{
  "recipientPhone": "+998901234567",
  "recipientEmail": "user@email.com",
  "message": "Sizning to'lovingiz...",
  "channels": ["sms", "email"]
}
```

**200 Response:**

```json
{
  "message": "Xabar yuborildi",
  "results": [
    { "channel": "sms", "success": true },
    { "channel": "email", "success": false, "error": "..." }
  ]
}
```

> `channels` massivida kamida bitta bo'lishi kerak. `sms` uchun `recipientPhone`, `email` uchun `recipientEmail` required.

---

## Audit Log

### `GET /audit-logs`

Ruxsat: `admin`, `super_admin`

| Query                                                           |                       |
| --------------------------------------------------------------- | --------------------- |
| `?actionType=create\|update\|delete\|archive\|coin_transaction` |                       |
| `?entityType=User\|Session\|...`                                |                       |
| `?entityId=uuid`                                                |                       |
| `?userId=uuid`                                                  | Kim bajarganiga qarab |
| `?fromDate=2026-01-01`                                          |                       |
| `?toDate=2026-12-31`                                            |                       |
| `?page=1&limit=20`                                              |                       |

---

## Qo'shimcha ma'lumot

**Backend docs (online):** `https://claude.ai/code/artifact/fd12e89b-a4b9-4301-a860-217fa0a31c98?via=auto_preview`

**Swagger UI (offline):** `http://localhost:3031/api/docs` — Basic auth (`kottaAdmin` / `12345`)

**Rate limit:** 10 req/s yoki 100 req/60s limitga ega. Oshib ketsa `429 Too Many Requests`.

**Avatar URL:** Barcha `avatarUrl` va `imageUrl` maydonlari nisbiy yo'l qaytaradi — to'liq URL uchun: `http://localhost:3031` + `avatarUrl`

**Sana formati:** Barcha sanalar ISO 8601: `YYYY-MM-DD` (input) va `2026-09-15T09:00:00.000Z` (output).
