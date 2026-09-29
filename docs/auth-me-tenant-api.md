# `GET /auth/me` — joriy tenant ma'lumoti — Frontend API Qo'llanmasi

> `GET /auth/me` javobiga **`data.tenant`** qo'shildi (`id`, `name`, `slug`, `type`). Admin panel tenant turiga (`learning_center`, `school`, ...) qarab menyu va maydonlarni ko'rsatishi/yashirishi uchun endi alohida so'rov kerak emas.

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie (`access_token`, `refresh_token`) — `withCredentials: true` shart
**Format:** JSON

---

## Mundarija

- [1. `GET /auth/me`](#1-get-authme)
- [`tenant` bloki](#tenant-bloki)
- [Frontendda ishlatish](#frontendda-ishlatish)
- [Nima o'zgarmadi](#nima-ozgarmadi)
- [Xato holatlari](#xato-holatlari)
- [O'zgarishlar jurnali](#ozgarishlar-jurnali)

---

## 1. `GET /auth/me`

Tizimga kirgan foydalanuvchi haqida ma'lumot. Javob formati (`{ status, message, data }`) va mavjud maydonlar **o'zgarmagan** — faqat `data.tenant` qo'shildi.

**Ruxsat:** barcha rollar (`creator`, `super_admin`, `admin`, `teacher`, `student`)

### Response (`200`)

```json
{
  "status": "success",
  "message": "Your full datas",
  "data": {
    "id": "5b1c…",
    "username": "admin_ali",
    "fullName": "Ali Valiyev",
    "phone": "+998901234567",
    "email": null,
    "avatarUrl": null,
    "isActive": true,
    "tenantId": "a3f0…",
    "roleId": "…",
    "role": {
      "id": "…",
      "name": "admin",
      "displayName": "Administrator",
      "level": 60,
      "...": "..."
    },
    "wallet": null,
    "tenant": {
      "id": "a3f0…",
      "name": "Najot Ta'lim",
      "slug": "najot-talim",
      "type": "learning_center"
    }
  }
}
```

---

## `tenant` bloki

| Maydon | Turi             | Izoh                                                                                         |
| ------ | ---------------- | -------------------------------------------------------------------------------------------- |
| `id`   | uuid             | `data.tenantId` bilan bir xil                                                                |
| `name` | string           | Tenant nomi (sarlavha, sidebar uchun)                                                        |
| `slug` | string           | Tenant slug'i                                                                                |
| `type` | `string \| null` | `learning_center` \| `school` \| `academic_lyceum` \| `college` \| `university`, yoki `null` |

- **Barcha rollarda** keladi: `admin`, `teacher`, `student` — o'z tenanti.
- `super_admin` / `creator` uchun — **system tenant** (`slug: "system"`, odatda `type: null`). Ular boshqa tenant bilan ishlaganda tanlangan tenant turini `GET /tenants/:id` dan oladi (bu endpoint ularga ochiq).
- `type: null` bo'lishi mumkin (tenant yaratilganda turi berilmagan bo'lsa) — frontend buni default holat (masalan, `learning_center` kabi) sifatida ko'rsin.

---

## Frontendda ishlatish

1. Ilova yuklanganda (yoki login'dan keyin) chaqiriladigan `GET /auth/me` javobidan `data.tenant` ni global store'ga (auth/user context) saqlang.
2. Tenant turiga bog'liq menyu va maydonlarni `data.tenant.type` bo'yicha ko'rsating/yashiring.
3. Admin tenant turini olish uchun **`GET /tenants/:id` ni chaqirmang** — admin uchun u `403` qaytaradi (bu ataylab: admin boshqa tenantlarni ko'rmasligi kerak).
4. Faqat tenant turi kerak bo'lsa, og'ir `GET /users/me` o'rniga `GET /auth/me` ishlating.
5. Sidebar/sarlavhada tenant nomini `data.tenant.name` dan ko'rsatish mumkin.

---

## Nima o'zgarmadi

- `GET /tenants`, `GET /tenants/:id` va barcha yozish amallari — faqat `super_admin` va undan yuqori (admin → `403`).
- `GET /users/me` javobi.
- `GET /auth/me` dagi boshqa maydonlar (`role`, `wallet`, ...).

---

## Xato holatlari

| Kod   | Qachon                                  | Misol `message`           |
| ----- | --------------------------------------- | ------------------------- |
| `401` | `access_token` yo'q yoki muddati o'tgan | `Unauthorized`            |
| `404` | Foydalanuvchi topilmadi                 | `Foydalanuvchi topilmadi` |

---

## O'zgarishlar jurnali

| Sana       | O'zgarish                                                                      |
| ---------- | ------------------------------------------------------------------------------ |
| 2026-09-29 | `GET /auth/me` javobiga `data.tenant` (`id`, `name`, `slug`, `type`) qo'shildi |
