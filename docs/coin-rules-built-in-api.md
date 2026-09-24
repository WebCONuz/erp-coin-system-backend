# Asosiy (built-in) Coin Qoidalari — Frontend API Qo'llanmasi

> Har bir tenant endi yaratilgan paytidanoq ikkita **asosiy coin qoidasiga** ega: **"Davomat"** va **"Uyga vazifa"**. Ular yangi `isBuiltIn: true` maydoni bilan belgilanadi. Admin ularning coin miqdorini o'zgartira oladi, lekin qoidani o'chira olmaydi va uning logikasini buza olmaydi.

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie (`access_token`, `refresh_token`) — `withCredentials: true` shart
**Format:** JSON

---

## Mundarija

- [1. Nima o'zgardi (qisqacha)](#1-nima-ozgardi-qisqacha)
- [2. Nima uchun](#2-nima-uchun)
- [3. `CoinRule` modeliga yangi maydon: `isBuiltIn`](#3-coinrule-modeliga-yangi-maydon-isbuiltin)
- [4. `POST /tenants` — asosiy qoidalar avtomatik yaratiladi](#4-post-tenants--asosiy-qoidalar-avtomatik-yaratiladi)
- [5. `GET /coin-rules` — `isBuiltIn` va yangi tartib](#5-get-coin-rules--isbuiltin-va-yangi-tartib)
- [6. `PATCH /coin-rules/:id` — asosiy qoidani tahrirlash](#6-patch-coin-rulesid--asosiy-qoidani-tahrirlash)
- [7. `DELETE /coin-rules/:id` — asosiy qoidani o'chirib bo'lmaydi](#7-delete-coin-rulesid--asosiy-qoidani-ochirib-bolmaydi)
- [8. `POST /coin-rules` — umumiy auto qoida dublikati taqiqlandi](#8-post-coin-rules--umumiy-auto-qoida-dublikati-taqiqlandi)
- [9. Frontend uchun amaliy tavsiyalar](#9-frontend-uchun-amaliy-tavsiyalar)
- [Xato holatlari](#xato-holatlari)
- [O'zgarishlar jurnali](#ozgarishlar-jurnali)

---

## 1. Nima o'zgardi (qisqacha)

| Oldin | Endi |
| --- | --- |
| Yangi tenantda coin qoidasi yo'q edi — admin "Davomat"/"Uyga vazifa"ni qo'lda yaratishi kerak edi | `POST /tenants` 2 ta asosiy qoidani **avtomatik** yaratadi |
| Qoidalarning hammasi bir xil edi | Asosiy qoidalar `isBuiltIn: true`, admin yaratganlari `isBuiltIn: false` |
| Istalgan qoidani tahrirlash/o'chirish mumkin edi | Asosiy qoidada faqat `coinAmount`, `name`, `description` o'zgaradi; o'chirib bo'lmaydi |
| Bitta tenantda ikkita umumiy "Davomat" auto qoidasi bo'lishi mumkin edi | Taqiqlandi → `409` |

Mavjud tenantlarga ham asosiy qoidalar backend tomonidan qo'shildi. Agar tenantda "Davomat" yoki "Uyga vazifa" qoidasi allaqachon bo'lgan bo'lsa, u asosiy qoida deb belgilandi va **coin miqdori saqlandi**.

---

## 2. Nima uchun

Yo'qlama saqlanganda (`POST /sessions/:id/attendance`) backend avtomatik coin qoidasini **nomi bo'yicha emas**, uchta maydon bo'yicha qidiradi: `triggerType: "auto"`, `sourceType` va `direction`. Agar admin bu maydonlardan birini o'zgartirsa yoki qoidani o'chirsa, tizim hech qanday xato bermaydi va jimgina standart qiymatga (5 / 10 coin) qaytadi. Admin esa nima uchun o'zi qo'ygan miqdor ishlamayotganini tushunmay qoladi. Asosiy qoidalar shu vaziyatning oldini oladi.

---

## 3. `CoinRule` modeliga yangi maydon: `isBuiltIn`

```ts
CoinRule {
  // ...mavjud maydonlar
  isBuiltIn: boolean; // true — tenant bilan avtomatik yaratilgan asosiy qoida
                      // false — admin/teacher keyinchalik yaratgan qoida
}
```

- Faqat backend belgilaydi. `POST /coin-rules` yoki `PATCH /coin-rules/:id` body'sida `isBuiltIn` yuborilsa `400` qaytadi ("property isBuiltIn should not exist"). Shuning uchun GET javobidan olingan obyektni o'zgartirmasdan PATCH ga yubormang.
- Har bir tenantda aynan 2 ta asosiy qoida bo'ladi:

| `name` | `sourceType` | `direction` | `triggerType` | `groupId` | Default `coinAmount` |
| --- | --- | --- | --- | --- | --- |
| Davomat | `attendance` | `earn` | `auto` | `null` | 5 |
| Uyga vazifa | `homework` | `earn` | `auto` | `null` | 10 |

> Jarima qoidasi (`attendance` / `deduct`) asosiy qoida emas. Uni admin xohlasa `POST /coin-rules` orqali o'zi yaratadi (avvalgidek).

---

## 4. `POST /tenants` — asosiy qoidalar avtomatik yaratiladi

**Ruxsat:** `super_admin`. **Request body o'zgarmagan.**

Tenant, uning 3 ta roli va 2 ta asosiy coin qoidasi **bitta atomik operatsiyada** yaratiladi: yoki hammasi yaratiladi, yoki hech biri. `createdBy` sifatida tenantni yaratgan super_admin yoziladi.

**201 Response** — `data` ga `coinRules` massivi qo'shildi:

```json
{
  "status": "success",
  "message": "Successfully created",
  "data": {
    "id": "a7b2…",
    "name": "Najot Ta'lim",
    "slug": "najot-talim",
    "roles": [ /* qarang: roles-readonly-api.md */ ],
    "coinRules": [
      {
        "id": "f1c2…",
        "name": "Davomat",
        "coinAmount": 5,
        "direction": "earn",
        "triggerType": "auto",
        "sourceType": "attendance",
        "isBuiltIn": true
      },
      {
        "id": "b8d4…",
        "name": "Uyga vazifa",
        "coinAmount": 10,
        "direction": "earn",
        "triggerType": "auto",
        "sourceType": "homework",
        "isBuiltIn": true
      }
    ]
  }
}
```

---

## 5. `GET /coin-rules` — `isBuiltIn` va yangi tartib

Request o'zgarmagan. Javobdagi har bir qoidaga `isBuiltIn` qo'shildi. Ro'yxat endi shunday tartiblanadi: **avval asosiy qoidalar**, keyin qolganlari yaratilgan vaqti bo'yicha (yangisi birinchi).

```json
{
  "data": [
    {
      "id": "f1c2…",
      "name": "Davomat",
      "description": "Darsda qatnashgani uchun avtomatik beriladi",
      "coinAmount": 5,
      "direction": "earn",
      "isActive": true,
      "triggerType": "auto",
      "sourceType": "attendance",
      "isBuiltIn": true,
      "group": null,
      "createdBy": { "id": "…", "fullName": "Super Admin" }
    }
  ],
  "meta": { "total": 3, "page": 1, "limit": 10, "totalPages": 1 }
}
```

`GET /coin-rules/:id` va `PATCH /coin-rules/:id` javoblarida ham `isBuiltIn` bor.

---

## 6. `PATCH /coin-rules/:id` — asosiy qoidani tahrirlash

**Ruxsat:** `admin`, `super_admin` (o'zgarmagan).

Asosiy qoidada (`isBuiltIn: true`):

| Maydon | Tahrirlash |
| --- | --- |
| `coinAmount` | ✅ mumkin — asosiy maqsad shu |
| `name` | ✅ mumkin |
| `description` | ✅ mumkin |
| `direction`, `triggerType`, `sourceType`, `groupId` | ❌ **qiymati o'zgarsa** `409` |

Qulflangan maydonlarni **joriy qiymati bilan** yuborish xato emas. Shuning uchun frontend butun formani (`name`, `description`, `coinAmount`, `direction`, `triggerType`, `sourceType`, `groupId`) yuborsa ham ishlaydi, faqat qulflangan maydonlarning qiymati o'zgarmagan bo'lishi kerak.

**Misol — davomat coinini 8 ga o'zgartirish:**

```http
PATCH /coin-rules/f1c2…
```

```json
{ "coinAmount": 8 }
```

**Xato misol** (asosiy qoidani `manual` ga aylantirishga urinish):

```json
{
  "statusCode": 409,
  "message": "Asosiy qoidada quyidagi maydonlarni o'zgartirib bo'lmaydi: triggerType",
  "error": "Conflict"
}
```

Oddiy qoidalarda (`isBuiltIn: false`) tahrirlash avvalgidek ishlaydi. Faqat [8-bo'limdagi](#8-post-coin-rules--umumiy-auto-qoida-dublikati-taqiqlandi) dublikat cheklovi ularga ham tegishli.

---

## 7. `DELETE /coin-rules/:id` — asosiy qoidani o'chirib bo'lmaydi

Asosiy qoidani o'chirishga urinilsa:

```json
{
  "statusCode": 409,
  "message": "Asosiy qoidani o'chirib bo'lmaydi — faqat coin miqdorini o'zgartirish mumkin",
  "error": "Conflict"
}
```

Oddiy qoidalar avvalgidek o'chiriladi (soft-delete).

---

## 8. `POST /coin-rules` — umumiy auto qoida dublikati taqiqlandi

Bitta tenantda bir xil `sourceType` + `direction` uchun **umumiy** (`groupId` yo'q) `auto` qoida faqat bitta bo'lishi mumkin. Ikkita bo'lsa, yo'qlamada qaysi biri ishlashi tasodifiy bo'lib qoladi.

Endi asosiy qoidalar har doim mavjud. Shuning uchun quyidagilarni yaratishga urinilsa `409` qaytadi:

- `groupId` siz, `triggerType: "auto"`, `sourceType: "attendance"`, `direction: "earn"` bo'lgan qoida ("Davomat" allaqachon bor);
- `groupId` siz, `triggerType: "auto"`, `sourceType: "homework"`, `direction: "earn"` bo'lgan qoida ("Uyga vazifa" allaqachon bor);
- ikkinchi umumiy jarima qoidasi (`attendance` / `deduct`), agar birinchisi allaqachon mavjud bo'lsa.

Xuddi shu cheklov `PATCH` ga ham tegishli: mavjud qoidani tahrirlab, uni shunday dublikatga aylantirib bo'lmaydi.

```json
{
  "statusCode": 409,
  "message": "Bu tenantda \"attendance/earn\" uchun umumiy avtomatik qoida allaqachon mavjud (\"Davomat\"). Uni tahrirlang yoki yangi qoidani ma'lum bir guruhga (groupId) bog'lang",
  "error": "Conflict"
}
```

**Cheklovga kirmaydigan qoidalar:**

- **Guruhga tegishli qoidalar** (`groupId` berilgan). Masalan, "Pre-IELTS guruhida davomat uchun 12 coin" qoidasini yaratish mumkin. U shu guruhda asosiy qoidadan **ustun** turadi.
- **`manual` qoidalar**, ular yo'qlamada ishlatilmaydi.
- **O'chirilgan qoidalar.** Ammo **nofaol** (`isActive: false`) qoidalar ham hisobga olinadi: yangisini yaratish o'rniga mavjudini qayta faollashtiring yoki tahrirlang.

---

## 9. Frontend uchun amaliy tavsiyalar

1. **"Coin qoidalari" ro'yxati:** `isBuiltIn: true` qoidalarni ro'yxat tepasida "Asosiy" badge bilan ko'rsating (backend ularni allaqachon birinchi qaytaradi). **O'chirish tugmasini yashiring.**
2. **Asosiy qoidani tahrirlash formasi:** faqat `coinAmount`, `name`, `description` inputlarini faol qoldiring. `direction`, `triggerType`, `sourceType`, `groupId` ni `disabled` qiling yoki umuman ko'rsatmang.
3. **"Davomat / uy vazifasi uchun coin" sozlamasi:** alohida sahifa kerak bo'lsa, `GET /coin-rules?triggerType=auto` dan `isBuiltIn: true` qoidalarni olib, har biriga bitta raqam inputi qo'ying. Saqlashda `PATCH /coin-rules/:id` ga `{ "coinAmount": N }` yuboring.
4. **Yangi qoida yaratish formasi:** admin `auto` + `attendance`/`homework` + `earn` tanlasa, `groupId` ni **majburiy** qiling va shunday izoh chiqaring: "Umumiy qoida allaqachon mavjud, faqat guruh uchun maxsus qoida yaratish mumkin". Shunda `409` ga tushmaysiz.
5. **ID ni hardcode qilmang.** Asosiy qoidani `isBuiltIn` + `sourceType` bo'yicha toping: `rules.find(r => r.isBuiltIn && r.sourceType === 'attendance')`.
6. **`409` ni ko'rsating.** `message` foydalanuvchiga tushunarli matn sifatida yozilgan, uni toast'da ko'rsatish mumkin.

---

## Xato holatlari

| Status | Qachon |
| --- | --- |
| `400` | Body'da DTO'da yo'q maydon bor (masalan `isBuiltIn`, `id`, `createdBy`) |
| `401` | Token yo'q/muddati tugagan → `/auth/refresh` chaqiring |
| `403` | Ruxsat yo'q (masalan teacher `PATCH`/`DELETE /coin-rules` chaqirganda) |
| `404` | Qoida topilmadi yoki boshqa tenantga tegishli |
| `409` | Asosiy qoidaning qulflangan maydonini o'zgartirish; asosiy qoidani o'chirish; umumiy auto qoida dublikatini yaratish/ga aylantirish |

---

## O'zgarishlar jurnali

**Sxema:**

- `CoinRule.isBuiltIn: boolean` (default `false`). Yangi maydon, mavjud qoidalar uchun `false`.

**Kengaytirilgan javob:**

- `POST /tenants` — `data.coinRules` massivi (2 ta asosiy qoida)
- `GET /coin-rules`, `GET /coin-rules/:id`, `PATCH /coin-rules/:id` — `isBuiltIn` maydoni
- `GET /coin-rules` — tartib: avval asosiy qoidalar, keyin `createdAt desc`

**Yangi cheklovlar (`409`):**

- `PATCH /coin-rules/:id` — asosiy qoidada `direction`, `triggerType`, `sourceType`, `groupId` ni o'zgartirish
- `DELETE /coin-rules/:id` — asosiy qoidani o'chirish
- `POST /coin-rules`, `PATCH /coin-rules/:id` — tenantda umumiy (`groupId: null`) auto qoidaning `sourceType`+`direction` bo'yicha dublikati

**O'zgarmagan:**

- Request body'lar, ruxsatlar (`@Roles`), yo'qlamada coin hisoblash logikasi. Qoida topilmasa standart qiymat (5 / 10) avvalgidek ishlaydi.

**Ma'lumotlar (backend tomonida):**

- Barcha mavjud tenantlarga asosiy qoidalar seed orqali qo'shiladi. Tenantda mos qoida allaqachon bo'lsa, u asosiy deb belgilanadi va uning coin miqdori o'zgarmaydi.
