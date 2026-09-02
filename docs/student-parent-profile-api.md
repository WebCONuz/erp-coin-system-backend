# Student/Parent Shaxsiy Profil — Frontend API Qo'llanmasi

> Ushbu hujjat frontendda yaratilayotgan **student shaxsiy profil** layouti (4 ta sahifa: Asosiy, Shaxsiy profil, Guruhlar, Sovg'alar) uchun backendda tayyorlangan barcha API'larni tasvirlaydi.

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie (`access_token`, `refresh_token`) — `withCredentials: true` shart
**Format:** JSON

---

## Mundarija

- [Muhim qoidalar](#muhim-qoidalar)
- [Ota-ona (Parent) qanday kiradi](#ota-ona-parent-qanday-kiradi)
- [1. Asosiy (Dashboard)](#1-asosiy-dashboard)
- [2. Shaxsiy profil](#2-shaxsiy-profil)
- [3. Guruhlar](#3-guruhlar)
- [4. Sovg'alar (Marketplace)](#4-sovgalar-marketplace)
- [Xato holatlari](#xato-holatlari)
- [O'zgarishlar jurnali](#ozgarishlar-jurnali)

---

## Muhim qoidalar

1. **Student o'z ma'lumotlarini tahrirlay olmaydi.** Ism, telefon, avatar, parentPhone kabi maydonlar faqat Adminka (`admin`/`super_admin`) tomonidan o'zgartiriladi. Frontendda studentga hech qanday "tahrirlash" formasi ko'rsatilmasin — faqat **ko'rish** va **do'kondan sotib olish**.
2. Quyida sanab o'tilgan barcha `me`/`my-*` endpointlar **tokendan** studentning o'z ID'sini oladi — frontend hech qachon boshqa studentning ID'sini so'rov parametrida yubormaydi (imkoni ham yo'q, backend 403 qaytaradi).
3. Barcha ro'yxat endpointlari `{ data: [...], meta: { total, page, limit, totalPages } }` shaklida javob qaytaradi (agar boshqacha ko'rsatilmagan bo'lsa).
4. Sana filtrlari (`from`, `to`) `YYYY-MM-DD` formatida.

---

## Ota-ona (Parent) qanday kiradi

Tizimda alohida "parent" roli **yo'q**. Ota-ona farzandining login (`phone`) va parolidan foydalanib **xuddi shu studentning akkaunti** orqali kiradi — ya'ni frontendda alohida "parent view" qilish shart emas, quyidagi barcha endpointlar bitta login bilan ham student, ham ota-ona uchun ishlaydi. Shунга ko'ra:

- UI matnlarida faqat "sizning" emas, moslashuvchan so'z tanlang (masalan "Farzandingiz/Sizning natijalaringiz"), chunki bir xil ekranni ham o'quvchi, ham ota-ona ochishi mumkin.
- Parolni faqat Admin beradi/almashtiradi (talaba ro'yxatdan o'tganda yoki so'rov asosida).

---

## 1. Asosiy (Dashboard)

### `GET /students/me/dashboard`

Ruxsat: **student** (o'zi), shuningdek shu login orqali kirgan ota-ona.

Dashboard uchun bitta yengil, tayyor agregatsiya. Boshqa hech narsa so'rash shart emas — balans, haftalik/oylik o'zgarish, so'nggi 30 kunlik davomat foizi, bugungi va shu haftalik darslar, so'nggi tranzaksiyalar va xaridlar shu yerda.

**200 Response:**

```json
{
  "student": {
    "id": "uuid",
    "fullName": "Ali Valiyev",
    "avatarUrl": "/uploads/avatars/photo.jpg"
  },
  "wallet": {
    "balance": 250,
    "weekDelta": 35,
    "monthDelta": 120
  },
  "attendance": {
    "last30Days": {
      "totalSessions": 18,
      "presentCount": 16,
      "absentCount": 2,
      "attendanceRate": 89,
      "homeworkDoneCount": 14,
      "homeworkRate": 78
    }
  },
  "todaySessions": [
    {
      "id": "uuid",
      "sessionDate": "2026-09-02T00:00:00.000Z",
      "startTime": "14:00",
      "endTime": "15:30",
      "sessionType": "lesson",
      "topic": "Algebra asoslari",
      "group": { "id": "uuid", "name": "Backend-24" },
      "room": { "id": "uuid", "name": "301-xona" }
    }
  ],
  "upcomingSessions": [
    {
      "id": "uuid",
      "sessionDate": "2026-09-04T00:00:00.000Z",
      "startTime": "14:00",
      "endTime": "15:30",
      "sessionType": "lesson",
      "group": { "id": "uuid", "name": "Backend-24" }
    }
  ],
  "recentTransactions": [
    {
      "id": "uuid",
      "amount": 5,
      "direction": "earn",
      "sourceType": "attendance",
      "note": "Darsda qatnashgani uchun avtomatik bonus...",
      "createdAt": "2026-09-01T10:05:00.000Z"
    }
  ],
  "purchases": {
    "pendingCount": 1,
    "recent": [
      {
        "id": "uuid",
        "coinSpent": 100,
        "status": "pending",
        "purchasedAt": "2026-08-30T12:00:00.000Z",
        "reward": { "id": "uuid", "title": "Futbolka", "imageUrl": "..." }
      }
    ]
  }
}
```

**Frontendda ishlatish tavsiyasi:**

- `wallet.balance` — katta raqam sifatida asosiy widget
- `wallet.weekDelta`/`monthDelta` — "+35 shu hafta" degan kichik badge (manfiy bo'lsa qizil)
- `attendance.last30Days.attendanceRate` — donut/progress chart
- `todaySessions` — "Bugungi darslar" bloki (bo'sh bo'lsa "Bugun darsingiz yo'q")
- `upcomingSessions` — mini-jadval yoki kalendar preview
- `recentTransactions` — "So'nggi harakatlar" feed
- `purchases.pendingCount` — agar > 0 bo'lsa, "N ta xaridingiz tasdiqlanishini kutmoqda" degan bildirishnoma

---

## 2. Shaxsiy profil

### `GET /students/:id` (o'z ID'ingiz bilan chaqiring)

Ruxsat: student faqat **o'z** `id`si bilan chaqirsa ishlaydi (`403` boshqa ID uchun). Student ID'ni `GET /auth/me` orqali oling (login payload'da ham bor).

To'liq profil: shaxsiy ma'lumotlar, wallet, guruhlar, so'nggi 20 ta davomat/tranzaksiya/xarid va umumiy statistika.

**200 Response (qisqartirilgan):**

```json
{
  "id": "uuid",
  "fullName": "Ali Valiyev",
  "phone": "+998901234567",
  "email": "ali@email.com",
  "avatarUrl": "/uploads/avatars/photo.jpg",
  "parentPhone": "+998901111111",
  "isActive": true,
  "createdAt": "2026-01-15T08:00:00.000Z",
  "role": { "id": "uuid", "name": "student", "displayName": "O'quvchi" },
  "wallet": { "id": "uuid", "balance": 250, "updatedAt": "..." },
  "groupMemberships": [
    {
      "id": "uuid",
      "joinedAt": "2026-01-20T00:00:00.000Z",
      "isActive": true,
      "group": {
        "id": "uuid",
        "name": "Backend-24",
        "isActive": true,
        "course": { "id": "uuid", "title": "Backend Development" },
        "teacher": { "id": "uuid", "fullName": "Nodira Yusupova", "phone": "+998..." }
      }
    }
  ],
  "attendanceAsStudent": [ /* so'nggi 20 ta */ ],
  "coinTransactionsReceived": [ /* so'nggi 20 ta */ ],
  "purchases": [ /* so'nggi 20 ta */ ],
  "stats": {
    "totalSessions": 45,
    "presentCount": 40,
    "absentCount": 5,
    "homeworkDoneCount": 32,
    "totalCoinsEarned": 620,
    "totalCoinsDeducted": 370,
    "totalPurchases": 6
  }
}
```

> **Muhim:** Bu endpoint "hamma narsani bir joyda" ko'rsatadigan **og'ir** javob qaytaradi — asosan "Profil tafsilotlari" sahifasining pastki qismida (to'liq tarix) ishlatilsin, tezkor dashboard uchun emas (u uchun yuqoridagi `/students/me/dashboard` bor).

**Tahrirlash:** Bu sahifada hech qanday "Saqlash"/"Tahrirlash" tugmasi bo'lmasin. Agar foydalanuvchi (ota-ona) ma'lumot noto'g'ri deb hisoblasa, UI da "O'quv markazi administratoriga murojaat qiling" degan matn ko'rsating.

---

## 3. Guruhlar

### `GET /groups/me`

Ruxsat: **student** — o'zi a'zo bo'lgan guruhlar ro'yxati (agar `teacher` chaqirsa — o'zi dars beradigan guruhlar qaytadi, lekin bu sahifada kerak emas).

**200 Response (student uchun):**

```json
[
  {
    "membershipId": "uuid",
    "joinedAt": "2026-01-20T00:00:00.000Z",
    "membershipActive": true,
    "id": "uuid",
    "name": "Backend-24",
    "isActive": true,
    "course": { "id": "uuid", "title": "Backend Development" },
    "teacher": { "id": "uuid", "fullName": "Nodira Yusupova", "phone": "+998..." },
    "_count": { "students": 18 }
  }
]
```

### `GET /groups/:id`

Ruxsat: student faqat **o'zi a'zo bo'lgan** guruhni ochishi mumkin (`403` boshqa guruh uchun). Guruh ichidagi tafsilotlar — guruhdoshlar ro'yxati (`students[]`, ism+telefon bilan) shu yerda keladi.

```json
{
  "id": "uuid",
  "name": "Backend-24",
  "maxStudents": 20,
  "course": { "id": "uuid", "title": "Backend Development", "description": "..." },
  "teacher": { "id": "uuid", "fullName": "Nodira Yusupova", "phone": "+998..." },
  "students": [
    {
      "id": "uuid",
      "joinedAt": "2026-01-20T00:00:00.000Z",
      "student": { "id": "uuid", "fullName": "Vali Aliyev", "phone": "+998..." }
    }
  ]
}
```

> Bu javobda guruhdoshlarning ism va telefon raqami bor. Agar shaxsiy hayot siyosatingiz buni cheklashni talab qilsa, frontendda faqat `fullName`ni ko'rsating, `phone`ni chiqarmang.

### `GET /schedule-templates/calendar/me?year=2026&month=9`

Ruxsat: **student** — barcha faol guruhlarining oylik dars jadvali (kalendar) bitta so'rovda, kunlar bo'yicha guruhlangan.

**200 Response:**

```json
{
  "2026-09-04": [
    {
      "template": {
        "id": "uuid",
        "weekday": "friday",
        "startTime": "14:00",
        "endTime": "15:30",
        "room": { "id": "uuid", "name": "301-xona" }
      },
      "exception": null,
      "session": {
        "id": "uuid",
        "sessionDate": "2026-09-04T00:00:00.000Z",
        "startTime": "14:00",
        "endTime": "15:30",
        "isLocked": false,
        "sessionType": "lesson",
        "topic": null
      },
      "group": { "id": "uuid", "name": "Backend-24" }
    }
  ]
}
```

- `exception` — agar shu kun uchun dars bekor qilingan/vaqti o'zgargan bo'lsa (`isCancelled`, `note`) shu yerda ko'rinadi — UI da alohida rangda (masalan sariq/kulrang) ko'rsating.
- `session` — agar o'sha kun uchun `Session` yozuvi hali generatsiya qilinmagan bo'lsa `null` bo'lishi mumkin — bu holatda faqat `template` asosida "rejalashtirilgan dars" sifatida ko'rsating.

### `GET /sessions/me/attendance`

Ruxsat: **student** — o'z davomat tarixi, pagination va filtrlar bilan (statistika/chart sahifasi uchun mos).

| Query param | Tur    | Izoh                              |
| ----------- | ------ | ---------------------------------- |
| `groupId`   | UUID   | Muayyan guruh bo'yicha             |
| `from`      | date   | `YYYY-MM-DD`                       |
| `to`        | date   | `YYYY-MM-DD`                       |
| `page`      | number | Default: 1                         |
| `limit`     | number | Default: 20                        |

**200 Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "isPresent": true,
      "homeworkDone": true,
      "recordedAt": "2026-09-01T14:35:00.000Z",
      "session": {
        "id": "uuid",
        "sessionDate": "2026-09-01T00:00:00.000Z",
        "sessionType": "lesson",
        "topic": "Algebra asoslari",
        "group": { "id": "uuid", "name": "Backend-24" }
      }
    }
  ],
  "meta": { "total": 45, "page": 1, "limit": 20, "totalPages": 3 }
}
```

> **Diqqat:** `GET /sessions` va `GET /sessions/:id/attendance` (butun guruh ro'yxati) endi faqat `admin`/`super_admin`/`teacher` uchun ochiq — student klassdoshlarining davomat/uy vazifasi holatini ko'ra olmaydi (maxfiylik). Statistika/chart uchun faqat yuqoridagi `me/attendance` yoki `coin-transactions/my-stats` dan foydalaning.

---

## 4. Sovg'alar (Marketplace)

### `GET /rewards`

Ruxsat: hamma (login qilingan). Do'kondagi faol sovg'alar ro'yxati.

> ⚠️ Ilgari `isActive` parametri berilmasa backend **nofaol** sovg'alarni qaytarib yuborayotgan edi (bug) — bu **tuzatildi**. Endi parametrsiz so'rov avtomatik faqat `isActive:true` bo'lgan sovg'alarni qaytaradi.

| Query param   | Tur     | Izoh                          |
| ------------- | ------- | ------------------------------ |
| `search`      | string  | Nomi bo'yicha qidiruv          |
| `categoryId`  | UUID    | Kategoriya bo'yicha filtr      |
| `onlyInStock` | boolean | Faqat omborda borlar           |
| `isActive`    | boolean | Default: `true`                |
| `page`/`limit`| number  | Pagination                     |

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Futbolka",
      "description": "...",
      "coinPrice": 100,
      "stock": 5,
      "rewardType": "physical",
      "imageUrl": "...",
      "isActive": true
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 10,
  "totalPages": 2
}
```

### `POST /rewards/:id/purchase`

Ruxsat: **student**. Tanga yetarli bo'lsa avtomatik hisobdan yechiladi, `Purchase` yozuvi `pending` holatda yaratiladi (admin tasdiqlashi kerak).

**200 Response:**

```json
{
  "message": "Xarid so‘rovi muvaffaqiyatli yuborildi! Sovg‘a admin tomonidan tasdiqlanishini kuting.",
  "purchaseId": "uuid",
  "remainingCoins": 150
}
```

**Xatolar:** `400` — tanga yetarli emas / sovg'a omborda qolmagan; `404` — sovg'a topilmadi.

### `GET /purchases`

Ruxsat: student chaqirsa **avtomatik o'ziniki bilan filtrlanadi** (boshqa studentniki ko'rinmaydi). Xaridlar tarixi (status: `pending`/`approved`/`delivered`/`cancelled`).

| Query param | Tur  | Izoh                        |
| ----------- | ---- | ---------------------------- |
| `rewardId`  | UUID | Muayyan sovg'a bo'yicha      |
| `status`    | enum | `pending/approved/delivered/cancelled` |

```json
{
  "data": [
    {
      "id": "uuid",
      "coinSpent": 100,
      "status": "pending",
      "purchasedAt": "2026-08-30T12:00:00.000Z",
      "student": { "id": "uuid", "fullName": "Ali Valiyev", "phone": "+998..." },
      "reward": { "id": "uuid", "title": "Futbolka", "coinPrice": 100, "imageUrl": "..." }
    }
  ],
  "total": 6,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

### `GET /purchases/:id`

Ruxsat: student faqat **o'ziga tegishli** xaridni ko'ra oladi (`403` boshqa studentniki uchun — bu tekshiruv yangi qo'shildi).

---

## Balans va tarix — qo'shimcha (Sovg'alar sahifasida balans ko'rsatish uchun)

### `GET /coin-transactions/my-wallet`

```json
{ "id": "uuid", "balance": 250, "updatedAt": "2026-09-01T10:05:00.000Z", "userId": "uuid" }
```

### `GET /coin-transactions/my-history`

Pagination + filtrlar bilan to'liq tanga tarixi (`/students/:id` dagi 20 talik cheklovdan farqli, sahifalash bilan).

| Query param  | Tur    | Izoh                    |
| ------------ | ------ | ------------------------ |
| `direction`  | enum   | `earn` / `deduct`        |
| `sourceType` | enum   | `attendance/homework/competition/manual/bonus/purchase` |
| `from`/`to`  | date   | `YYYY-MM-DD`             |
| `page`/`limit` | number | Pagination             |

```json
{
  "data": [
    {
      "id": "uuid",
      "amount": 10,
      "direction": "earn",
      "sourceType": "homework",
      "note": "Uy vazifasini bajargani uchun bonus...",
      "createdAt": "2026-09-01T10:05:00.000Z",
      "teacher": { "id": "uuid", "fullName": "Nodira Yusupova" },
      "group": { "id": "uuid", "name": "Backend-24" }
    }
  ],
  "meta": { "total": 60, "page": 1, "limit": 20, "totalPages": 3 }
}
```

### `GET /coin-transactions/my-stats?period=week&count=7`

Chart (bar/line) uchun tayyor agregatsiya — earn/deduct trendi.

- `period=week` → `count` ta **kunlik** bucket (default 7 kun)
- `period=month` → `count` ta **haftalik** bucket (default 7 hafta, xohlasangiz `count=4` yuboring)

```json
{
  "period": "week",
  "buckets": [
    { "from": "2026-08-27", "to": "2026-08-27", "earned": 15, "deducted": 0 },
    { "from": "2026-08-28", "to": "2026-08-28", "earned": 0, "deducted": 5 }
  ],
  "totalEarned": 120,
  "totalDeducted": 15
}
```

> Frontendda `buckets`ni to'g'ridan-to'g'ri bar-chart'ga bering: X o'qi — `from` sana, Y o'qi — `earned` (yashil) va `deducted` (qizil) ustunlar.

### `GET /coin-transactions/leaderboard?limit=10`

Reyting (barcha uchun ochiq — do'st-guruhdoshlar bilan raqobat elementi).

```json
[
  {
    "id": "wallet-uuid",
    "balance": 500,
    "user": { "id": "uuid", "fullName": "Ali Valiyev", "avatarUrl": "..." }
  }
]
```

---

## Xato holatlari

| Status | Qachon                                                                 |
| ------ | ------------------------------------------------------------------------ |
| `401`  | Token yo'q/muddati tugagan → `/auth/refresh` chaqiring, keyin qaytadan   |
| `403`  | Student boshqa studentning ID/guruh/xaridini ochmoqchi bo'lganda        |
| `404`  | Resurs topilmadi yoki student shu tenant/guruhga tegishli emas          |
| `400`  | Masalan sovg'a uchun tanga yetarli emas                                 |

```json
{ "statusCode": 403, "message": "Siz faqat o'z profilingizni ko'ra olasiz", "error": "Forbidden" }
```

---

## O'zgarishlar jurnali

Ushbu funksionallik uchun backendda quyidagi yangi endpointlar qo'shildi:

- `GET /students/me/dashboard`
- `GET /groups/me`
- `GET /schedule-templates/calendar/me`
- `GET /sessions/me/attendance`
- `GET /coin-transactions/my-history`
- `GET /coin-transactions/my-stats`

Va quyidagi xavfsizlik/tuzatishlar kiritildi (frontend buni bilishi kerak — eski xatti-harakatga tayanmang):

- `GET /rewards` — `isActive` default bug tuzatildi (endi default faol sovg'alarni ko'rsatadi)
- `GET /groups`, `GET /groups/:id`, `GET /sessions`, `GET /sessions/:id/attendance`, `GET /coin-transactions/history`, `GET /students/:id`, `GET /purchases/:id` — student endi faqat o'ziga tegishli ma'lumotni ko'ra oladi (avval boshqalarniki ham ko'rinar edi)
- Guruh/dars/tanga/sovg'a **yaratish, tahrirlash, o'chirish** kabi amallar endi faqat `admin`/`super_admin`(/`teacher` — darslar uchun) huquqiga ega — student bunday amallarni bajara olmaydi
