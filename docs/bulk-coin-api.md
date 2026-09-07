# Ommaviy (Bulk) Coin Berish — Frontend API Qo'llanmasi

> Ushbu hujjat yangi qo'shilgan ikkita imkoniyatni tasvirlaydi: (1) bir nechta o'quvchiga birdaniga bir xil miqdorda coin berish/ayirish, (2) mavjud `CoinRule`ni bir yoki bir nechta o'quvchiga qo'llash.

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie (`access_token`, `refresh_token`) — `withCredentials: true` shart
**Format:** JSON

---

## Mundarija

- [Umumiy mantiq: "Partial Success"](#umumiy-mantiq-partial-success)
- [1. `POST /coin-transactions/bulk-manual`](#1-post-coin-transactionsbulk-manual)
- [2. `POST /coin-transactions/apply-rule`](#2-post-coin-transactionsapply-rule)
- [Frontendda ishlatish tavsiyalari](#frontendda-ishlatish-tavsiyalari)
- [Xato holatlari](#xato-holatlari)

---

## Umumiy mantiq: "Partial Success"

Ikkala endpoint ham **hech qachon butunlay "hammasi yoki hech biri" (atomik) ishlamaydi**. Har bir tanlangan o'quvchi **alohida-alohida** qayta ishlanadi:

- Agar 20 ta o'quvchi tanlangan bo'lsa-yu, ulardan 1 tasida xatolik chiqsa (masalan balansi yetarli emas, yoki teacher o'z guruhidan tashqari studentni tanlagan bo'lsa) — **qolgan 19 tasiga coin baribir beriladi**.
- Javobda har bir o'quvchi bo'yicha **alohida natija** qaytadi (`success: true/false` + xato bo'lsa sababi).
- HTTP status har doim `201` (agar validatsiya — masalan bo'sh `studentIds` massivi — o'tmasa, `400` bo'ladi). Ya'ni **HTTP status kodiga qarab emas, javob ichidagi `results[]`ga qarab** har bir o'quvchi uchun natijani frontendda ko'rsating.

Ikkala javobda ham umumiy shakl:

```json
{
  "totalRequested": 20,
  "successCount": 19,
  "failedCount": 1,
  "results": [
    { "studentId": "uuid-1", "success": true, "transactionId": "uuid", "newBalance": 55 },
    { "studentId": "uuid-2", "success": false, "error": "Talabaning balansi yetarli emas. Joriy balans: 3, ayirilmoqchi: 5" }
  ]
}
```

---

## 1. `POST /coin-transactions/bulk-manual`

Bir nechta tanlangan o'quvchiga **bir xil sabab va bir xil miqdorda** coin berish yoki ayirish uchun (masalan: "barchasiga darsda faol qatnashgani uchun 5 coindan").

**Ruxsat:** `admin`, `super_admin`, `teacher`

### Request Body

```json
{
  "studentIds": ["student-uuid-1", "student-uuid-2", "student-uuid-3"],
  "amount": 5,
  "direction": "earn",
  "sourceType": "bonus",
  "note": "Darsda faol qatnashgani uchun",
  "groupId": "group-uuid",
  "sessionId": "session-uuid"
}
```

| Maydon | Turi | Majburiymi | Izoh |
| --- | --- | --- | --- |
| `studentIds` | `string[]` (UUID) | ✅ | Kamida 1, ko'pi bilan 300 ta o'quvchi. Takrorlanganlar avtomatik bir martaga tushiriladi. |
| `amount` | `number` (int, ≥1) | ✅ | Har bir o'quvchiga beriladigan/ayiriladigan **bir xil** miqdor. |
| `direction` | `"earn" \| "deduct"` | ✅ | Qo'shish yoki ayirish. |
| `sourceType` | `"attendance" \| "homework" \| "competition" \| "manual" \| "bonus" \| "purchase"` | ✅ | Tranzaksiya manbasi. |
| `note` | `string` | ❌ | Barcha tanlangan studentlar uchun bir xil izoh. |
| `groupId` | `string` (UUID) | ❌ | Faqat statistika/filtrlash uchun bog'lanadi, cheklov qo'ymaydi. |
| `sessionId` | `string` (UUID) | ❌ | Agar ma'lum bir darsga bog'liq bo'lsa. |

### Logika

1. Har bir `studentId` uchun **alohida** tekshiriladi:
   - Agar so'rovchi `teacher` bo'lsa — student **uning o'zi dars beradigan guruhida** ekanligi tekshiriladi (`GroupStudent` + `Group.teacherId`). Aks holda o'sha student uchun xato: `"Siz faqat o'z guruhingizdagi o'quvchiga tanga bera olasiz"`.
   - `admin`/`super_admin` — cheklovsiz, tenant ichidagi istalgan studentga bera oladi.
2. `direction: "deduct"` bo'lsa, har bir student uchun **joriy balans yetarliligi** tekshiriladi. Yetarli bo'lmasa o'sha student uchun xato qaytadi, qolganlar davom etadi.
3. Har bir muvaffaqiyatli operatsiya alohida `CoinTransaction` yozuvi yaratadi va `Wallet.balance`ni yangilaydi (atomik, Prisma `$transaction` ichida — bitta studentning tranzaksiyasi boshqasiga ta'sir qilmaydi).

### Response (`201`)

Yuqoridagi umumiy shaklda (`totalRequested`, `successCount`, `failedCount`, `results[]`).

---

## 2. `POST /coin-transactions/apply-rule`

Oldindan `CoinRule` sifatida yaratilgan qoidani (masalan "Faol qatnashish — 5 coin") tanlab, uni bir yoki bir nechta studentga **biriktirish** orqali qo'llash. Miqdor, yo'nalish va manba (`sourceType`) — **qoidaning o'zidan** olinadi, frontend qayta kiritishi shart emas.

**Ruxsat:** `admin`, `super_admin`, `teacher`

### Request Body

```json
{
  "ruleId": "rule-uuid",
  "studentIds": ["student-uuid-1", "student-uuid-2"],
  "note": "Oy yakuni bonusi",
  "sessionId": "session-uuid"
}
```

| Maydon | Turi | Majburiymi | Izoh |
| --- | --- | --- | --- |
| `ruleId` | `string` (UUID) | ✅ | `GET /coin-rules`dan tanlangan mavjud qoida IDsi. |
| `studentIds` | `string[]` (UUID) | ✅ | Kamida 1, ko'pi bilan 300 ta. |
| `note` | `string` | ❌ | Berilmasa avtomatik `"<qoida nomi>" qoidasi asosida` matni ishlatiladi. |
| `sessionId` | `string` (UUID) | ❌ | Agar ma'lum bir darsga bog'liq bo'lsa. |

> **Diqqat:** bu yerda `amount`, `direction`, `sourceType` **yubormaysiz** — ular `CoinRule.coinAmount`, `CoinRule.direction`, `CoinRule.sourceType`dan avtomatik olinadi.

### Logika

1. `ruleId` bo'yicha `CoinRule` topiladi (`isActive: true`, `isDeleted: false`, shu tenantga tegishli). Topilmasa/nofaol bo'lsa — butun so'rov `404` bilan bloklanadi (bu yagona "hammasi to'xtaydi" holat, chunki qoidaning o'zi yo'q bo'lsa hech kimga hech narsa qo'llab bo'lmaydi).
2. Har bir `studentId` uchun:
   - **Agar qoida ma'lum bir guruhga biriktirilgan bo'lsa** (`CoinRule.groupId` bor) — student **shu guruh a'zosi** ekanligi tekshiriladi. Aks holda: `"Bu qoida faqat biriktirilgan guruh a'zolariga qo'llanadi, o'quvchi shu guruhda emas"`. Guruhsiz (umumiy/tenant darajasidagi) qoidalar istalgan studentga qo'llanadi.
   - `teacher` bo'lsa, xuddi `bulk-manual`dagi kabi — faqat **o'z guruhidagi** studentga.
   - Balans yetarliligi (`deduct` uchun) xuddi shunday tekshiriladi.
3. Yaratilgan `CoinTransaction`da `ruleId` maydoni to'ldiriladi (statistikada "qaysi qoida bo'yicha berilgan" ko'rinadi).

### Response (`201`)

```json
{
  "rule": { "id": "rule-uuid", "name": "Faol qatnashish", "coinAmount": 5, "direction": "earn" },
  "totalRequested": 2,
  "successCount": 2,
  "failedCount": 0,
  "results": [
    { "studentId": "uuid-1", "success": true, "transactionId": "uuid", "newBalance": 60 },
    { "studentId": "uuid-2", "success": true, "transactionId": "uuid", "newBalance": 45 }
  ]
}
```

**Xato (`404`)** — qoida topilmasa:

```json
{ "statusCode": 404, "message": "Tanga qoidasi topilmadi yoki nofaol", "error": "Not Found" }
```

---

## Frontendda ishlatish tavsiyalari

1. **"Guruhga ommaviy coin berish" ekrani**: o'qituvchi/admin guruhni tanlaydi → `GET /students?groupId=` orqali o'quvchilar checkbox ro'yxatida chiqadi → "Hammasini belgilash" tugmasi → miqdor/sabab kiritib `bulk-manual` chaqiriladi.
2. **"Qoida biriktirish" ekrani**: `GET /coin-rules` dropdown'dan qoida tanlanadi → studentlar checkbox bilan tanlanadi → `apply-rule` chaqiriladi. Bu yerda miqdor/yo'nalish maydonlari **ko'rsatilmasin** — ular qoidadan avtomatik keladi (faqat `note` ixtiyoriy qoldirilsin).
3. **Natijani ko'rsatish**: `results[]` massivini studentlar ro'yxati bilan solishtirib, har biriga ✅/❌ belgisi qo'ying. Xato chiqqanlarni alohida "Diqqat, N ta studentga coin berilmadi" bloki bilan ko'rsating — ularning `error` matnini to'g'ridan-to'g'ri foydalanuvchiga ko'rsatish mumkin (backend xabarlari allaqachon o'zbek tilida, foydalanuvchiga tushunarli).
4. `studentIds` array bo'sh yuborilsa `400 Bad Request` qaytadi (`"Kamida 1 ta o'quvchi tanlanishi kerak"`) — frontendda submit tugmasini kamida 1 ta student tanlanmaguncha disable qilib qo'ying.

---

## Xato holatlari

| Status | Qachon |
| --- | --- |
| `400` | `studentIds` bo'sh yoki 300 tadan ortiq; `amount < 1`; noto'g'ri enum qiymat |
| `401` | Token yo'q/muddati tugagan |
| `404` | `apply-rule`da `ruleId` topilmadi yoki nofaol |
| Har bir `results[]` elementi ichida `success: false` | Individual student darajasidagi xato (403-teacher ruxsati, balans yetarli emas, guruh mos emas) — bular HTTP xato emas, javob tarkibida keladi |
