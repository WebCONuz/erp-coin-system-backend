# Avtomatik Coin Qoidalari (guruh ustuvorligi) va Qulflangan Sessionni Tahrirlash — Frontend Qo'llanmasi

> Bu hujjat ikkita o'zgarishni tasvirlaydi: (1) yo'qlama/uy vazifasi uchun avtomatik beriladigan coin miqdorini admin oldindan sozlashi — mavjud mexanizm, endi **guruh ustuvorligi** bug'i tuzatildi; (2) qulflangan (`isLocked: true`) sessionda endi `topic`/`subjectId` kabi metama'lumotlarni tahrirlash mumkin.

---

## 1. Davomat va uy vazifasi uchun coin miqdorini oldindan belgilash

Bu funksionallik **API darajasida allaqachon mavjud** — yangi endpoint qo'shilmadi. Mexanizm `CoinRule` (`/coin-rules`) orqali ishlaydi.

### Qanday ishlaydi

`POST /sessions/:id/attendance` (yo'qlama saqlash) chaqirilganda, tizim shu tenant uchun **`triggerType: "auto"`** bo'lgan `CoinRule`larni qidiradi va 3 xil holatga mos qoidani qo'llaydi:

| Holat | `sourceType` | `direction` | Qoida topilmasa (default) |
| --- | --- | --- | --- |
| Darsda qatnashgani uchun bonus | `attendance` | `earn` | 5 coin |
| Uy vazifasini bajargani uchun bonus | `homework` | `earn` | 10 coin |
| Sababsiz kelmagani uchun jarima | `attendance` | `deduct` | **Jarima berilmaydi** (default yo'q) |

### Admin buni qanday sozlaydi

```
POST /coin-rules
{
  "name": "Davomat uchun bonus",
  "coinAmount": 8,
  "direction": "earn",
  "triggerType": "auto",
  "sourceType": "attendance"
}
```

- `coinAmount` — istalgan son, admin xohlagancha.
- `direction: "earn"` yoki `"deduct"`.
- `triggerType` **albatta `"auto"`** bo'lishi kerak — aks holda (`"manual"`) bu qoida avtomatik yo'qlama jarayonida ishlatilmaydi (`manual` qoidalar faqat `POST /coin-transactions/apply-rule` orqali qo'lda biriktiriladi).
- `sourceType` — `"attendance"` yoki `"homework"`.
- `groupId` — **ixtiyoriy**. Quyida tushuntirilgan.

Xuddi shunday uy vazifasi (`sourceType: "homework"`) va jarima (`sourceType: "attendance"`, `direction: "deduct"`) uchun ham alohida qoida yaratiladi. Mavjud qoidalarni `PATCH /coin-rules/:id` orqali tahrirlash, `DELETE /coin-rules/:id` orqali o'chirish mumkin (bular allaqachon ishlaydi, sizning UI'ingiz shu bilan ishlayapti).

### 🐛 Tuzatilgan bug: guruh ustuvorligi

**Muammo edi:** agar bir xil `sourceType`+`direction` uchun bir nechta `auto` qoida mavjud bo'lsa (masalan bitta tenant-wide umumiy qoida + bitta ma'lum guruhga maxsus qoida), tizim ularning **birinchisini** (tasodifiy tartibda) tanlardi — `groupId` ustuvorligi umuman hisobga olinmasdi.

**Hozir tuzatildi:** qoida tanlash tartibi:
1. Avval **shu sessiyaning guruhiga** (`CoinRule.groupId === session.groupId`) mos qoida qidiriladi.
2. Topilmasa, **tenant-wide umumiy** qoida (`CoinRule.groupId: null`) ishlatiladi.
3. U ham bo'lmasa, hardcoded default (5 / 10 / jarima yo'q).

**Frontend uchun amaliy ma'no:** `CoinRule` yaratish/tahrirlash formasida `groupId` maydonini **ixtiyoriy** qilib qoldiring (allaqachon shunday bo'lsa kerak). Endi admin:
- **Butun tenant uchun umumiy** qoida yaratmoqchi bo'lsa — `groupId`ni bo'sh qoldiradi.
- **Faqat bitta guruh uchun maxsus** (masalan boshqacha miqdorda) qoida yaratmoqchi bo'lsa — o'sha guruhni `groupId`ga tanlaydi, va bu qoida **shu guruhdagi sessiyalar uchun umumiy qoidadan ustun** turadi — endi bu ishonchli va kutilganidek ishlaydi.

Response/request shakllarida hech qanday o'zgarish yo'q — faqat ichki tanlash logikasi to'g'irlandi, sizning mavjud UI/API integratsiyangiz o'zgarishsiz ishlayveradi, faqat endi **to'g'ri natija** bilan.

---

## 2. Qulflangan sessionda `subject`/`topic`ni tahrirlash

### Muammoning sababi

`subject` maydoni sessionga faqat 2 yo'l bilan tushadi:
1. Session yaratilganda (`POST /sessions` orqali qo'lda, yoki `POST /schedule-templates/generate-sessions` orqali shablondan avtomatik ko'chirilib).
2. `PATCH /sessions/:id` orqali keyinchalik qo'lda tahrirlanganda.

**Muhim:** `POST /sessions/:id/lock` va `POST /sessions/:id/unlock` **hech qachon `subjectId`ga tegmaydi** — kod darajasida tekshirdim, bu ikkala endpoint faqat `isLocked`/`lockedAt`/`lockedById`ni o'zgartiradi. Ya'ni **qulflash/ochish subject ma'lumotini o'zi hech qachon o'chirib yubormaydi**.

Demak, agar sessionda `subject: null` ko'rinsa — bu **session yaratilgan paytda subjectId umuman berilmagani** uchun (masalan `generate-sessions` chaqirilganda o'sha paytdagi `ScheduleTemplate`da subject hali sozlanmagan bo'lgan, yoki session eski — Subject funksiyasi qo'shilishidan oldin yaratilgan). Qulflash/ochish bu holatni o'zgartirmaydi — u faqat mavjud qiymatni saqlaydi yoki saqlamaydi, hech qachon "tozalamaydi".

### Nega tahrirlab bo'lmagan (asl sabab)

`PATCH /sessions/:id` — agar session **qulflangan** bo'lsa, **hech qanday** maydonni (jumladan `subjectId`ni ham) tahrirlashga ruxsat bermas edi:
```
403 Forbidden: "Dars qulflangan -- tahrirlash mumkin emas. Avval qulfni oching."
```
Bu — sizning ssenariyingizdagi asosiy to'siq edi: qulflangan sessionda subject yo'q, lekin uni to'g'irlashning yagona yo'li avval **butun sessionni qulfdan chiqarish** edi (garchi faqat fan nomini to'g'irlamoqchi bo'lsangiz ham).

### ✅ Endi nima o'zgardi

`PATCH /sessions/:id` endi ikki turdagi maydonni farqlaydi:

| Turi | Maydonlar | Qulflangan sessionda tahrirlanadimi? |
| --- | --- | --- |
| **Struktura** (davomat/coinga ta'sir qiladi) | `startTime`, `endTime`, `roomId`, `teacherId`, `sessionType` | ❌ Yo'q — hamon `403` qaytaradi, avval unlock kerak |
| **Metama'lumot** (faqat tavsif, coinga ta'sir qilmaydi) | `topic`, `subjectId` | ✅ **Ha — endi qulflangan bo'lsa ham to'g'ridan-to'g'ri tahrirlash mumkin** |

Ya'ni endi:
```
PATCH /sessions/:id
{ "subjectId": "subject-uuid" }
```
— session `isLocked: true` bo'lsa ham, **muvaffaqiyatli** ishlaydi (chunki `dto` faqat `subjectId` — metama'lumot — o'z ichiga oladi, struktura maydonlaridan hech biri yo'q). Agar shu bilan birga `startTime` yoki boshqa struktura maydonini ham yubormoqchi bo'lsangiz, session hamon qulflangan bo'lsa `403` qaytadi — bunday holda avval unlock qiling.

### Frontendda nima qilish kerak

1. **Session tafsiloti/tahrirlash ekranida**: `subject` (va `topic`) input/selectni endi `isLocked: true` bo'lsa ham **disable qilmang** — foydalanuvchi fan/mavzuni to'g'irlay olishi kerak.
2. **Vaqt/xona/o'qituvchi/tur** inputlarini esa hamon `isLocked: true` bo'lganda disable qiling (yoki avval "Qulfni oching" tugmasini bosishga undang) — bular hali ham bloklangan.
3. Mavjud (eski, `subject: null` bo'lgan) sessionlarni to'g'irlash uchun endi shunchaki: sessionni oching → fan tanlang → saqlang (`PATCH { subjectId }`) — **unlock qilish shart emas**.
