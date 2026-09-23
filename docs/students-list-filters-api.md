# Talabalar Ro'yxati — Guruh Filtri va Saralash (Frontend API Qo'llanmasi)

> `GET /students` (Talabalar ro'yxati jadvali) uchun yangi qo'shilgan filtrlar: **guruh bo'yicha filtr**, **alifbo bo'yicha saralash** va **coin bo'yicha saralash**. `search` va `isActive` filtrlari o'zgarmadi.

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie — `withCredentials: true` shart
**Endpoint:** `GET /students`
**Ruxsat:** `admin`, `super_admin`, `teacher`

---

## Query parametrlari

| Parametr | Tur | Majburiymi | Tavsif |
|---|---|---|---|
| `search` | string | yo'q | Ism yoki telefon bo'yicha qidirish (o'zgarmagan) |
| `isActive` | `true` \| `false` | yo'q | `true` — faqat faollar, `false` — faqat arxivlanganlar, bo'sh — ikkalasi (o'zgarmagan) |
| `groupId` | UUID | yo'q | **Yangi emas, lekin endi to'liq ishlaydi** — faqat shu guruhga a'zo talabalarni qaytaradi (teacher uchun ham) |
| `sortBy` | `fullName` \| `coin` \| `createdAt` | yo'q | **Yangi.** Saralash maydoni. Default: `createdAt` |
| `sortOrder` | `asc` \| `desc` | yo'q | **Yangi.** Saralash yo'nalishi. Default: `desc` |
| `page` | number | yo'q | Sahifa raqami (default 1) |
| `limit` | number | yo'q | Sahifadagi elementlar soni (default 20, max 100) |

### Muhim eslatmalar

1. **`teacher` roli uchun ham `groupId` va sort endi ishlaydi.** Avval teacher ro'yxatida (o'z guruhlaridagi talabalar) `groupId` filtri va saralash umuman e'tiborga olinmasdi — hozir tuzatildi.
2. **Default saralash o'zgardi (faqat teacher uchun).** Avval teacher ro'yxati doim `fullName asc` (alifbo) bo'yicha kelardi. Endi `sortBy`/`sortOrder` berilmasa, admin ro'yxati bilan bir xil — `createdAt desc` bo'yicha keladi. Agar frontendda teacher jadvali hali ham default alifbo bo'yicha ochilishi kerak bo'lsa, so'rovda aniq `sortBy=fullName&sortOrder=asc` yuboring.
3. `sortBy=coin` — wallet balansi (`wallet.balance`) bo'yicha saralaydi.
4. Rasmdagi "Nomi ↑↓" va "Coin ↑↓" tugmalari mos ravishda `sortBy=fullName` va `sortBy=coin` ga, ikkinchi bosilganda `sortOrder=asc`↔`desc` ga almashadi.
5. "Sinf" (rasmda "Barcha sinflar" dropdown) — bu `groupId` filtri. Dropdown qiymatlari `GET /groups` (yoki teacher uchun `GET /groups/me`) dan olinadi.

---

## So'rov misollari

**Guruh bo'yicha filtr:**
```
GET /students?groupId=6f1e9c2a-....
```

**Ism bo'yicha o'sish tartibida (A→Z):**
```
GET /students?sortBy=fullName&sortOrder=asc
```

**Coin bo'yicha kamayish tartibida (eng ko'p tanga birinchi):**
```
GET /students?sortBy=coin&sortOrder=desc
```

**Hammasi birga (qidiruv + guruh + faol + coin bo'yicha kamayish + sahifalash):**
```
GET /students?search=Ali&groupId=6f1e9c2a-....&isActive=true&sortBy=coin&sortOrder=desc&page=1&limit=20
```

---

## Response (o'zgarmagan format)

```json
{
  "data": [
    {
      "id": "uuid",
      "fullName": "Ali Valiyev",
      "phone": "+998901234567",
      "email": null,
      "avatarUrl": null,
      "parentPhone": "+998901112233",
      "isActive": true,
      "isDeleted": false,
      "archivedAt": null,
      "createdAt": "2026-09-01T10:00:00.000Z",
      "role": { "id": "uuid", "name": "student", "displayName": "O'quvchi" },
      "wallet": { "balance": 340 }
    }
  ],
  "meta": { "total": 132, "page": 1, "limit": 20, "totalPages": 7 }
}
```

---

## O'zgarishlar jurnali

- **2026-09-23**: `sortBy` (`fullName` | `coin` | `createdAt`) va `sortOrder` (`asc` | `desc`) query parametrlari qo'shildi. Teacher ro'yxatida (`role=teacher` bo'lib kirganda) `groupId` filtri va saralash ilgari ishlamas edi — tuzatildi.
