# Teacher Shaxsiy Kabinet — Frontend API Qo'llanmasi

> Ushbu hujjat frontendda yaratilayotgan **o'qituvchi shaxsiy kabineti** uchun backendda tayyorlangan barcha API'larni tasvirlaydi: profil ko'rish/tahrirlash, dashboard, o'z guruhlari, darslari, yo'qlama, tanga berish va tanga qoidalari.

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie (`access_token`, `refresh_token`) — `withCredentials: true` shart
**Format:** JSON

---

## Mundarija

- [Muhim qoidalar](#muhim-qoidalar)
- [1. Profil (ko'rish va tahrirlash)](#1-profil-korish-va-tahrirlash)
- [2. Dashboard](#2-dashboard)
- [3. Guruhlarim](#3-guruhlarim)
- [4. Dars jadvali (kalendar)](#4-dars-jadvali-kalendar)
- [5. Darslar va yo'qlama](#5-darslar-va-yoqlama)
- [6. Tanga berish](#6-tanga-berish)
- [7. Tanga qoidalari (Coin Rules)](#7-tanga-qoidalari-coin-rules)
- [8. O'quvchilarim](#8-oquvchilarim)
- [Xato holatlari](#xato-holatlari)
- [O'zgarishlar jurnali](#ozgarishlar-jurnali)

---

## Muhim qoidalar

1. **Cross-teacher izolyatsiya**: teacher faqat **o'zi dars beradigan guruhlar, sessiyalar va o'quvchilar** bilan ishlay oladi. Boshqa o'qituvchining guruhi/darsi/o'quvchisiga aralashish endi `403 Forbidden` bilan bloklanadi.
2. **Profilni tahrirlash**: teacher faqat `avatarUrl` va `email`ni o'zi o'zgartira oladi (`PATCH /users/me`). Telefon raqami, ism, rol — faqat Adminka orqali o'zgaradi (`PATCH /users/:id`, faqat `admin`/`super_admin`).
3. Dars (`Session`) yaratishda `POST /sessions` orqali `teacherId` yuborsangiz ham, agar siz `teacher` bo'lsangiz backend uni **e'tiborsiz qoldirib, avtomatik o'zingizni** qo'yadi — faqat o'z guruhingizga sessiya qo'sha olasiz.
4. Barcha ro'yxat endpointlari `{ data: [...], meta/total: {...} }` shaklida javob qaytaradi.

---

## 1. Profil (ko'rish va tahrirlash)

### `GET /users/me`

Ruxsat: barcha rollar. Endi teacher uchun **`taughtGroups`** ham qo'shildi.

```json
{
  "id": "uuid",
  "fullName": "Nodira Yusupova",
  "phone": "+998901234567",
  "email": "nodira@email.com",
  "avatarUrl": "/uploads/avatars/photo.jpg",
  "isActive": true,
  "role": { "id": "uuid", "name": "teacher", "displayName": "O'qituvchi" },
  "wallet": { "balance": 0 },
  "groupMemberships": [],
  "taughtGroups": [
    {
      "id": "uuid",
      "name": "Backend-24",
      "maxStudents": 20,
      "course": { "id": "uuid", "title": "Backend Development" },
      "_count": { "students": 18 }
    }
  ]
}
```

> `wallet` maydoni teacher uchun ma'nosiz (har bir userga avtomatik ochiladi) — frontendda teacher profilida ko'rsatmang.

### `PATCH /users/me`

Ruxsat: barcha rollar — **faqat o'zini**, **faqat quyidagi 2 maydonni** tahrirlaydi.

**Body:**

```json
{
  "email": "yangi-email@gmail.com",
  "avatarUrl": "/uploads/avatars/new-photo.jpg"
}
```

Ikkalasi ham ixtiyoriy, faqat yuborilgan maydon(lar) yangilanadi. Boshqa har qanday maydon (`phone`, `fullName`, `roleId`) yuborilsa ham e'tiborsiz qoldiriladi — DTO darajasida bloklangan.

**Xato:** `409` — email band.

> **Diqqat:** `PATCH /users/:id` (o'z ID'i bilan bo'lsa ham) endi faqat `admin`/`super_admin` uchun ishlaydi (`403` boshqalarga). Profilni o'zi tahrirlash uchun albatta `PATCH /users/me`dan foydalaning.

### `PATCH /users/:id/change-password`

Ruxsat: o'zi (`oldPassword` majburiy) yoki admin/super_admin (`oldPassword` shart emas).

```json
{ "oldPassword": "EskiParol123", "newPassword": "YangiParol456" }
```

---

## 2. Dashboard

### `GET /teachers/me/dashboard`

Ruxsat: `teacher` (`admin`/`super_admin` ham chaqira oladi, lekin ular uchun bo'sh natija qaytadi — bu endpoint faqat teacher uchun mo'ljallangan).

Bitta so'rovda kabinetning "Asosiy" sahifasi uchun kerakli hamma narsa: faol guruhlar/o'quvchilar soni, bugungi va shu haftalik darslar, **yo'qlama qilinmagan (kutilayotgan) sessiyalar**, so'nggi berilgan tangalar.

**200 Response:**

```json
{
  "teacher": {
    "id": "uuid",
    "fullName": "Nodira Yusupova",
    "avatarUrl": "/uploads/avatars/photo.jpg"
  },
  "groups": {
    "totalActive": 3,
    "totalStudents": 47,
    "list": [
      {
        "id": "uuid",
        "name": "Backend-24",
        "course": { "id": "uuid", "title": "Backend Development" },
        "_count": { "students": 18 }
      }
    ]
  },
  "todaySessions": [
    {
      "id": "uuid",
      "sessionDate": "2026-09-03T00:00:00.000Z",
      "startTime": "14:00",
      "endTime": "15:30",
      "sessionType": "lesson",
      "topic": "Algebra asoslari",
      "isLocked": false,
      "group": { "id": "uuid", "name": "Backend-24" },
      "room": { "id": "uuid", "name": "301-xona" }
    }
  ],
  "upcomingSessions": [
    {
      "id": "uuid",
      "sessionDate": "2026-09-05T00:00:00.000Z",
      "startTime": "10:00",
      "endTime": "11:30",
      "sessionType": "lesson",
      "group": { "id": "uuid", "name": "Frontend-11" }
    }
  ],
  "pendingAttendanceSessions": [
    {
      "id": "uuid",
      "sessionDate": "2026-09-02T00:00:00.000Z",
      "startTime": "14:00",
      "endTime": "15:30",
      "sessionType": "lesson",
      "group": { "id": "uuid", "name": "Backend-24" }
    }
  ],
  "recentCoinTransactions": [
    {
      "id": "uuid",
      "amount": 5,
      "direction": "earn",
      "sourceType": "attendance",
      "note": "Darsda qatnashgani uchun avtomatik bonus...",
      "createdAt": "2026-09-02T14:35:00.000Z",
      "student": { "id": "uuid", "fullName": "Ali Valiyev" }
    }
  ]
}
```

**Frontendda ishlatish tavsiyasi:**

- `groups.totalActive` / `groups.totalStudents` — kichik statistik kartochkalar
- `todaySessions` — "Bugungi darslarim" jadvali, har birida "Yo'qlama qilish" tugmasi
- `pendingAttendanceSessions` — **muhim bildirishnoma** bloki: "N ta darsingiz uchun yo'qlama kiritilmagan" (so'nggi 14 kun ichidan, qulflanmagan)
- `upcomingSessions` — shu haftalik reja preview
- `recentCoinTransactions` — "So'nggi faoliyatim" feed

---

## 3. Guruhlarim

### `GET /groups/me`

Ruxsat: `teacher` — o'zi dars beradigan barcha faol guruhlar.

```json
[
  {
    "id": "uuid",
    "name": "Backend-24",
    "maxStudents": 20,
    "isActive": true,
    "course": { "id": "uuid", "title": "Backend Development" },
    "_count": { "students": 18 }
  }
]
```

### `GET /groups/:id`

Ruxsat: teacher faqat **o'zi dars beradigan** guruhni ochishi mumkin (`403` boshqa guruh uchun). To'liq o'quvchilar ro'yxati bilan (`students[]`).

### `GET /groups?teacherId=...`

Umumiy ro'yxat endpointi — teacher chaqirsa **avtomatik faqat o'zinikiga** filtrlanadi (query orqali boshqa `teacherId` yuborilsa ham e'tiborsiz qoldiriladi).

---

## 4. Dars jadvali (kalendar)

### `GET /schedule-templates/calendar?groupId=...&year=2026&month=9`

Ruxsat: `teacher` — faqat **o'zi dars beradigan** guruh uchun (`groupId` boshqa teacherga tegishli bo'lsa `403`). Response formati avvalgidek (kun bo'yicha guruhlangan, `template`/`exception`/`session`).

### `GET /schedule-templates?groupId=&weekday=&roomId=`

Ro'yxat — teacher chaqirsa avtomatik faqat o'zi dars beradigan guruhlar jadvali qaytadi.

### `GET /schedule-templates/:id`, `GET /schedule-templates/:id/exceptions`

Teacher faqat o'z guruhiga tegishli shablonni ko'ra oladi.

> Jadval yaratish/tahrirlash/o'chirish (`POST`/`PATCH`/`DELETE`) hamon faqat `admin`/`super_admin` huquqi — teacher jadvalni o'zgartira olmaydi, faqat ko'radi.

---

## 5. Darslar va yo'qlama

### `POST /sessions`

Ruxsat: `admin`, `super_admin`, `teacher`. Teacher uchun `dto.groupId` albatta o'zi dars beradigan guruh bo'lishi kerak (`403` aks holda); `dto.teacherId` maydoni teacher uchun shart emas — yuborilsa ham e'tiborsiz qoldiriladi.

### `GET /sessions?groupId=&date=&sessionType=`

Teacher chaqirsa faqat **o'zi olib boradigan** sessiyalar qaytadi.

### `GET /sessions/:id`

Teacher faqat o'z sessiyasini ko'ra oladi.

### `PATCH /sessions/:id`

Teacher faqat o'z (qulflanmagan) sessiyasini tahrirlay oladi.

### `POST /sessions/:id/lock`

Teacher faqat o'z sessiyasini qulflay oladi. **Qulfdan ochish** (`POST /sessions/:id/unlock`) hamon faqat admin/super_admin.

### `POST /sessions/:id/attendance`

Yo'qlama qilish + avtomatik coin hisoblash. Teacher faqat o'z sessiyasi uchun chaqira oladi.

**Body:**

```json
{
  "records": [
    { "studentId": "uuid", "isPresent": true, "homeworkDone": true },
    { "studentId": "uuid", "isPresent": false, "homeworkDone": false }
  ]
}
```

### `GET /sessions/:id/attendance`

Bitta sessiya bo'yicha **barcha o'quvchilar** ro'yxati (ism, telefon, isPresent, homeworkDone). Faqat `admin`/`super_admin`/`teacher` — va teacher faqat o'z sessiyasi uchun.

---

## 6. Tanga berish

### `POST /coin-transactions/manual`

Ruxsat: `admin`, `super_admin`, `teacher`. Teacher faqat **o'zi dars beradigan guruhdagi** o'quvchiga tanga bera/ayira oladi (`403` boshqa o'quvchi uchun).

**Body:**

```json
{
  "studentId": "uuid",
  "amount": 15,
  "direction": "earn",
  "sourceType": "bonus",
  "note": "Olimpiadada faol ishtirok etgani uchun",
  "groupId": "uuid"
}
```

### `GET /coin-transactions/history`

Ruxsat: `admin`, `super_admin`, `teacher`. Teacher chaqirsa faqat **o'zi bergan** tranzaksiyalar qaytadi (avtomatik/qo'lda barchasi, chunki avtomatik davomat-bonuslarida ham `teacherId` = yo'qlama qilgan o'qituvchi).

---

## 7. Tanga qoidalari (Coin Rules)

### `GET /coin-rules`, `GET /coin-rules/:id`

Ruxsat: `admin`, `super_admin`, `teacher` (o'qish uchun — student ko'rmaydi).

### `POST /coin-rules`

Ruxsat: `admin`, `super_admin`, `teacher` — yangi qoida yaratish mumkin.

### `PATCH /coin-rules/:id`, `DELETE /coin-rules/:id`

Ruxsat: faqat `admin`, `super_admin` — mavjud (butun tenant miqyosidagi avtomatik) qoidani tahrirlash/o'chirish teacher uchun yopiq.

---

## 8. O'quvchilarim

### `GET /students?groupId=&search=`

Ruxsat: `admin`, `super_admin`, `teacher`. Teacher chaqirsa avtomatik faqat **o'z guruhlaridagi** o'quvchilar qaytadi (bu allaqachon ilgaridan ishlagan).

### `GET /students/:id`

To'liq profil — teacher faqat o'z guruhidagi o'quvchini ko'ra oladi (`403` aks holda).

---

## Xato holatlari

| Status | Qachon                                                                          |
| ------ | -------------------------------------------------------------------------------- |
| `401`  | Token yo'q/muddati tugagan → `/auth/refresh` chaqiring, keyin qaytadan          |
| `403`  | Teacher boshqa teacherning guruhi/darsi/o'quvchisiga aralashmoqchi bo'lganda    |
| `404`  | Resurs topilmadi yoki shu tenantga tegishli emas                                |
| `409`  | `PATCH /users/me`da email band                                                  |

```json
{
  "statusCode": 403,
  "message": "Siz faqat o'zingiz dars beradigan guruhga sessiya qo'sha olasiz",
  "error": "Forbidden"
}
```

---

## O'zgarishlar jurnali

**Yangi endpointlar:**

- `GET /teachers/me/dashboard`
- `PATCH /users/me`

**Kengaytirilgan:**

- `GET /users/me` — endi `taughtGroups` bilan

**Xavfsizlik tuzatishlari** (frontend eski xatti-harakatga tayanmasin):

- `PATCH /users/:id` — endi faqat `admin`/`super_admin`. Ilgari **hech qanday cheklov yo'q edi** — istalgan foydalanuvchi o'zining yoki boshqa birovning `roleId`sini o'zgartira olardi. Profilni o'zi tahrirlash endi faqat `PATCH /users/me` orqali (cheklangan maydonlar bilan).
- `POST /sessions`, `PATCH /sessions/:id`, `POST /sessions/:id/attendance`, `POST /sessions/:id/lock`, `GET /sessions`, `GET /sessions/:id`, `GET /sessions/:id/attendance` — teacher endi faqat **o'z** guruhi/sessiyasi bilan ishlay oladi (ilgari istalgan teacherning sessiyasini boshqarish mumkin edi).
- `GET /groups`, `GET /groups/:id`, `GET /schedule-templates*`, `POST /coin-transactions/manual`, `GET /coin-transactions/history` — xuddi shunday teacher-ownership tekshiruvi qo'shildi.
- `CoinRulesController` — ilgari **hech qanday `@Roles` yo'q edi** (student ham tanga qoidasi yarata/o'chira olardi). Endi: o'qish — `admin/super_admin/teacher`, yaratish — `admin/super_admin/teacher`, tahrirlash/o'chirish — faqat `admin/super_admin`.
