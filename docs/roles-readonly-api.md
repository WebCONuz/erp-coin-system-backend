# Rollar (Roles) — Frontend API Qo'llanmasi

> Rollar endi **faqat backend tomonidan boshqariladi**. Frontend rollarni yarata, tahrirlay yoki o'chira olmaydi — faqat user yaratish/tahrirlash formasida rol tanlash uchun **o'qiydi** (`GET`).

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie (`access_token`, `refresh_token`) — `withCredentials: true` shart
**Format:** JSON

---

## Mundarija

- [1. Nima o'zgardi (qisqacha)](#1-nima-ozgardi-qisqacha)
- [2. Nima uchun](#2-nima-uchun)
- [3. Olib tashlangan endpointlar](#3-olib-tashlangan-endpointlar)
- [4. `GET /roles` — rollar ro'yxati](#4-get-roles--rollar-royxati)
- [5. `GET /roles/:id` — bitta rol](#5-get-rolesid--bitta-rol)
- [6. `POST /tenants` — endi rollar avtomatik yaratiladi](#6-post-tenants--endi-rollar-avtomatik-yaratiladi)
- [7. `POST /users`, `PATCH /users/:id` — `roleId` tekshiruvi](#7-post-users-patch-usersid--roleid-tekshiruvi)
- [8. Frontend uchun amaliy tavsiyalar](#8-frontend-uchun-amaliy-tavsiyalar)
- [Xato holatlari](#xato-holatlari)
- [O'zgarishlar jurnali](#ozgarishlar-jurnali)

---

## 1. Nima o'zgardi (qisqacha)

| Oldin | Endi |
| --- | --- |
| Admin panelda rollar CRUD (`POST/PATCH/DELETE /roles`) bor edi | **Olib tashlandi.** Faqat `GET /roles` va `GET /roles/:id` qoldi |
| Yangi tenant yaratilgach, rollarni qo'lda yaratish kerak edi | `POST /tenants` `admin`, `teacher`, `student` rollarini **avtomatik** yaratadi |
| `POST /users` ga istalgan `roleId` yuborish mumkin edi | `roleId` **shu tenantga tegishli** faol rol bo'lishi shart, aks holda `400` |

---

## 2. Nima uchun

Backend logikasi rol **nomlariga** (`admin`, `teacher`, `student`) tayanadi — masalan, "teacher faqat o'z guruhini ko'radi", "student faqat o'z xaridlarini ko'radi" kabi cheklovlar aynan shu nomlar bilan tekshiriladi. Agar rol boshqa nom bilan yaratilsa (`administrator`, `pupil`) yoki `level`i noto'g'ri qo'yilsa, ruxsatlar buziladi va xavfsizlik teshiklari paydo bo'ladi. Shuning uchun rollarni yaratish to'liq backendga o'tkazildi.

Har bir tenantda **aynan shu 3 ta rol** bo'ladi:

| `name` | `displayName` | `level` |
| --- | --- | --- |
| `admin` | Administrator | 60 |
| `teacher` | O'qituvchi | 40 |
| `student` | O'quvchi | 20 |

Tizim rollari (`creator` — 100, `super_admin` — 90) system tenantda yashaydi va tenant rollari ro'yxatida **chiqmaydi**.

---

## 3. Olib tashlangan endpointlar

| Method | Route | Holat |
| --- | --- | --- |
| `POST` | `/roles` | ❌ olib tashlandi → `404 Not Found` |
| `PATCH` | `/roles/:id` | ❌ olib tashlandi → `404 Not Found` |
| `DELETE` | `/roles/:id` | ❌ olib tashlandi → `404 Not Found` |

**Frontenddan olib tashlang:** "Rollar" boshqaruv sahifasi, rol yaratish/tahrirlash modal'lari, o'chirish tugmalari va ularga tegishli API chaqiruvlari.

---

## 4. `GET /roles` — rollar ro'yxati

**Ruxsat:** `admin`, `super_admin`

| Kim | So'rov |
| --- | --- |
| `admin` | `GET /roles` — o'z tenanti rollari (tenant tokendan olinadi) |
| `super_admin` | `GET /roles?tenantId=<tenant-uuid>` — `tenantId` **majburiy** |

**Query parametrlari (ixtiyoriy):**

| Param | Turi | Izoh |
| --- | --- | --- |
| `tenantId` | UUID | faqat `super_admin` uchun, majburiy |
| `search` | string | `name` yoki `displayName` bo'yicha qidiruv |
| `isActive` | `true` \| `false` | faollik bo'yicha filtr |
| `page` | number | default `1` |
| `limit` | number | default `20` |

**200 Response** (`level` bo'yicha o'sish tartibida):

```json
{
  "data": [
    {
      "id": "c1f0…",
      "name": "student",
      "displayName": "O'quvchi",
      "level": 20,
      "scope": "tenant",
      "isActive": true,
      "createdAt": "2026-09-24T06:00:00.000Z",
      "updatedAt": "2026-09-24T06:00:00.000Z",
      "tenantId": "a7b2…"
    },
    {
      "id": "d4e1…",
      "name": "teacher",
      "displayName": "O'qituvchi",
      "level": 40,
      "scope": "tenant",
      "isActive": true,
      "createdAt": "2026-09-24T06:00:00.000Z",
      "updatedAt": "2026-09-24T06:00:00.000Z",
      "tenantId": "a7b2…"
    },
    {
      "id": "e9a3…",
      "name": "admin",
      "displayName": "Administrator",
      "level": 60,
      "scope": "tenant",
      "isActive": true,
      "createdAt": "2026-09-24T06:00:00.000Z",
      "updatedAt": "2026-09-24T06:00:00.000Z",
      "tenantId": "a7b2…"
    }
  ],
  "meta": { "total": 3, "page": 1, "limit": 20, "totalPages": 1 }
}
```

> Response tuzilmasi **o'zgarmagan** — mavjud `GET /roles` integratsiyasi avvalgidek ishlaydi.

---

## 5. `GET /roles/:id` — bitta rol

**Ruxsat:** `admin`, `super_admin` (`super_admin` uchun `?tenantId=` majburiy)

Rol obyekti + `permissions` + `_count.users` (shu roldagi userlar soni) qaytadi. Boshqa tenantga tegishli yoki mavjud bo'lmagan rol uchun `404`.

---

## 6. `POST /tenants` — endi rollar avtomatik yaratiladi

**Ruxsat:** `super_admin`. **Request body o'zgarmagan.**

Tenant va uning 3 ta rolli **bitta atomik operatsiyada** yaratiladi: yoki hammasi yaratiladi, yoki hech biri (tenant rolsiz qolib ketmaydi).

**201 Response** — `data` ga yangi `roles` massivi qo'shildi:

```json
{
  "status": "success",
  "message": "Successfully created",
  "data": {
    "id": "a7b2…",
    "name": "Najot Ta'lim",
    "slug": "najot-talim",
    "plan": "basic",
    "type": "learning_center",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-09-24T06:00:00.000Z",
    "updatedAt": "2026-09-24T06:00:00.000Z",
    "deletedAt": null,
    "roles": [
      { "id": "e9a3…", "name": "admin", "displayName": "Administrator", "level": 60 },
      { "id": "d4e1…", "name": "teacher", "displayName": "O'qituvchi", "level": 40 },
      { "id": "c1f0…", "name": "student", "displayName": "O'quvchi", "level": 20 }
    ],
    "coinRules": [ /* asosiy coin qoidalari — qarang: coin-rules-built-in-api.md */ ]
  }
}
```

> `coinRules` — tenant bilan birga yaratiladigan asosiy coin qoidalari (Davomat, Uyga vazifa). Batafsil: [coin-rules-built-in-api.md](coin-rules-built-in-api.md).

Bu javobdagi `roles` dan foydalanib, tenant yaratilgandan keyin **darhol** uning birinchi adminini yaratish mumkin — `GET /roles` ni alohida chaqirish shart emas:

```ts
// axios: res.data — response body ({ status, message, data }), tenant esa body.data ichida
const res = await api.post('/tenants', form);
const tenant = res.data.data;
const adminRoleId = tenant.roles.find((r) => r.name === 'admin')!.id;
await api.post(`/users?tenantId=${tenant.id}`, { ...adminForm, roleId: adminRoleId });
```

---

## 7. `POST /users`, `PATCH /users/:id` — `roleId` tekshiruvi

Request body **o'zgarmagan**, faqat yangi tekshiruv qo'shildi. `roleId`:

- `POST /users` da — user yaratilayotgan tenantga (admin uchun o'z tenanti, `super_admin` uchun `?tenantId=`) tegishli bo'lishi,
- `PATCH /users/:id` da — **tahrirlanayotgan userning o'z tenantiga** tegishli bo'lishi (userni rol orqali boshqa tenantga "ko'chirib" bo'lmaydi),
- o'chirilmagan (`isDeleted: false`) va faol (`isActive: true`) bo'lishi shart.

Aks holda:

```json
{
  "statusCode": 400,
  "message": "Bu tenantga tegishli bunday rol topilmadi",
  "error": "Bad Request"
}
```

> `super_admin` boshqa tenantga user yaratayotganda `?tenantId=` va `roleId` **bir xil tenantdan** bo'lishi kerak — `GET /roles?tenantId=X` dan olingan `roleId` ni `POST /users?tenantId=X` ga yuboring.

### `super_admin` panel uchun ssenariylar

| Vazifa | So'rovlar |
| --- | --- |
| Tenantga admin/teacher/student qo'shish | `GET /roles?tenantId=<tenant>` → `POST /users?tenantId=<tenant>` |
| Yangi `super_admin` qo'shish | `GET /roles?tenantId=<system-tenant>` → `POST /users?tenantId=<system-tenant>` (`super_admin` roli system tenantda) |
| Userning rolini o'zgartirish | `GET /roles?tenantId=<userning tenanti>` → `PATCH /users/:id?tenantId=<userning tenanti>` |

> **Diqqat (breaking):** agar frontend ilgari bitta umumiy rollar ro'yxatidan (masalan system tenantdagi `super_admin` rolini) olib, uni **boshqa** tenant `?tenantId=` bilan yuborayotgan bo'lsa — endi `400` qaytadi. Rol ro'yxatini har doim **aynan shu tenant** uchun oling.

---

## 8. Frontend uchun amaliy tavsiyalar

1. **"Rollar" sahifasini olib tashlang** (yoki faqat o'qish uchun jadvalga aylantiring). Create/Edit/Delete tugmalari va modal'lar kerak emas.
2. **User yaratish formasi:** rol dropdown'ini `GET /roles` (`super_admin` bo'lsa `?tenantId=`) dan to'ldiring. Label sifatida `displayName` ni, value sifatida `id` ni ishlating.
3. **Mantiq uchun `name` ga, UI uchun `displayName` ga tayaning.** Shartlarni `role.name === 'student'` kabi yozing, `displayName` bilan emas — `displayName` kelajakda o'zgarishi mumkin, `name` esa o'zgarmaydi.
4. **Maxsus formalar** (masalan "Yangi o'quvchi qo'shish" sahifasi): dropdown ko'rsatmasdan, `roles.find(r => r.name === 'student').id` ni avtomatik yuboring.
5. **Rollar ro'yxatini keshlang** — ular deyarli hech qachon o'zgarmaydi. Har bir tenant uchun bir marta olib, sessiya davomida saqlash yetarli.
6. **`roleId` ni hardcode qilmang** — har bir tenantda UUID lar har xil.

---

## Xato holatlari

| Status | Qachon |
| --- | --- |
| `400` | `POST /users` / `PATCH /users/:id` — `roleId` shu tenantga tegishli emas, o'chirilgan yoki faol emas |
| `401` | Token yo'q/muddati tugagan → `/auth/refresh` chaqiring |
| `403` | `admin`/`super_admin` bo'lmagan foydalanuvchi `GET /roles` chaqirganda; `super_admin` `tenantId` bermaganda |
| `404` | `POST/PATCH/DELETE /roles` (endpoint mavjud emas); `GET /roles/:id` — rol topilmadi |
| `409` | `POST /tenants` — slug band |

---

## O'zgarishlar jurnali

**Olib tashlangan endpointlar (breaking):**

- `POST /roles`, `PATCH /roles/:id`, `DELETE /roles/:id`

**O'zgarmagan:**

- `GET /roles`, `GET /roles/:id` — request va response bir xil

**Kengaytirilgan javob:**

- `POST /tenants` — `data.roles` massivi qo'shildi (tenant bilan birga yaratilgan 3 ta rol)

**Yangi validatsiya:**

- `POST /users`, `PATCH /users/:id` — `roleId` tenantga tegishliligi tekshiriladi (`400`)

**Ma'lumotlar (backend tomonida):**

- Mavjud barcha tenantlarga yetishmayotgan `admin`/`teacher`/`student` rollari seed orqali qo'shiladi va `level` qiymatlari bir xil holatga keltiriladi — frontenddan hech qanday harakat talab qilinmaydi.
