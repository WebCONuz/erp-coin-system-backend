# Username bilan kirish va o'z profilini tahrirlash — Frontend API Qo'llanmasi

> Ushbu hujjat quyidagi o'zgarishlarni tasvirlaydi:
>
> 1. Barcha userlarga butun tizimda unique bo'lgan **`username`** maydoni qo'shildi.
> 2. Tizimga kirish endi **`username + parol`** orqali bo'ladi (`telefon + parol` emas).
> 3. Telefon raqam endi **faqat tenant ichida** unique: bir odam maktabda ham, o'quv markazda ham **bir xil raqam bilan alohida user** sifatida ro'yxatdan o'ta oladi.
> 4. Email endi unique emas. Parolni tiklash username orqali ishlaydi.
> 5. **Barcha rollar** (student, teacher, admin, super_admin, creator) o'z profilini ko'rishi va tahrirlashi mumkin (`GET/PATCH /users/me`).

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie (`access_token`, `refresh_token`) — `withCredentials: true` shart
**Format:** JSON

---

## Mundarija

- [Umumiy mantiq](#umumiy-mantiq)
- [Username qoidalari](#username-qoidalari)
- [Mavjud userlar nima bo'ladi](#mavjud-userlar-nima-boladi)
- [1. `POST /auth/login`](#1-post-authlogin)
- [2. `POST /auth/forgot-password`](#2-post-authforgot-password)
- [3. `GET /users/me` — o'z profilini ko'rish](#3-get-usersme--oz-profilini-korish)
- [4. `PATCH /users/me` — o'z profilini tahrirlash](#4-patch-usersme--oz-profilini-tahrirlash)
- [5. `PATCH /users/:id/change-password` — o'z parolini o'zgartirish](#5-patch-usersidchange-password--oz-parolini-ozgartirish)
- [6. `POST /users` — yangi user yaratish (admin)](#6-post-users--yangi-user-yaratish-admin)
- [7. `PATCH /users/:id` — userni tahrirlash (admin)](#7-patch-usersid--userni-tahrirlash-admin)
- [Boshqa javoblardagi o'zgarishlar](#boshqa-javoblardagi-ozgarishlar)
- [Frontendda ishlatish tavsiyalari](#frontendda-ishlatish-tavsiyalari)
- [Xato holatlari](#xato-holatlari)
- [O'zgarishlar jurnali](#ozgarishlar-jurnali)

---

## Umumiy mantiq

| Maydon     | Avval                           | Endi                                                 |
| ---------- | ------------------------------- | ---------------------------------------------------- |
| `username` | yo'q                            | **Majburiy**, butun tizimda unique, login shu orqali |
| `phone`    | Majburiy, butun tizimda unique  | Majburiy, **faqat tenant ichida** unique             |
| `email`    | Ixtiyoriy, butun tizimda unique | Ixtiyoriy, **unique emas**                           |

- Har bir user hali ham **bitta tenantga** tegishli. Bir odam 2 ta tenantda o'qisa, uning **2 ta alohida useri** bo'ladi, har birining username'i, paroli, walleti (coinlari) va xaridlari alohida. Bir tenantda yig'ilgan coin bilan boshqa tenantdan sovg'a olib bo'lmaydi.
- Qaysi tenantga kirishni **username** belgilaydi: login qilgandan keyin token o'sha userning tenantiga bog'lanadi. Tenant tanlash ekrani kerak emas.

---

## Username qoidalari

| Qoida          | Qiymat                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Uzunlik        | 3–30 belgi                                                                                        |
| Ruxsat etilgan | kichik lotin harflari `a-z`, raqamlar `0-9`, `_`, `.`                                             |
| Katta harflar  | Qabul qilinadi, lekin backend **kichik harfga** keltirib saqlaydi (`Ali_Valiyev` → `ali_valiyev`) |
| Bo'shliqlar    | Boshi va oxiridagi bo'shliqlar olib tashlanadi, o'rtada bo'shliq bo'lishi mumkin emas             |
| Unique'lik     | Butun tizim bo'yicha (barcha tenantlar)                                                           |

Regex (frontend validatsiyasi uchun, kichik harfga keltirilgandan keyin): `^[a-z0-9_.]{3,30}$`

Format mos kelmasa `400`:

```json
{
  "statusCode": 400,
  "message": [
    "Username 3–30 belgidan iborat bo'lishi va faqat lotin harflari, raqamlar, '_' va '.' dan tashkil topishi kerak"
  ],
  "error": "Bad Request"
}
```

---

## Mavjud userlar nima bo'ladi

Migratsiyada barcha mavjud userlarga username sifatida **`+` belgisiz telefon raqami** yozildi:

| Telefon         | Username       |
| --------------- | -------------- |
| `+998901234567` | `998901234567` |

- Mavjud userlar birinchi marta **`998901234567` + eski parol** bilan kiradi va keyin username'ni `PATCH /users/me` orqali o'zgartira oladi.
- `creator` va `super_admin` username'i serverdagi `.env` faylidan (`CREATOR_USERNAME`, `SUPER_ADMIN_USERNAME`) olinadi.

> 💡 Login sahifasida quyidagi yozuv foydali: _"Avval telefon raqam bilan kirgan bo'lsangiz, username sifatida raqamingizni `+` belgisiz kiriting (masalan `998901234567`)"_.

---

## 1. `POST /auth/login`

**Ruxsat:** hamma (public)

### Request Body

```json
{
  "username": "ali_valiyev",
  "password": "Parol123!"
}
```

| Maydon     | Turi     | Majburiymi | Izoh                                               |
| ---------- | -------- | ---------- | -------------------------------------------------- |
| `username` | `string` | ✅         | [Username qoidalari](#username-qoidalari) bo'yicha |
| `password` | `string` | ✅         | Kamida 6 belgi                                     |

> ⚠️ **Breaking change:** `phone` maydoni endi qabul qilinmaydi. Uni yuborsangiz `400` (`property phone should not exist`) qaytadi.

### Response (`200`)

`access_token` va `refresh_token` cookie'lari avtomatik o'rnatiladi.

```json
{
  "status": "success",
  "message": "Login successfully",
  "user": {
    "id": "uuid",
    "username": "ali_valiyev",
    "phone": "+998901234567",
    "fullName": "Ali Valiyev",
    "role": "student",
    "tenantId": "uuid"
  }
}
```

### Xato (`400`)

Username yoki parol noto'g'ri bo'lsa yoki user arxivlangan bo'lsa:

```json
{
  "statusCode": 400,
  "message": "Username yoki parol noto'g'ri",
  "error": "Bad Request"
}
```

---

## 2. `POST /auth/forgot-password`

**Ruxsat:** hamma (public)

Email endi unique bo'lmagani uchun user **username** orqali topiladi va parolni tiklash xati **o'sha userning emailiga** yuboriladi.

### Request Body

```json
{ "username": "ali_valiyev" }
```

> ⚠️ **Breaking change:** avval `{ "email": "..." }` yuborilardi.

### Response (`200`)

Xavfsizlik uchun javob har doim bir xil: user topilmasa ham, emaili bo'lmasa ham.

```json
{ "message": "Agar foydalanuvchining emaili bo'lsa, unga xabar yuborildi" }
```

> Userda email bo'lmasa, xat yuborilmaydi. Parolni admin tiklab beradi (`PATCH /users/:id/change-password`).

`POST /auth/reset-password` o'zgarmagan: `{ "token": "...", "newPassword": "..." }`.

---

## 3. `GET /users/me` — o'z profilini ko'rish

**Ruxsat:** barcha rollar: `student`, `teacher`, `admin`, `super_admin`, `creator`

`?tenantId=` **kerak emas**, super_admin va creator uchun ham.

### Response (`200`)

```json
{
  "id": "uuid",
  "username": "ali_valiyev",
  "phone": "+998901234567",
  "fullName": "Ali Valiyev",
  "email": "ali@gmail.com",
  "avatarUrl": "/uploads/avatars/photo.jpg",
  "parentPhone": "+998901111111",
  "isActive": true,
  "isDeleted": false,
  "tenantId": "uuid",
  "roleId": "uuid",
  "createdAt": "2026-09-01T10:00:00.000Z",
  "updatedAt": "2026-09-25T10:00:00.000Z",
  "role": {
    "id": "uuid",
    "name": "student",
    "displayName": "O'quvchi",
    "level": 20,
    "...": "..."
  },
  "tenant": {
    "id": "uuid",
    "name": "Najot Ta'lim",
    "slug": "najot",
    "type": "learning_center"
  },
  "wallet": { "balance": 120 },
  "groupMemberships": [
    {
      "id": "uuid",
      "isActive": true,
      "group": {
        "id": "uuid",
        "name": "Frontend-12",
        "course": { "...": "..." }
      }
    }
  ],
  "taughtGroups": []
}
```

| Maydon             | Izoh                                                                      |
| ------------------ | ------------------------------------------------------------------------- |
| `username`         | **Yangi**                                                                 |
| `tenant`           | **Yangi**: userning tenanti (`super_admin`/`creator` uchun System Tenant) |
| `wallet`           | Faqat studentda bo'ladi, qolganlarda `null`                               |
| `groupMemberships` | Student a'zo bo'lgan guruhlar                                             |
| `taughtGroups`     | Teacher dars beradigan guruhlar                                           |

---

## 4. `PATCH /users/me` — o'z profilini tahrirlash

**Ruxsat:** barcha rollar: `student`, `teacher`, `admin`, `super_admin`, `creator`

Faqat **yuborilgan** maydonlar yangilanadi. `?tenantId=` kerak emas.

### Request Body

```json
{
  "username": "ali_valiyev",
  "fullName": "Ali Valiyev",
  "phone": "+998901234567",
  "parentPhone": "+998901111111",
  "email": "ali@gmail.com",
  "avatarUrl": "/uploads/avatars/photo.jpg"
}
```

| Maydon        | Turi     | Izoh                                                                      |
| ------------- | -------- | ------------------------------------------------------------------------- |
| `username`    | `string` | **Yangi.** [Username qoidalari](#username-qoidalari). Band bo'lsa `409`   |
| `fullName`    | `string` | **Yangi.** Bo'sh bo'lmasligi kerak, ko'pi bilan 150 belgi                 |
| `phone`       | `string` | **Yangi.** `+998XXXXXXXXX`. O'z tenantida boshqa userda band bo'lsa `409` |
| `parentPhone` | `string` | **Yangi.** `+998XXXXXXXXX` (asosan student uchun)                         |
| `email`       | `string` | Email formati. Unique'lik tekshirilmaydi                                  |
| `avatarUrl`   | `string` | Rasm yo'li                                                                |

Bu yerdan **o'zgartirib bo'lmaydigan** maydonlar: `roleId`, `tenantId`, `password`, `isActive`. Ularni yuborsangiz `400` (`property ... should not exist`) qaytadi.

> ⚠️ Username o'zgargandan keyin user keyingi safar **yangi username** bilan kiradi. Joriy sessiya (cookie) davom etadi. Frontendda "Username o'zgardi, keyingi safar `<yangi>` bilan kiring" xabarini ko'rsatish tavsiya etiladi.

### Response (`200`)

Yangilangan user (`passwordHash`, `refreshTokenHash`, `passwordResetToken`, `passwordResetExpiry` qaytmaydi):

```json
{
  "id": "uuid",
  "username": "ali_valiyev",
  "phone": "+998901234567",
  "fullName": "Ali Valiyev",
  "email": "ali@gmail.com",
  "avatarUrl": "/uploads/avatars/photo.jpg",
  "parentPhone": "+998901111111",
  "isActive": true,
  "tenantId": "uuid",
  "roleId": "uuid",
  "role": {
    "id": "uuid",
    "name": "student",
    "displayName": "O'quvchi",
    "...": "..."
  },
  "...": "..."
}
```

### Xatolar

```json
{ "statusCode": 409, "message": "Bu username band", "error": "Conflict" }
```

```json
{
  "statusCode": 409,
  "message": "Bu telefon raqam ushbu tenantda allaqachon ro'yxatdan o'tgan",
  "error": "Conflict"
}
```

---

## 5. `PATCH /users/:id/change-password` — o'z parolini o'zgartirish

**Ruxsat:** barcha rollar (o'z paroli uchun). Endpoint o'zgarmagan, bu yerda profil sahifasi uchun eslatma sifatida keltirilgan.

`:id` — o'zingizning `id` ingiz (`GET /users/me` yoki login javobidan).

```json
{
  "oldPassword": "EskiParol123",
  "newPassword": "YangiParol123"
}
```

| Maydon        | Majburiymi      | Izoh                                                  |
| ------------- | --------------- | ----------------------------------------------------- |
| `oldPassword` | ✅ (o'zi uchun) | Student/teacher o'z parolini o'zgartirganda **shart** |
| `newPassword` | ✅              | Kamida 6 belgi                                        |

**Response (`200`):** `{ "message": "Parol muvaffaqiyatli o'zgartirildi" }`
**Xato (`403`):** `"Eski parol noto'g'ri"` yoki `"Ruxsat yo'q"`.

---

## 6. `POST /users` — yangi user yaratish (admin)

**Ruxsat:** `admin`, `super_admin` (super_admin/creator uchun `?tenantId=` majburiy)

### Request Body

```json
{
  "username": "ali_valiyev",
  "phone": "+998901234567",
  "fullName": "Ali Valiyev",
  "password": "Parol123!",
  "roleId": "uuid",
  "email": "ali@gmail.com",
  "parentPhone": "+998901111111",
  "avatarUrl": "/uploads/avatars/photo.jpg"
}
```

| Maydon        | Turi     | Majburiymi   | Izoh                                                            |
| ------------- | -------- | ------------ | --------------------------------------------------------------- |
| `username`    | `string` | ✅ **Yangi** | Butun tizimda unique. [Username qoidalari](#username-qoidalari) |
| `phone`       | `string` | ✅           | `+998XXXXXXXXX`. Endi **faqat shu tenant ichida** unique        |
| `fullName`    | `string` | ✅           |                                                                 |
| `password`    | `string` | ✅           | Kamida 6 belgi                                                  |
| `roleId`      | `UUID`   | ✅           | Shu tenantga tegishli rol (`GET /roles`)                        |
| `email`       | `string` | ❌           | Endi unique emas                                                |
| `parentPhone` | `string` | ❌           | `+998XXXXXXXXX`                                                 |
| `avatarUrl`   | `string` | ❌           |                                                                 |

> ⚠️ **Breaking change:** `username` endi majburiy. Yubormasangiz `400` qaytadi.

**Misol:** "Ali" maktabda `+998901234567` bilan ro'yxatda bor. O'quv markaz admini ham uni **shu raqam bilan** qo'sha oladi, faqat **boshqa username** berishi kerak (masalan `ali_markaz`). Natijada 2 ta alohida user bo'ladi, har birining coinlari alohida.

### Xatolar

| Status | Xabar                                                          |
| ------ | -------------------------------------------------------------- |
| `409`  | `Bu username band`                                             |
| `409`  | `Bu telefon raqam ushbu tenantda allaqachon ro'yxatdan o'tgan` |
| `400`  | `Bu tenantga tegishli bunday rol topilmadi`                    |

---

## 7. `PATCH /users/:id` — userni tahrirlash (admin)

**Ruxsat:** `admin`, `super_admin`

Barcha maydonlar ixtiyoriy. `POST /users` dagi maydonlar (paroldan tashqari) qabul qilinadi, jumladan **`username`**.

```json
{
  "username": "ali_valiyev",
  "phone": "+998901234567",
  "fullName": "Ali Valiyev"
}
```

- `username` band bo'lsa `409 Bu username band`.
- `phone` userning **o'z tenantida** band bo'lsa `409`.

---

## Boshqa javoblardagi o'zgarishlar

| Endpoint                                                                           | O'zgarish                                                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /auth/me`                                                                     | Javobda `username` bor                                           |
| `GET /users`, `GET /users/staff`, `GET /users/teachers`, `GET /users/teachers/:id` | Har bir userda `username` bor                                    |
| `GET /students`, `GET /students/all`, `GET /students/:id`                          | Har bir o'quvchida `username` bor                                |
| `GET /students/me/dashboard`                                                       | `student.username` qo'shildi                                     |
| `search` query (`/users`, `/users/staff`, `/users/teachers`, `/students`)          | Endi **username** bo'yicha ham qidiradi (ism, telefon, username) |

---

## Frontendda ishlatish tavsiyalari

1. **Login sahifasi**: "Telefon raqam" inputini **"Username"** ga almashtiring. Telefon maskasini (`+998 __ ___ __ __`) olib tashlang. Eski userlar uchun `+` siz raqam bilan kirish haqida yozuv qo'ying ([yuqoridagi eslatma](#mavjud-userlar-nima-boladi)).
2. **Parolni tiklash sahifasi**: `email` inputi o'rniga `username` inputi.
3. **User yaratish formasi (admin)**: `username` inputini qo'shing. Qulaylik uchun ism-familiyadan avtomatik taklif qilish mumkin (masalan `Ali Valiyev` → `ali.valiyev`), lekin admin o'zgartira olishi kerak. `409 Bu username band` bo'lsa inputning ostida ko'rsating.
4. **Profil sahifasi** (student, teacher, admin, super_admin, creator uchun **bitta umumiy sahifa**):
   - Ma'lumotlar: `GET /users/me`
   - Tahrirlash: `PATCH /users/me` (faqat o'zgargan maydonlarni yuboring)
   - Parol: `PATCH /users/{me.id}/change-password` (`oldPassword` bilan)
   - `tenant.name` ni sarlavhada ko'rsatish mumkin ("Najot Ta'lim — O'quvchi")
5. **Input validatsiyasi**: username'ni yuborishdan oldin `trim().toLowerCase()` qilib, `^[a-z0-9_.]{3,30}$` bilan tekshiring. Backend baribir tekshiradi, bu faqat UX uchun.

---

## Xato holatlari

| Status | Qachon                                                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| `400`  | Username formati noto'g'ri; login'da noto'g'ri username/parol; `phone` yoki ruxsat etilmagan maydon yuborilgan |
| `401`  | Token yo'q yoki muddati tugagan                                                                                |
| `403`  | Parol o'zgartirishda eski parol noto'g'ri / ruxsat yo'q                                                        |
| `404`  | User topilmadi (arxivlangan)                                                                                   |
| `409`  | Username band; telefon shu tenantda band                                                                       |

---

## O'zgarishlar jurnali

| Sana       | O'zgarish                                                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-25 | `User.username` qo'shildi (unique). Login `username + parol` orqali. `phone` tenant ichida unique, `email` unique emas. `forgot-password` username qabul qiladi. `PATCH /users/me` ga `username`, `fullName`, `phone`, `parentPhone` qo'shildi. `GET /users/me` javobiga `tenant` qo'shildi |
