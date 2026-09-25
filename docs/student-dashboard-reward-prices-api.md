# Student Dashboard — Sovg'a narxlari oralig'i (GardenPath) — Frontend API Qo'llanmasi

> `GET /students/me/dashboard` javobiga yangi `rewards` bloki qo'shildi: do'kondagi faol sovg'alarning **eng arzon** va **eng qimmat** narxi. Dashboard'dagi `GardenPath` komponenti shu qiymatlarga qarab chiziladi.

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie (`access_token`, `refresh_token`) — `withCredentials: true` shart
**Format:** JSON

---

## Mundarija

- [1. `GET /students/me/dashboard`](#1-get-studentsmedashboard)
- [`rewards` bloki](#rewards-bloki)
- [Frontendda ishlatish tavsiyalari](#frontendda-ishlatish-tavsiyalari)
- [Xato holatlari](#xato-holatlari)
- [O'zgarishlar jurnali](#ozgarishlar-jurnali)

---

## 1. `GET /students/me/dashboard`

Tizimga kirgan o'quvchining shaxsiy dashboard xulosasi. Mavjud maydonlar (`student`, `wallet`, `attendance`, `todaySessions`, `upcomingSessions`, `recentTransactions`, `purchases`) **o'zgarmagan** — faqat `rewards` qo'shildi.

**Ruxsat:** `student` (tokendan)

### Response (`200`)

```json
{
  "student": {
    "id": "uuid",
    "fullName": "Ali Valiyev",
    "avatarUrl": "/uploads/..."
  },
  "wallet": { "balance": 120, "weekDelta": 15, "monthDelta": 60 },
  "attendance": { "last30Days": { "...": "..." } },
  "todaySessions": [],
  "upcomingSessions": [],
  "recentTransactions": [],
  "purchases": { "pendingCount": 1, "recent": [] },
  "rewards": {
    "minPrice": 50,
    "maxPrice": 1500,
    "activeCount": 12
  }
}
```

---

## `rewards` bloki

| Maydon        | Turi             | Izoh                                           |
| ------------- | ---------------- | ---------------------------------------------- |
| `minPrice`    | `number \| null` | Eng arzon faol sovg'aning `coinPrice` qiymati  |
| `maxPrice`    | `number \| null` | Eng qimmat faol sovg'aning `coinPrice` qiymati |
| `activeCount` | `number`         | Hisobga olingan sovg'alar soni                 |

Hisobga olinadigan sovg'alar: o'quvchining tenantidagi `isActive: true` va o'chirilmagan (`isDeleted: false`) sovg'alar — ya'ni do'kon (`GET /rewards`) sukut bo'yicha ko'rsatadigan ro'yxat bilan bir xil. Ombordagi qoldiq (`stock`) hisobga **olinmaydi**.

- Do'konda faol sovg'a bo'lmasa: `minPrice: null`, `maxPrice: null`, `activeCount: 0`.
- Bitta sovg'a bo'lsa (yoki hammasi bir narxda): `minPrice === maxPrice`.

---

## Frontendda ishlatish tavsiyalari

1. **Progress hisoblash**: `progress = (balance - minPrice) / (maxPrice - minPrice)`, natijani `0..1` oralig'iga cheklang (`balance < minPrice` → 0, `balance > maxPrice` → 1).
2. **`minPrice === maxPrice`** bo'lsa nolga bo'lish chiqadi — bunday holatda `progress = balance >= maxPrice ? 1 : balance / maxPrice` kabi alohida hisoblang.
3. **`activeCount === 0`** (yoki `minPrice === null`) bo'lsa `GardenPath`ni bo'sh holatda ko'rsating (masalan "Do'konda hali sovg'a yo'q").

---

## Xato holatlari

| Status | Qachon                           |
| ------ | -------------------------------- |
| `401`  | Token yo'q/muddati tugagan       |
| `404`  | O'quvchi topilmadi (o'chirilgan) |

---

## O'zgarishlar jurnali

| Sana       | O'zgarish                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------- |
| 2026-09-25 | `GET /students/me/dashboard` javobiga `rewards` (`minPrice`, `maxPrice`, `activeCount`) qo'shildi |
