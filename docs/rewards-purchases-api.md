# Sovg'alar do'koni va xaridlar — Frontend API Qo'llanmasi

> Student sovg'a sotib olgandan keyingi to'liq jarayon (**tasdiqlash → topshirish** yoki **bekor qilish**) va sovg'a zaxirasini (`stock`) to'g'ri boshqarish bo'yicha barcha backend o'zgarishlari **shu bitta hujjatda**. Frontendda nimalarni o'zgartirish kerakligi [5-bo'lim](#5-frontendda-nimalar-ozgaradi) va [tekshiruv ro'yxati](#6-frontend-uchun-tekshiruv-royxati)da.

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie (`access_token`, `refresh_token`) — `withCredentials: true` shart
**Format:** JSON
**Elevated rollar:** `super_admin` / `creator` uchun `?tenantId=<uuid>` query majburiy (umumiy qoida)

---

## Mundarija

- [Qisqacha: nima o'zgardi](#qisqacha-nima-ozgardi)
- [⚠️ Breaking o'zgarishlar](#️-breaking-ozgarishlar)
- [1. Asosiy tushunchalar](#1-asosiy-tushunchalar)
  - [1.1 Xarid holatlari (status oqimi)](#11-xarid-holatlari-status-oqimi)
  - [1.2 Kim nima qila oladi](#12-kim-nima-qila-oladi)
  - [1.3 Sovg'a zaxirasi: `stock` va `reservedCount`](#13-sovga-zaxirasi-stock-va-reservedcount)
- [2. Sovg'alar API](#2-sovgalar-api)
  - [2.1 `GET /rewards`](#21-get-rewards)
  - [2.2 `GET /rewards/:id`](#22-get-rewardsid)
  - [2.3 `POST /rewards`](#23-post-rewards)
  - [2.4 `PATCH /rewards/:id`](#24-patch-rewardsid)
  - [2.5 `POST /rewards/:id/purchase`](#25-post-rewardsidpurchase)
- [3. Xaridlar API](#3-xaridlar-api)
  - [3.1 `GET /purchases`](#31-get-purchases)
  - [3.2 `GET /purchases/:id`](#32-get-purchasesid)
  - [3.3 `PATCH /purchases/:id/status`](#33-patch-purchasesidstatus)
- [4. Dashboard'lar](#4-dashboardlar)
- [5. Frontendda nimalar o'zgaradi](#5-frontendda-nimalar-ozgaradi)
  - [5.1 Admin panel](#51-admin-panel)
  - [5.2 Student panel](#52-student-panel)
  - [5.3 Teacher panel](#53-teacher-panel)
- [6. Frontend uchun tekshiruv ro'yxati](#6-frontend-uchun-tekshiruv-royxati)
- [7. Obyektlar ma'lumotnomasi](#7-obyektlar-malumotnomasi)
- [8. Xato holatlari](#8-xato-holatlari)
- [9. O'zgarishlar jurnali](#9-ozgarishlar-jurnali)

---

## Qisqacha: nima o'zgardi

| #   | O'zgarish                                                                                                                | Kimga ta'sir qiladi |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| 1   | Yangi bosqich: sovg'a **topshirildi** (`delivered`). Oqim: `pending → approved → delivered`                              | Admin, Student      |
| 2   | `approved` holatidan ham bekor qilish mumkin                                                                             | Admin               |
| 3   | Kim tasdiqladi / kim topshirdi / qachon topshirildi saqlanadi (`approvedBy`, `deliveredBy`, `deliveredAt`)               | Admin, Student      |
| 4   | Admin izohi (`adminNote`) endi saqlanadi → `deliveryNote` (student ham ko'radi)                                          | Admin, Student      |
| 5   | `PATCH /purchases/:id/status` javobi yangi formatda — **breaking**                                                       | Admin               |
| 6   | Bekor qilishda donani zaxiraga qaytarish ixtiyoriy — `restock`                                                           | Admin               |
| 7   | Sovg'a obyektida `reservedCount` — sotilgan, lekin hali topshirilmagan donalar soni                                      | Admin               |
| 8   | Zaxirani nisbiy o'zgartirish — `stockDelta` (+5 / −2)                                                                    | Admin               |
| 9   | Cheksiz sovg'a (`stock: -1`) endi API orqali yaratiladi/tahrirlanadi                                                     | Admin, Student      |
| 10  | `GET /rewards?onlyInStock=true` endi cheksiz sovg'alarni ham qaytaradi                                                   | Student             |
| 11  | Teacher xaridlarni ko'ra olmaydi (`403`)                                                                                 | Teacher             |
| 12  | Admin dashboard: `needsAttention.approvedPurchases`; student dashboard: `purchases.recent[].deliveredAt`                 | Admin, Student      |
| 13  | Ichki tuzatishlar: parallel so'rovlarda balans manfiyga tushmaydi, zaxiradan ortiq sotilmaydi, coin ikki marta qaytmaydi | —                   |

---

## ⚠️ Breaking o'zgarishlar

1. **`PATCH /purchases/:id/status` javobi.** Avval `approved` xom Purchase obyektini, `cancelled` esa `{ message, purchaseStatus, refundedCoins, currentBalance }` qaytarardi. Endi har doim:

   ```json
   {
     "message": "...",
     "data": { "...": "Purchase" },
     "refund": { "...": "faqat cancelled da" }
   }
   ```

   | Eski                         | Yangi                            |
   | ---------------------------- | -------------------------------- |
   | `res.data.status` (approved) | `res.data.data.status`           |
   | `res.data.purchaseStatus`    | `res.data.data.status`           |
   | `res.data.refundedCoins`     | `res.data.refund.coins`          |
   | `res.data.currentBalance`    | `res.data.refund.currentBalance` |

2. **`PATCH /purchases/:id/status` da `status` qiymatlari:** faqat `approved`, `delivered`, `cancelled`. `pending` yoki boshqa qiymat — `400` (avval bo'sh `200` qaytardi).
3. **Teacher** uchun `GET /purchases` va `GET /purchases/:id` — `403`.
4. **Bekor qilishda qaytarilgan coin** tarixda `sourceType: "purchase"` bilan yoziladi (avval `"bonus"`). Coin tarixini `sourceType` bo'yicha filtrlash/ikonka tanlash bo'lsa — hisobga oling.

---

## 1. Asosiy tushunchalar

### 1.1 Xarid holatlari (status oqimi)

```
                 admin: approved              admin: delivered
  ┌─────────┐ ─────────────────▶ ┌──────────┐ ─────────────────▶ ┌───────────┐
  │ pending │                    │ approved │                    │ delivered │  (yakuniy)
  └─────────┘                    └──────────┘                    └───────────┘
       │                               │
       │ admin: cancelled              │ admin: cancelled
       ▼                               ▼
  ┌───────────────────────────────────────┐
  │ cancelled  (coin qaytadi)             │  (yakuniy)
  └───────────────────────────────────────┘
```

| Status      | Ma'nosi                                                 | Student uchun matn (tavsiya)       | Badge rangi (tavsiya) |
| ----------- | ------------------------------------------------------- | ---------------------------------- | --------------------- |
| `pending`   | Student sotib oldi, coin yechildi, admin ko'rib chiqadi | "Ko'rib chiqilmoqda"               | sariq                 |
| `approved`  | Admin tasdiqladi — sovg'a tayyor, olib ketish mumkin    | "Tayyor — adminga murojaat qiling" | ko'k                  |
| `delivered` | Sovg'a studentning qo'liga berildi                      | "Topshirildi"                      | yashil                |
| `cancelled` | Admin bekor qildi, coin hamyonga qaytdi                 | "Bekor qilindi, coin qaytarildi"   | kulrang/qizil         |

Ruxsat etilgan o'tishlar (boshqasi — `400`):

| Joriy holat | Qaysi holatga o'tkazish mumkin |
| ----------- | ------------------------------ |
| `pending`   | `approved`, `cancelled`        |
| `approved`  | `delivered`, `cancelled`       |
| `delivered` | — (yakuniy)                    |
| `cancelled` | — (yakuniy)                    |

> `pending` → `delivered` to'g'ridan-to'g'ri **mumkin emas** — avval `approved`.

### 1.2 Kim nima qila oladi

| Amal                          | `student`           | `teacher` | `admin` / `super_admin` |
| ----------------------------- | ------------------- | --------- | ----------------------- |
| Sovg'alarni ko'rish           | ✅                  | ✅        | ✅                      |
| Sovg'a yaratish / tahrirlash  | ❌                  | ❌        | ✅                      |
| Sovg'a sotib olish            | ✅                  | —         | —                       |
| Xaridlar ro'yxati / tafsiloti | ✅ faqat o'ziniki   | ❌ `403`  | ✅ tenantdagi barchasi  |
| Tasdiqlash (`approved`)       | ❌                  | ❌        | ✅                      |
| Topshirish (`delivered`)      | ❌                  | ❌        | ✅                      |
| Bekor qilish (`cancelled`)    | ❌ adminga murojaat | ❌        | ✅                      |

**Student xaridni o'zi bekor qila olmaydi** — adminga murojaat qiladi, admin bekor qiladi.

### 1.3 Sovg'a zaxirasi: `stock` va `reservedCount`

`stock` — **omborda jismonan turgan son emas**, balki **"yana nechta sotish mumkin"**.

| Hodisa                          | `stock`                                       |
| ------------------------------- | --------------------------------------------- |
| Student sotib oldi (`pending`)  | **−1** (dona shu student uchun band qilinadi) |
| Admin tasdiqladi (`approved`)   | o'zgarmaydi                                   |
| Admin topshirdi (`delivered`)   | o'zgarmaydi                                   |
| Admin bekor qildi (`cancelled`) | **+1** (agar `restock: false` bo'lmasa)       |

```
omborda jismonan turgan son  =  stock  +  reservedCount
                                 │          └─ sotilgan, hali topshirilmagan (pending + approved)
                                 └─ yana sotish mumkin
```

**Misol.** Omborda 5 ta koptok. 3 kishi sotib oldi → `stock: 2`, `reservedCount: 3`. Admin omborni sanaydi — 5 ta (2 + 3), hammasi to'g'ri. Admin `stock` ni 5 ga **o'zgartirmasligi kerak** — aks holda 8 ta xarid 5 ta koptokka to'g'ri keladi. Yangi tovar kelsa — `stockDelta: +N` ishlatiladi.

| `stock` | Ma'nosi                         |
| ------- | ------------------------------- |
| `-1`    | Cheksiz — zaxira hisoblanmaydi  |
| `0`     | Tugagan — sotib olib bo'lmaydi  |
| `> 0`   | Yana shuncha dona sotish mumkin |

---

## 2. Sovg'alar API

### 2.1 `GET /rewards`

**Ruxsat:** hamma. **O'zgarish:** har bir elementga `reservedCount`; `onlyInStock` tuzatildi.

Query (o'zgarmagan): `page`, `limit`, `search`, `categoryId`, `isActive`, `onlyInStock`.

- `onlyInStock=true` — avval faqat `stock > 0`; **endi `stock > 0` yoki `stock = -1`** (cheksiz sovg'alar ham chiqadi).

```json
{
  "data": [
    {
      "id": "243bb040-fd9c-4222-b0ab-b3d7ad012169",
      "title": "Koptok",
      "description": "",
      "coinPrice": 899,
      "stock": 2,
      "reservedCount": 3,
      "rewardType": "physical",
      "imageUrl": "https://...",
      "isActive": true,
      "categoryId": "…",
      "createdAt": "…",
      "updatedAt": "…"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

### 2.2 `GET /rewards/:id`

**Ruxsat:** hamma. Javob — bitta sovg'a obyekti, **`reservedCount` bilan**.

### 2.3 `POST /rewards`

**Ruxsat:** `admin`, `super_admin`. **O'zgarish:** `stock: -1` (cheksiz) qabul qilinadi (avval `400`). `-2` va undan kichik — `400`.

```json
{
  "title": "Darsdan 5 daqiqa oldin chiqish",
  "coinPrice": 300,
  "stock": -1,
  "categoryId": "category-uuid",
  "rewardType": "privilege"
}
```

> `stock` yuborilmasa — `0` bo'ladi (sovg'a "tugagan" holatda yaratiladi). Formada `stock` ni doim yuboring.

### 2.4 `PATCH /rewards/:id`

**Ruxsat:** `admin`, `super_admin`. **O'zgarish:** yangi `stockDelta`; `stock: -1` ruxsat; javobda `reservedCount`.

Zaxirani ikki xil usulda o'zgartirish mumkin — **bittasini** yuboring:

| Maydon       | Turi        | Qachon                                                                                                |
| ------------ | ----------- | ----------------------------------------------------------------------------------------------------- |
| `stockDelta` | int, `≠ 0`  | **Kundalik uchun tavsiya:** "+5 ta keldi", "−2 ta yaroqsiz". Shu orada sotilgan donalar yo'qolmaydi   |
| `stock`      | int, `≥ -1` | Aniq qiymat: cheksiz ↔ sonli rejimga o'tish yoki sotuvni to'xtatish (`0`). Qiymat **ustiga yoziladi** |

Qoidalar:

- `stock` va `stockDelta` birga — `400`.
- Cheksiz (`-1`) sovg'aga `stockDelta` — `400` (avval `stock` bilan aniq son qo'ying).
- Manfiy `stockDelta` zaxirani `0` dan pastga tushirsa — `400`.
- Boshqa maydonlar (`title`, `coinPrice`, ...) bilan birga yuborish mumkin — bitta tranzaksiyada saqlanadi.

```json
{ "stockDelta": 5 }
```

```json
{ "stockDelta": -2, "coinPrice": 950 }
```

```json
{ "stock": -1 }
```

**Response (`200`)** — yangilangan sovg'a, `reservedCount` bilan:

```json
{
  "id": "243bb040-...",
  "title": "Koptok",
  "stock": 7,
  "reservedCount": 3,
  "...": "..."
}
```

### 2.5 `POST /rewards/:id/purchase`

**Ruxsat:** `student`. **O'zgarish yo'q** (faqat ichki tuzatishlar: parallel bosishda balans manfiyga tushmaydi, oxirgi dona ikki kishiga sotilmaydi).

Muvaffaqiyatda coin **darhol** yechiladi, `stock` −1 (cheksiz bo'lmasa), xarid `pending` holatda yaratiladi.

```json
{
  "message": "Xarid so‘rovi muvaffaqiyatli yuborildi! Sovg‘a admin tomonidan tasdiqlanishini kuting.",
  "purchaseId": "9f800108-3d04-4699-a1a8-1b632bb01c15",
  "remainingCoins": 1250
}
```

---

## 3. Xaridlar API

### 3.1 `GET /purchases`

**Ruxsat:** `student` (faqat o'ziniki — `studentId` e'tiborga olinmaydi), `admin`, `super_admin`. `teacher` → `403`.

| Query       | Turi                                                  | Izoh                            |
| ----------- | ----------------------------------------------------- | ------------------------------- |
| `page`      | number                                                | Default `1`                     |
| `limit`     | number                                                | Default `10`                    |
| `status`    | `pending` \| `approved` \| `delivered` \| `cancelled` | Holat bo'yicha                  |
| `studentId` | uuid                                                  | Faqat admin: bitta o'quvchi     |
| `rewardId`  | uuid                                                  | Bitta sovg'a bo'yicha           |
| `tenantId`  | uuid                                                  | Faqat `super_admin` / `creator` |

Tartib — `purchasedAt` bo'yicha, eng yangisi birinchi. O'chirilgan xaridlar qaytmaydi.

```json
{
  "data": [
    {
      "id": "9f800108-3d04-4699-a1a8-1b632bb01c15",
      "coinSpent": 899,
      "status": "approved",
      "deliveryNote": "Ertaga 14:00 da ofisdan olib keting",
      "stockReserved": true,
      "isDeleted": false,
      "purchasedAt": "2026-09-28T09:54:19.056Z",
      "deliveredAt": null,
      "updatedAt": "2026-09-28T10:10:02.113Z",
      "deletedAt": null,
      "studentId": "085a20ac-4da0-41d0-927b-919fbf208e59",
      "rewardId": "243bb040-fd9c-4222-b0ab-b3d7ad012169",
      "approvedById": "5b1c…",
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
        "imageUrl": "https://images.uzum.uz/…"
      },
      "approvedBy": { "id": "5b1c…", "fullName": "Admin Adminov" },
      "deliveredBy": null
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

### 3.2 `GET /purchases/:id`

**Ruxsat:** 3.1 bilan bir xil. Student boshqa o'quvchining xaridini so'rasa — `403`. Javob — bitta Purchase obyekti (wrappersiz), 3.1 dagi `data[i]` bilan bir xil.

### 3.3 `PATCH /purchases/:id/status`

**Ruxsat:** `admin`, `super_admin`.

#### Request

```json
{
  "status": "cancelled",
  "adminNote": "Sovg'a yo'qolib qolgan",
  "restock": false
}
```

| Maydon      | Turi                                     | Majburiy | Izoh                                                                                                              |
| ----------- | ---------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `status`    | `approved` \| `delivered` \| `cancelled` | ✅       | [Ruxsat etilgan o'tishlar](#11-xarid-holatlari-status-oqimi)                                                      |
| `adminNote` | string (≤ 500)                           | —        | Berilsa, `deliveryNote` ga yoziladi (student ko'radi). Berilmasa — avvalgi izoh qoladi                            |
| `restock`   | boolean, default `true`                  | —        | **Faqat `cancelled` uchun.** `false` — dona zaxiraga qaytarilmaydi (sotuv to'xtatilgan, sovg'a yo'qolgan va h.k.) |

#### Backend nima qiladi

| `status`    | Natija                                                                                                                                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `approved`  | `status = approved`, `approvedById` = joriy admin                                                                                                                                                                                                     |
| `delivered` | `status = delivered`, `deliveredById` = joriy admin, `deliveredAt` = hozir                                                                                                                                                                            |
| `cancelled` | `status = cancelled`; `coinSpent` hamyonga qaytadi (**har doim**); coin tarixiga `earn` / `purchase` yoziladi; zaxira +1 — faqat `restock !== false` **va** xaridda dona haqiqatda ayirilgan (`stockReserved: true`) **va** sovg'a hozir cheksiz emas |

#### Response — `approved` / `delivered` (`200`)

```json
{
  "message": "Sovg‘a talabaga topshirildi.",
  "data": {
    "id": "9f800108-…",
    "status": "delivered",
    "deliveredAt": "2026-09-29T09:05:41.000Z",
    "approvedBy": { "id": "5b1c…", "fullName": "Admin Adminov" },
    "deliveredBy": { "id": "5b1c…", "fullName": "Admin Adminov" },
    "...": "to'liq Purchase obyekti"
  }
}
```

`approved` uchun `message`: `"Xarid tasdiqlandi. Sovg‘ani talabaga topshirishingiz mumkin."`

#### Response — `cancelled` (`200`)

```json
{
  "message": "Xarid bekor qilindi va talabaning tangalari hamyoniga qaytarildi.",
  "data": {
    "id": "…",
    "status": "cancelled",
    "stockReserved": true,
    "...": "to'liq Purchase obyekti"
  },
  "refund": {
    "coins": 899,
    "currentBalance": 2149,
    "stockRestored": false
  }
}
```

| Maydon                  | Izoh                                |
| ----------------------- | ----------------------------------- |
| `refund.coins`          | Qaytarilgan coin                    |
| `refund.currentBalance` | Studentning yangi balansi           |
| `refund.stockRestored`  | Dona sovg'a zaxirasiga qaytarildimi |

Coin tarixida qaytarilgan coin: `direction: "earn"`, `sourceType: "purchase"`, `note`: `"Koptok" xaridi bekor qilindi, tangalar qaytarildi. Sabab: … Xarid ID: …`

---

## 4. Dashboard'lar

### Admin — `GET /dashboard/admin`

`needsAttention` ga **`approvedPurchases`** qo'shildi:

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

`purchases.recent[]` elementlariga **`deliveredAt`** qo'shildi (`null` — hali topshirilmagan):

```json
"purchases": {
  "pendingCount": 1,
  "recent": [
    {
      "id": "…",
      "coinSpent": 199,
      "status": "delivered",
      "purchasedAt": "2026-09-28T09:47:38.414Z",
      "deliveredAt": "2026-09-29T09:05:41.000Z",
      "reward": { "id": "…", "title": "Ruchka", "imageUrl": "…" }
    }
  ]
}
```

---

## 5. Frontendda nimalar o'zgaradi

### 5.1 Admin panel

#### A. Dashboard

- "E'tibor talab qiladi" blokiga yangi kartochka: **"Topshirilishi kerak: 2"** (`needsAttention.approvedPurchases`) → bosilganda Buyurtmalar sahifasi, `approved` tab.
- Mavjud "Yangi buyurtmalar" (`pendingPurchases`) → `pending` tab.

#### B. "Buyurtmalar" sahifasi (`GET /purchases`) — asosiy o'zgarish

1. **Status tablari:** Yangi (`pending`) · Topshirilishi kerak (`approved`) · Topshirilgan (`delivered`) · Bekor qilingan (`cancelled`) · Hammasi. Har bir tab `?status=` bilan so'rov. Badge'lar — dashboard sonlaridan.
2. **Jadval ustunlari:** sovg'a (rasm + `reward.title`) · o'quvchi (`student.fullName`, `student.phone`) · `coinSpent` · `purchasedAt` · status badge · izoh (`deliveryNote`) · "kim / qachon" (`approvedBy.fullName`, `deliveredBy.fullName`, `deliveredAt`).
3. **Qator amallari** — faqat ruxsat etilgan o'tishlar:

   | `status`    | Tugmalar                           |
   | ----------- | ---------------------------------- |
   | `pending`   | **Tasdiqlash** · **Bekor qilish**  |
   | `approved`  | **Topshirildi** · **Bekor qilish** |
   | `delivered` | — (faqat ko'rish)                  |
   | `cancelled` | — (faqat ko'rish)                  |

4. **Tasdiqlash** — ixtiyoriy izoh bilan modal ("Ertaga 14:00 da ofisdan olib keting") → `{ status: "approved", adminNote }`.
5. **Topshirildi** — tasdiqlash dialogi ("Sovg'a o'quvchiga berildimi?") → `{ status: "delivered" }`.
6. **Bekor qilish modali:**
   - Sabab (majburiy qilish tavsiya etiladi — coin tarixiga ham yoziladi) → `adminNote`.
   - **"Sovg'ani zaxiraga qaytarish"** checkbox (default ✅) → `restock`. Yordamchi matn: _"Belgini olib tashlang, agar sovg'a sotuvdan olingan, yo'qolgan yoki yaroqsiz bo'lsa. Coin baribir qaytariladi."_
   - Xaridda `stockReserved === false` bo'lsa (cheksiz sovg'a) — checkbox'ni yashiring.
   - Toast: `"899 coin qaytarildi. Joriy balans: 2149"` + `refund.stockRestored` ga qarab "Sovg'a zaxiraga qaytarildi" / "Zaxira o'zgarmadi".
7. Har bir amaldan keyin: ro'yxat, dashboard badge'lari va (bekor qilishda) sovg'alar ro'yxatini qayta yuklang.
8. `409` kelsa — "Buyurtma holati o'zgargan" toast va ro'yxatni yangilash.
9. **Javob formatini yangilang** — [Breaking o'zgarishlar](#️-breaking-ozgarishlar) jadvali bo'yicha.
10. O'quvchi profilida "Xaridlar" tabi: `GET /purchases?studentId=<id>`.

#### C. "Sovg'alar" ro'yxati (`GET /rewards`)

| Hozir                        | Endi                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| "Zaxira" ustunida `stock`    | **"Sotuvda: 2"** (`stock`) · **"Band: 3"** (`reservedCount`) · ixtiyoriy **"Omborda: 5"** (`stock + reservedCount`) |
| `stock: -1` → "-1" ko'rinadi | **"Cheksiz" (∞)**; "Omborda" ko'rsatilmaydi                                                                         |
| `stock: 0`                   | "Tugagan" badge; `reservedCount > 0` bo'lsa "3 ta topshirilishi kerak" ishorasi                                     |

"Band" soniga bosganda → `GET /purchases?rewardId=<id>&status=pending` (yoki `approved`).

#### D. Sovg'a yaratish formasi (`POST /rewards`)

- Zaxira yoniga **"Cheksiz" toggle**. Yoqilsa — `stock: -1`, son inputi o'chiriladi.
- O'chiq bo'lsa — son input (`min=0`), qiymatni **doim** yuboring.

#### E. Sovg'ani tahrirlash formasi (`PATCH /rewards/:id`)

Zaxira qismini **ikki rejimli** qiling:

1. **"Zaxirani o'zgartirish" (asosiy, tavsiya)** — `−` / `+` yoki "Qo'shish: [5]" / "Ayirish: [2]" → `{ "stockDelta": 5 }` / `{ "stockDelta": -2 }`. Yonida: "Sotuvda: 2 · Band: 3 · Omborda: 5".
2. **"Aniq qiymat o'rnatish" (kamdan-kam)** — son input yoki "Cheksiz" toggle → `{ "stock": N }` / `{ "stock": -1 }`. Ogohlantirish: _"Bu yerga faqat SOTUVGA qo'yiladigan son kiritiladi. Hali topshirilmagan 3 ta xarid bu songa kirmaydi."_
3. Cheksiz sovg'ada (`stock === -1`) 1-rejimni yashiring.
4. `stock` va `stockDelta` ni bitta so'rovda **yubormang**.
5. **Faqat o'zgargan maydonlarni yuboring.** Formadagi eski `stock` ni boshqa maydonlar (nom, narx) bilan qayta yubormang — shu orada sotilgan dona hisobdan tushib qoladi.
6. Saqlagandan keyin javobdagi `stock` / `reservedCount` bilan formani yangilang.

### 5.2 Student panel

#### A. Do'kon (`GET /rewards`)

- `stock: -1` → "-1 ta qoldi" emas: hech narsa yozmang yoki "Cheksiz". `stock > 0` → "N ta qoldi". `stock: 0` → "Tugagan", "Sotib olish" tugmasi o'chiq.
- `onlyInStock=true` endi cheksiz sovg'alarni ham qaytaradi — qo'shimcha ish kerak emas.
- `reservedCount` — student uchun kerak emas, e'tiborsiz qoldiring.

#### B. Sotib olgandan keyin (`POST /rewards/:id/purchase` → `201`)

- `message` ni ko'rsating, balansni `remainingCoins` bilan yangilang, "Mening xaridlarim" sahifasiga yo'naltiring.

#### C. "Mening xaridlarim" (`GET /purchases`) — yangi yoki qayta ishlangan sahifa

1. Kartochkalar: sovg'a rasmi, nomi, `coinSpent`, sana, status badge ([matnlar](#11-xarid-holatlari-status-oqimi)).
2. Tablar: Kutilmoqda (`pending`) · Tayyor (`approved`) · Olingan (`delivered`) · Bekor qilingan (`cancelled`).
3. `approved` — kartochkani ajratib ko'rsating ("Sovg'angiz tayyor!") va `deliveryNote` (admin qayerdan/qachon olishni yozadi).
4. `delivered` — `deliveredAt` ("29-sentabr kuni topshirildi").
5. `cancelled` — `deliveryNote` (sabab) va "Coin hamyoningizga qaytarildi".
6. **"Bekor qilish" tugmasi qo'ymang.** `pending` / `approved` da kichik matn: "Bekor qilish uchun adminga murojaat qiling".

#### D. Dashboard (`GET /students/me/dashboard`)

- `purchases.recent` da ham yangi status badge'lari; `delivered` bo'lsa `deliveredAt`.

### 5.3 Teacher panel

- Xaridlar sahifasi/menyusi bo'lsa — **olib tashlang** (`GET /purchases`, `GET /purchases/:id` → `403`).

---

## 6. Frontend uchun tekshiruv ro'yxati

**Admin**

- [ ] `PATCH /purchases/:id/status` javobini yangi formatga o'tkazish (`data`, `refund`)
- [ ] Buyurtmalar sahifasida 4 ta status tabi + "Hammasi"
- [ ] "Topshirildi" tugmasi (`approved` holatida)
- [ ] `approved` holatida ham "Bekor qilish" tugmasi
- [ ] Tasdiqlash modaliga izoh maydoni (`adminNote`)
- [ ] Bekor qilish modaliga sabab + "Zaxiraga qaytarish" checkbox (`restock`)
- [ ] Jadvalda `deliveryNote`, `approvedBy`, `deliveredBy`, `deliveredAt`
- [ ] `409` ni ushlash va ro'yxatni yangilash
- [ ] Dashboard'da `approvedPurchases` kartochkasi
- [ ] Sovg'alar ro'yxatida "Sotuvda / Band / Omborda", `-1` → "Cheksiz"
- [ ] Yaratish formasida "Cheksiz" toggle
- [ ] Tahrirlash formasida `stockDelta` (asosiy) va `stock` (aniq qiymat) rejimlari, faqat o'zgargan maydonlarni yuborish

**Student**

- [ ] "Mening xaridlarim" sahifasi — 4 status, `deliveryNote`, `deliveredAt`
- [ ] Bekor qilish tugmasi yo'q, "adminga murojaat qiling" matni
- [ ] Do'konda `stock: -1` → "Cheksiz" (yoki hech narsa)
- [ ] Dashboard `purchases.recent` da yangi statuslar

**Teacher**

- [ ] Xaridlar menyusini olib tashlash

**Umumiy**

- [ ] Coin tarixida qaytarilgan coin endi `sourceType: "purchase"` + `direction: "earn"` (avval `bonus`)

---

## 7. Obyektlar ma'lumotnomasi

### Reward

| Maydon          | Turi                                   | Izoh                                            |
| --------------- | -------------------------------------- | ----------------------------------------------- |
| `id`            | uuid                                   |                                                 |
| `title`         | string                                 |                                                 |
| `description`   | `string \| null`                       |                                                 |
| `coinPrice`     | number                                 | Joriy narx                                      |
| `stock`         | number                                 | Yana nechta sotish mumkin; `-1` — cheksiz       |
| `reservedCount` | number                                 | **Yangi.** `pending` + `approved` xaridlar soni |
| `rewardType`    | `privilege` \| `digital` \| `physical` |                                                 |
| `imageUrl`      | `string \| null`                       |                                                 |
| `isActive`      | boolean                                |                                                 |
| `categoryId`    | uuid                                   |                                                 |

### Purchase

| Maydon          | Turi                                 | Izoh                                                            |
| --------------- | ------------------------------------ | --------------------------------------------------------------- |
| `id`            | uuid                                 |                                                                 |
| `coinSpent`     | number                               | Sotib olish paytidagi narx (keyin narx o'zgarsa ham shu qoladi) |
| `status`        | enum                                 | `pending` / `approved` / `delivered` / `cancelled`              |
| `deliveryNote`  | `string \| null`                     | Adminning oxirgi izohi (`adminNote`)                            |
| `stockReserved` | boolean                              | **Yangi.** Xarid paytida zaxiradan dona ayirilganmi             |
| `purchasedAt`   | ISO datetime                         | Sotib olingan vaqt                                              |
| `deliveredAt`   | `ISO datetime \| null`               | **Yangi.** Qo'lga berilgan vaqt                                 |
| `updatedAt`     | ISO datetime                         |                                                                 |
| `studentId`     | uuid                                 |                                                                 |
| `rewardId`      | uuid                                 |                                                                 |
| `approvedById`  | `uuid \| null`                       | Endi haqiqatda to'ldiriladi                                     |
| `deliveredById` | `uuid \| null`                       | **Yangi**                                                       |
| `student`       | `{ id, fullName, phone }`            |                                                                 |
| `reward`        | `{ id, title, coinPrice, imageUrl }` | `coinPrice` — sovg'aning **joriy** narxi                        |
| `approvedBy`    | `{ id, fullName } \| null`           | **Yangi**                                                       |
| `deliveredBy`   | `{ id, fullName } \| null`           | **Yangi**                                                       |

---

## 8. Xato holatlari

| Kod   | Endpoint                                               | Qachon                                                            | Misol `message`                                                                                               |
| ----- | ------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `400` | `PATCH /purchases/:id/status`                          | `status` noto'g'ri                                                | `Status faqat approved, delivered yoki cancelled bo‘lishi mumkin`                                             |
| `400` | `PATCH /purchases/:id/status`                          | Ruxsat etilmagan o'tish                                           | `Buyurtmani "pending" holatidan "delivered" holatiga o'tkazib bo'lmaydi. Ruxsat etilgan: approved, cancelled` |
| `400` | `PATCH /purchases/:id/status`                          | Yakunlangan xarid                                                 | `Ushbu buyurtma allaqachon yakunlangan. Joriy holati: delivered`                                              |
| `400` | `PATCH /purchases/:id/status`                          | O'quvchining hamyoni yo'q                                         | `Foydalanuvchining hamyoni topilmadi. Tanga qaytarishning iloji yo‘q.`                                        |
| `400` | `PATCH /purchases/:id/status`                          | `restock` boolean emas                                            | `restock must be a boolean value`                                                                             |
| `400` | `POST /rewards/:id/purchase`                           | Coin yetarli emas / zaxira tugagan                                | `Tangalaringiz yetarli emas...` / `Afsuski, ushbu sovg‘a omborda qolmagan.`                                   |
| `400` | `POST` / `PATCH /rewards`                              | `stock < -1`                                                      | `Zaxira 0 yoki undan katta bo‘lishi kerak (-1 — cheksiz)`                                                     |
| `400` | `PATCH /rewards/:id`                                   | `stockDelta: 0`                                                   | `stockDelta 0 bo‘lishi mumkin emas`                                                                           |
| `400` | `PATCH /rewards/:id`                                   | `stock` va `stockDelta` birga                                     | `` `stock` va `stockDelta` birga yuborilmaydi — bittasini tanlang ``                                          |
| `400` | `PATCH /rewards/:id`                                   | Cheksiz sovg'aga `stockDelta`                                     | `Cheksiz (-1) sovg‘a zaxirasini stockDelta bilan o‘zgartirib bo‘lmaydi. Aniq son uchun `stock` yuboring`      |
| `400` | `PATCH /rewards/:id`                                   | `stockDelta` zaxirani manfiyga tushiradi                          | `Zaxirani -5 ga o‘zgartirib bo‘lmaydi: joriy zaxira 2`                                                        |
| `403` | `GET /purchases`, `/purchases/:id`                     | Teacher                                                           | `O'qituvchi xaridlarni ko'ra olmaydi`                                                                         |
| `403` | `GET /purchases/:id`                                   | Student boshqaning xaridini so'radi                               | `Siz bu xaridni ko'ra olmaysiz`                                                                               |
| `403` | `PATCH /purchases/:id/status`, `POST`/`PATCH /rewards` | Admin emas                                                        | `Bu amalni bajarish uchun admin yoki super_admin huquqi kerak`                                                |
| `404` | `…/purchases/:id…`                                     | Xarid topilmadi (yoki boshqa tenantniki)                          | `Xarid buyurtmasi topilmadi`                                                                                  |
| `404` | `…/rewards/:id…`                                       | Sovg'a topilmadi (yoki o'chirilgan / boshqa tenantniki)           | `Sovg‘a topilmadi`                                                                                            |
| `409` | `PATCH /purchases/:id/status`                          | Holat shu orada boshqa so'rov bilan o'zgargan (ikki marta bosish) | `Buyurtma holati boshqa so‘rov tomonidan o‘zgartirildi. Sahifani yangilab, qayta urinib ko‘ring.`             |

---

## 9. O'zgarishlar jurnali

| Sana       | O'zgarish                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-28 | `delivered` bosqichi (`approved` → `delivered`); `approved` holatidan ham bekor qilish mumkin                                |
| 2026-09-28 | Purchase: `deliveredAt`, `deliveredById`, `deliveredBy`; `approvedById` / `approvedBy` endi to'ldiriladi                     |
| 2026-09-28 | `adminNote` → `deliveryNote` ga saqlanadi                                                                                    |
| 2026-09-28 | `PATCH /purchases/:id/status` javobi `{ message, data, refund? }` (**breaking**)                                             |
| 2026-09-28 | Qaytarilgan coin `sourceType: "purchase"` (avval `bonus`)                                                                    |
| 2026-09-28 | Teacher: `GET /purchases`, `GET /purchases/:id` → `403`; o'chirilgan xaridlar ro'yxatda ko'rinmaydi                          |
| 2026-09-28 | `GET /dashboard/admin` → `needsAttention.approvedPurchases`; `GET /students/me/dashboard` → `purchases.recent[].deliveredAt` |
| 2026-09-28 | Parallel so'rovlarda balans manfiyga tushishi / zaxiradan ortiq sotilishi / coin ikki marta qaytishi tuzatildi               |
| 2026-09-29 | Reward: `reservedCount` (`GET /rewards`, `GET /rewards/:id`, `PATCH /rewards/:id`)                                           |
| 2026-09-29 | `PATCH /rewards/:id` — `stockDelta`                                                                                          |
| 2026-09-29 | `POST` / `PATCH /rewards` — `stock: -1` (cheksiz) qabul qilinadi                                                             |
| 2026-09-29 | `GET /rewards?onlyInStock=true` cheksiz sovg'alarni ham qaytaradi                                                            |
| 2026-09-29 | Bekor qilishda `restock`; javobda `refund.stockRestored`; Purchase'da `stockReserved`                                        |
