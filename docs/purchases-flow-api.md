# Xaridlar (Purchases) — sovg'ani tasdiqlash, topshirish va bekor qilish — Frontend API Qo'llanmasi

> Student sovg'a sotib olgandan keyingi to'liq jarayon: **pending → approved → delivered** yoki **cancelled** (coin qaytadi). Yangi `delivered` bosqichi (sovg'a qo'lga berildi) ishlaydi, kim tasdiqlagani / kim topshirgani va qachon topshirilgani saqlanadi. Teacher xaridlarni endi ko'ra olmaydi.

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie (`access_token`, `refresh_token`) — `withCredentials: true` shart
**Format:** JSON

---

## Mundarija

- [Jarayon (status oqimi)](#jarayon-status-oqimi)
- [Kim nima qila oladi](#kim-nima-qila-oladi)
- [1. `POST /rewards/:id/purchase` — sovg'a sotib olish (student)](#1-post-rewardsidpurchase--sovga-sotib-olish-student)
- [2. `GET /purchases` — xaridlar ro'yxati](#2-get-purchases--xaridlar-royxati)
- [3. `GET /purchases/:id` — bitta xarid](#3-get-purchasesid--bitta-xarid)
- [4. `PATCH /purchases/:id/status` — statusni o'zgartirish (admin)](#4-patch-purchasesidstatus--statusni-ozgartirish-admin)
- [5. Dashboard'lardagi xarid ma'lumotlari](#5-dashboardlardagi-xarid-malumotlari)
- [Purchase obyekti](#purchase-obyekti)
- [UI tavsiyalari — Admin panel](#ui-tavsiyalari--admin-panel)
- [UI tavsiyalari — Student panel](#ui-tavsiyalari--student-panel)
- [Xato holatlari](#xato-holatlari)
- [O'zgarishlar jurnali](#ozgarishlar-jurnali)

---

## Jarayon (status oqimi)

```
                 admin: approved              admin: delivered
  ┌─────────┐ ─────────────────▶ ┌──────────┐ ─────────────────▶ ┌───────────┐
  │ pending │                    │ approved │                    │ delivered │  (yakuniy)
  └─────────┘                    └──────────┘                    └───────────┘
       │                               │
       │ admin: cancelled              │ admin: cancelled
       ▼                               ▼
  ┌───────────────────────────────────────┐
  │ cancelled  (coin + zaxira qaytadi)    │  (yakuniy)
  └───────────────────────────────────────┘
```

| Status      | Ma'nosi                                              | Student uchun matn (tavsiya)       |
| ----------- | ---------------------------------------------------- | ---------------------------------- |
| `pending`   | Student sotib oldi, coin yechildi, admin kutmoqda    | "Ko'rib chiqilmoqda"               |
| `approved`  | Admin tasdiqladi — sovg'a tayyor, olib ketish mumkin | "Tayyor — adminga murojaat qiling" |
| `delivered` | Sovg'a studentning qo'liga berildi                   | "Topshirildi"                      |
| `cancelled` | Admin bekor qildi, coin hamyonga qaytdi              | "Bekor qilindi, coin qaytarildi"   |

Ruxsat etilgan o'tishlar (boshqasi — `400`):

| Joriy holat | Qaysi holatga o'tkazish mumkin |
| ----------- | ------------------------------ |
| `pending`   | `approved`, `cancelled`        |
| `approved`  | `delivered`, `cancelled`       |
| `delivered` | — (yakuniy)                    |
| `cancelled` | — (yakuniy)                    |

> `pending` → `delivered` to'g'ridan-to'g'ri **mumkin emas** — avval `approved` qilinadi.

---

## Kim nima qila oladi

| Amal                          | `student`           | `teacher` | `admin` / `super_admin` |
| ----------------------------- | ------------------- | --------- | ----------------------- |
| Sovg'a sotib olish            | ✅                  | —         | —                       |
| Xaridlar ro'yxati / tafsiloti | ✅ faqat o'ziniki   | ❌ `403`  | ✅ tenantdagi barchasi  |
| Tasdiqlash (`approved`)       | ❌                  | ❌        | ✅                      |
| Topshirish (`delivered`)      | ❌                  | ❌        | ✅                      |
| Bekor qilish (`cancelled`)    | ❌ adminga murojaat | ❌        | ✅                      |

- **Student xaridni o'zi bekor qila olmaydi.** Bekor qilish kerak bo'lsa, adminga murojaat qiladi — admin bekor qiladi.
- `super_admin` / `creator` uchun `?tenantId=<uuid>` query **majburiy** (umumiy qoida).

---

## 1. `POST /rewards/:id/purchase` — sovg'a sotib olish (student)

**O'zgarmagan** (faqat ichki tuzatish: bir vaqtda bir necha marta bosilganda balans manfiyga tushmaydi, oxirgi dona ikki kishiga sotilmaydi).

Muvaffaqiyatli bo'lsa coin **darhol** yechiladi, xarid `pending` holatda yaratiladi.

### Response (`201`)

```json
{
  "message": "Xarid so‘rovi muvaffaqiyatli yuborildi! Sovg‘a admin tomonidan tasdiqlanishini kuting.",
  "purchaseId": "9f800108-3d04-4699-a1a8-1b632bb01c15",
  "remainingCoins": 1250
}
```

---

## 2. `GET /purchases` — xaridlar ro'yxati

**Ruxsat:** `student` (faqat o'z xaridlari — `studentId` parametri e'tiborga olinmaydi), `admin`, `super_admin`. `teacher` → `403`.

### Query parametrlari

| Parametr    | Turi                                                  | Izoh                                  |
| ----------- | ----------------------------------------------------- | ------------------------------------- |
| `page`      | number                                                | Default `1`                           |
| `limit`     | number                                                | Default `10`                          |
| `status`    | `pending` \| `approved` \| `delivered` \| `cancelled` | Holat bo'yicha filtr                  |
| `studentId` | uuid                                                  | Faqat admin uchun: bitta o'quvchi     |
| `rewardId`  | uuid                                                  | Bitta sovg'a bo'yicha                 |
| `tenantId`  | uuid                                                  | Faqat `super_admin` / `creator` uchun |

Misol: `GET /purchases?status=pending&page=1&limit=20`

### Response (`200`)

```json
{
  "data": [
    {
      "id": "9f800108-3d04-4699-a1a8-1b632bb01c15",
      "coinSpent": 899,
      "status": "approved",
      "deliveryNote": "Ertaga 14:00 da ofisdan olib keting",
      "isDeleted": false,
      "purchasedAt": "2026-09-28T09:54:19.056Z",
      "deliveredAt": null,
      "updatedAt": "2026-09-28T10:10:02.113Z",
      "deletedAt": null,
      "studentId": "085a20ac-4da0-41d0-927b-919fbf208e59",
      "rewardId": "243bb040-fd9c-4222-b0ab-b3d7ad012169",
      "approvedById": "5b1c...-admin",
      "deliveredById": null,
      "student": {
        "id": "085a20ac-4da0-41d0-927b-919fbf208e59",
        "fullName": "Shahzod Ergashev",
        "phone": "+998914567890"
      },
      "reward": {
        "id": "243bb040-fd9c-4222-b0ab-b3d7ad012169",
        "title": "Koptok",
        "coinPrice": 899,
        "imageUrl": "https://images.uzum.uz/d7sb02q1146tv06tg6dg/t_product_540_high.jpg"
      },
      "approvedBy": { "id": "5b1c...-admin", "fullName": "Admin Adminov" },
      "deliveredBy": null
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

Tartib: `purchasedAt` bo'yicha — eng yangisi birinchi. O'chirilgan (`isDeleted: true`) xaridlar qaytmaydi.

---

## 3. `GET /purchases/:id` — bitta xarid

**Ruxsat:** `GET /purchases` bilan bir xil. Student boshqa o'quvchining xaridini so'rasa — `403`.

### Response (`200`)

[Purchase obyekti](#purchase-obyekti) — to'g'ridan-to'g'ri (wrappersiz), `GET /purchases` dagi `data[i]` bilan bir xil.

---

## 4. `PATCH /purchases/:id/status` — statusni o'zgartirish (admin)

**Ruxsat:** `admin`, `super_admin`

### Request body

```json
{
  "status": "approved",
  "adminNote": "Ertaga 14:00 da ofisdan olib keting"
}
```

| Maydon      | Turi                                     | Majburiy | Izoh                                                                                                                   |
| ----------- | ---------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `status`    | `approved` \| `delivered` \| `cancelled` | ✅       | `pending` yuborib bo'lmaydi                                                                                            |
| `adminNote` | string (≤ 500)                           | —        | Berilsa, xaridning `deliveryNote` maydoniga yoziladi (student ham ko'radi). Bermasangiz — avvalgi izoh saqlanib qoladi |

Har bir status nima qiladi:

| `status`    | Backend nima qiladi                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `approved`  | `status = approved`, `approvedById` = joriy admin                                                                                                              |
| `delivered` | `status = delivered`, `deliveredById` = joriy admin, `deliveredAt` = hozirgi vaqt                                                                              |
| `cancelled` | `status = cancelled`; `coinSpent` studentning hamyoniga qaytadi; sovg'a zaxirasi +1 (cheksiz bo'lmasa); coin tarixiga `earn` / `purchase` tranzaksiya yoziladi |

### Response — `approved` / `delivered` (`200`)

```json
{
  "message": "Sovg‘a talabaga topshirildi.",
  "data": {
    "id": "9f800108-3d04-4699-a1a8-1b632bb01c15",
    "status": "delivered",
    "deliveredAt": "2026-09-29T09:05:41.000Z",
    "approvedBy": { "id": "5b1c...", "fullName": "Admin Adminov" },
    "deliveredBy": { "id": "5b1c...", "fullName": "Admin Adminov" },
    "...": "to'liq Purchase obyekti"
  }
}
```

`approved` uchun `message`: `"Xarid tasdiqlandi. Sovg‘ani talabaga topshirishingiz mumkin."`

### Response — `cancelled` (`200`)

```json
{
  "message": "Xarid bekor qilindi va talabaning tangalari hamyoniga qaytarildi.",
  "data": {
    "id": "...",
    "status": "cancelled",
    "...": "to'liq Purchase obyekti"
  },
  "refund": {
    "coins": 899,
    "currentBalance": 2149
  }
}
```

> ⚠️ **Breaking change:** avval `approved` xom Purchase obyektini, `cancelled` esa `{ message, purchaseStatus, refundedCoins, currentBalance }` qaytarardi. Endi ikkalasi ham `{ message, data }` (+ bekor qilishda `refund`). Frontendda `res.data.purchaseStatus` / `res.data.refundedCoins` ishlatilgan bo'lsa — `res.data.data.status` / `res.data.refund.coins` ga almashtiring.

Coin tarixida (`GET /coin-transactions/...`) qaytarilgan coin `direction: "earn"`, `sourceType: "purchase"` bilan ko'rinadi (avval `bonus` edi). `note`: `"Koptok" xaridi bekor qilindi, tangalar qaytarildi. Sabab: ... Xarid ID: ...`

---

## 5. Dashboard'lardagi xarid ma'lumotlari

### Admin — `GET /dashboard/admin`

`needsAttention` ga yangi maydon qo'shildi:

```json
"needsAttention": {
  "pendingPurchases": 3,
  "approvedPurchases": 2,
  "pendingAttendanceSessions": 1
}
```

| Maydon              | Izoh                                                        |
| ------------------- | ----------------------------------------------------------- |
| `pendingPurchases`  | Tasdiqlanishini kutayotgan xaridlar                         |
| `approvedPurchases` | **Yangi.** Tasdiqlangan, lekin hali topshirilmagan xaridlar |

### Student — `GET /students/me/dashboard`

`purchases.recent[]` elementlariga `deliveredAt` qo'shildi (`null` — hali topshirilmagan):

```json
"purchases": {
  "pendingCount": 1,
  "recent": [
    {
      "id": "...",
      "coinSpent": 199,
      "status": "delivered",
      "purchasedAt": "2026-09-28T09:47:38.414Z",
      "deliveredAt": "2026-09-29T09:05:41.000Z",
      "reward": { "id": "...", "title": "Ruchka", "imageUrl": "..." }
    }
  ]
}
```

---

## Purchase obyekti

| Maydon          | Turi                                 | Izoh                                                            |
| --------------- | ------------------------------------ | --------------------------------------------------------------- |
| `id`            | uuid                                 |                                                                 |
| `coinSpent`     | number                               | Sotib olish paytidagi narx (keyin narx o'zgarsa ham shu qoladi) |
| `status`        | enum                                 | `pending` / `approved` / `delivered` / `cancelled`              |
| `deliveryNote`  | `string \| null`                     | Adminning oxirgi izohi (`adminNote`)                            |
| `purchasedAt`   | ISO datetime                         | Sotib olingan vaqt                                              |
| `deliveredAt`   | `ISO datetime \| null`               | **Yangi.** Qo'lga berilgan vaqt                                 |
| `updatedAt`     | ISO datetime                         | Oxirgi o'zgarish                                                |
| `studentId`     | uuid                                 |                                                                 |
| `rewardId`      | uuid                                 |                                                                 |
| `approvedById`  | `uuid \| null`                       | Endi haqiqatda to'ldiriladi                                     |
| `deliveredById` | `uuid \| null`                       | **Yangi**                                                       |
| `student`       | `{ id, fullName, phone }`            |                                                                 |
| `reward`        | `{ id, title, coinPrice, imageUrl }` | `coinPrice` — sovg'aning **joriy** narxi                        |
| `approvedBy`    | `{ id, fullName } \| null`           | **Yangi**                                                       |
| `deliveredBy`   | `{ id, fullName } \| null`           | **Yangi**                                                       |

---

## UI tavsiyalari — Admin panel

**"Buyurtmalar" sahifasi** (`GET /purchases`):

1. Yuqorida status tablari: **Yangi** (`pending`) · **Topshirilishi kerak** (`approved`) · **Topshirilgan** (`delivered`) · **Bekor qilingan** (`cancelled`) · Hammasi. Har bir tab `?status=` bilan so'rov yuboradi. Tab yonidagi badge uchun `GET /dashboard/admin` → `needsAttention.pendingPurchases` / `approvedPurchases`.
2. Jadval ustunlari: sovg'a (rasm + `reward.title`), o'quvchi (`student.fullName`, `student.phone`), `coinSpent`, `purchasedAt`, status badge, izoh (`deliveryNote`), "kim / qachon" (`approvedBy.fullName`, `deliveredBy.fullName`, `deliveredAt`).
3. Qator amallari — **faqat ruxsat etilgan o'tishlar** uchun tugma ko'rsating:

   | `status`    | Tugmalar                           |
   | ----------- | ---------------------------------- |
   | `pending`   | **Tasdiqlash** · **Bekor qilish**  |
   | `approved`  | **Topshirildi** · **Bekor qilish** |
   | `delivered` | — (faqat ko'rish)                  |
   | `cancelled` | — (faqat ko'rish)                  |

4. **Tasdiqlash** — ixtiyoriy izoh maydoni bilan modal (masalan, "Ertaga 14:00 da ofisdan olib keting") → `PATCH { status: "approved", adminNote }`.
5. **Topshirildi** — tasdiqlash dialogi ("Sovg'a o'quvchiga berildimi?") → `PATCH { status: "delivered" }`.
6. **Bekor qilish** — sababi bilan modal (sabab majburiy qilish tavsiya etiladi, u coin tarixidagi `note` ga ham yoziladi) → `PATCH { status: "cancelled", adminNote }`. Muvaffaqiyatda toast: `"899 coin qaytarildi. Joriy balans: 2149"` (`refund.coins`, `refund.currentBalance`).
7. Har bir amaldan keyin ro'yxatni va dashboard badge'larini qayta yuklang. `409` kelsa — "Buyurtma holati o'zgargan" deb ro'yxatni yangilang.
8. O'quvchi profilida (`/students/:id`) "Xaridlar" tabida `GET /purchases?studentId=<id>` dan foydalanish mumkin.

## UI tavsiyalari — Student panel

1. **Sotib olgandan keyin** (`POST /rewards/:id/purchase` → `201`): `message` ni ko'rsating, balansni `remainingCoins` bilan yangilang va "Mening xaridlarim" sahifasiga yo'naltiring.
2. **"Mening xaridlarim"** (`GET /purchases`): kartochkalar — sovg'a rasmi, nomi, `coinSpent`, sana va status badge ([jadvaldagi matnlar](#jarayon-status-oqimi)). Status bo'yicha tablar: Kutilmoqda (`pending`) · Tayyor (`approved`) · Olingan (`delivered`) · Bekor qilingan (`cancelled`).
3. `approved` holatida kartochkani ajratib ko'rsating ("Sovg'angiz tayyor!") va `deliveryNote` ni ko'rsating — admin qayerdan/qachon olishni shu yerda yozadi.
4. `delivered` holatida `deliveredAt` ni ko'rsating ("29-sentabr kuni topshirildi").
5. `cancelled` holatida `deliveryNote` (sabab) va "coin hamyoningizga qaytarildi" matnini ko'rsating.
6. **"Bekor qilish" tugmasi qo'ymang** — student bekor qila olmaydi. O'rniga `pending`/`approved` holatida kichik matn: "Bekor qilish uchun adminga murojaat qiling".
7. Dashboard'da (`GET /students/me/dashboard`) `purchases.recent` uchun ham shu status badge'lar ishlatiladi.

## Teacher panel

Teacher uchun xaridlar sahifasi/menyusi bo'lsa — **olib tashlang**: `GET /purchases` va `GET /purchases/:id` endi `403` qaytaradi.

---

## Xato holatlari

| Kod   | Qachon                                                                            | Misol `message`                                                                                               |
| ----- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `400` | `status` noto'g'ri (`pending` yoki boshqa qiymat)                                 | `Status faqat approved, delivered yoki cancelled bo‘lishi mumkin`                                             |
| `400` | Ruxsat etilmagan o'tish (masalan `pending` → `delivered`)                         | `Buyurtmani "pending" holatidan "delivered" holatiga o'tkazib bo'lmaydi. Ruxsat etilgan: approved, cancelled` |
| `400` | Yakunlangan xaridni o'zgartirish (`delivered` / `cancelled`)                      | `Ushbu buyurtma allaqachon yakunlangan. Joriy holati: delivered`                                              |
| `400` | Bekor qilishda o'quvchining hamyoni yo'q                                          | `Foydalanuvchining hamyoni topilmadi. Tanga qaytarishning iloji yo‘q.`                                        |
| `400` | Sotib olishda coin yetarli emas / zaxira tugagan                                  | `Tangalaringiz yetarli emas...` / `Afsuski, ushbu sovg‘a omborda qolmagan.`                                   |
| `403` | Teacher xaridlarni so'radi                                                        | `O'qituvchi xaridlarni ko'ra olmaydi`                                                                         |
| `403` | Student boshqa o'quvchining xaridini so'radi                                      | `Siz bu xaridni ko'ra olmaysiz`                                                                               |
| `403` | Student/teacher `PATCH /purchases/:id/status` chaqirdi                            | `Bu amalni bajarish uchun admin yoki super_admin huquqi kerak`                                                |
| `404` | Xarid topilmadi (yoki boshqa tenantniki)                                          | `Xarid buyurtmasi topilmadi`                                                                                  |
| `409` | Holat shu orada boshqa so'rov bilan o'zgargan (masalan, tugma ikki marta bosildi) | `Buyurtma holati boshqa so‘rov tomonidan o‘zgartirildi. Sahifani yangilab, qayta urinib ko‘ring.`             |

---

## O'zgarishlar jurnali

| Sana       | O'zgarish                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-28 | `delivered` bosqichi ishga tushdi (`approved` → `delivered`); `approved` holatidan ham bekor qilish mumkin                   |
| 2026-09-28 | Purchase'ga `deliveredAt`, `deliveredById`, `deliveredBy` qo'shildi; `approvedById` / `approvedBy` endi to'ldiriladi         |
| 2026-09-28 | `adminNote` endi `deliveryNote` ga saqlanadi                                                                                 |
| 2026-09-28 | `PATCH /purchases/:id/status` javobi `{ message, data, refund? }` formatiga keltirildi (**breaking**)                        |
| 2026-09-28 | Bekor qilishda qaytarilgan coin tranzaksiyasi `sourceType: "purchase"` (avval `bonus`)                                       |
| 2026-09-28 | Teacher uchun `GET /purchases`, `GET /purchases/:id` → `403`; o'chirilgan xaridlar ro'yxatda ko'rinmaydi                     |
| 2026-09-28 | `GET /dashboard/admin` → `needsAttention.approvedPurchases`; `GET /students/me/dashboard` → `purchases.recent[].deliveredAt` |
| 2026-09-28 | Sotib olishda parallel so'rovlarda balans manfiyga tushishi / zaxiradan ortiq sotilishi tuzatildi                            |
