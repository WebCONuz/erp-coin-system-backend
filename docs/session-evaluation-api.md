# Sessiyalarni Tekshirish (Yo'qlama va Natijalar) — Frontend API Qo'llanmasi

> Sessiya turlari endi **tekshirish rejimi** (`evaluationMode`) bilan ishlaydi. Oddiy dars avvalgidek yo'qlama bilan tekshiriladi. Imtihon va musobaqada esa **har bir o'quvchiga ball va coin alohida** kiritiladi. Hujjatda yangi va o'zgargan endpointlar hamda i18n uchun xato kodlari berilgan.

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie (`access_token`, `refresh_token`) — `withCredentials: true` shart
**Format:** JSON
**Ruxsat (tekshirish):** `admin`, `teacher` (faqat o'z darsi), `super_admin`, `creator` (`?tenantId=` bilan)

---

## Mundarija

- [Umumiy mantiq](#umumiy-mantiq)
- [1. `GET /sessions/types`](#1-get-sessionstypes) — yangi
- [2. `POST /sessions`](#2-post-sessions) — o'zgardi
- [3. `PATCH /sessions/:id`](#3-patch-sessionsid) — o'zgardi
- [4. `POST /sessions/:id/attendance`](#4-post-sessionsidattendance) — o'zgardi
- [5. `POST /sessions/:id/results`](#5-post-sessionsidresults) — yangi
- [6. `GET /sessions/:id/attendance`](#6-get-sessionsidattendance) — o'zgardi
- [7. `DELETE /sessions/:id`](#7-delete-sessionsid) — o'zgardi
- [8. Boshqa javoblardagi yangi maydonlar](#8-boshqa-javoblardagi-yangi-maydonlar)
- [Xato kodlari (i18n)](#xato-kodlari-i18n)
- [Frontendda ishlatish tavsiyalari](#frontendda-ishlatish-tavsiyalari)
- [O'zgarishlar jurnali](#ozgarishlar-jurnali)

---

## Umumiy mantiq

Tekshirish ekrani qanday bo'lishini **`session.evaluationMode`** belgilaydi, `sessionType` emas:

| `evaluationMode` | Ekran | Saqlash endpointi | Coin |
| --- | --- | --- | --- |
| `attendance` | "Keldi" + "Uy vazifasi" checkboxlari | `POST /sessions/:id/attendance` | Tenant coin qoidalaridan avtomatik (davomat, uy vazifasi, jarima) |
| `scored` | "Keldi" + **Ball** + **Coin** + Izoh | `POST /sessions/:id/results` | Har bir o'quvchi uchun qo'lda kiritilgan miqdor |

Hozirgi turlar:

| `sessionType` | Default rejim | Ruxsat etilgan rejimlar | scored coin manbasi (`sourceType`) |
| --- | --- | --- | --- |
| `lesson` | `attendance` | `attendance` | — |
| `exam` | `scored` | `scored` | `exam` |
| `competition` | `scored` | `scored` | `competition` |
| `extra` | `attendance` | `attendance`, `scored` | `exam` |

> Bu jadvalni frontendda qattiq yozmang — `GET /sessions/types` dan oling. Backendga yangi tur qo'shilsa, frontend faqat uning tarjimasini qo'shadi.

**Qayta saqlash xavfsiz.** Tekshiruv qayta saqlanganda shu sessiya bo'yicha avval berilgan coinlar bekor qilinadi va yangi qiymat bilan qayta yaratiladi, shuning uchun dublikat bo'lmaydi. O'quvchi yozuvi va uning coinlari **bitta atomik tranzaksiyada** saqlanadi.

**Mavjud ma'lumotlar (migration).** Hali tekshirilmagan `exam`/`competition` sessiyalari `scored` rejimiga o'tkazildi. Allaqachon yo'qlama qilinganlari `attendance` rejimida qoladi.

---

## 1. `GET /sessions/types`

Sessiya turlari va ularning rejimlari. Sessiya yaratish formasi va tekshirish ekrani uchun kerak.

**Ruxsat:** barcha tizimga kirganlar

### Response (`200`)

```json
[
  { "type": "lesson", "defaultMode": "attendance", "allowedModes": ["attendance"], "scoredSourceType": "exam" },
  { "type": "exam", "defaultMode": "scored", "allowedModes": ["scored"], "scoredSourceType": "exam" },
  { "type": "competition", "defaultMode": "scored", "allowedModes": ["scored"], "scoredSourceType": "competition" },
  { "type": "extra", "defaultMode": "attendance", "allowedModes": ["attendance", "scored"], "scoredSourceType": "exam" }
]
```

---

## 2. `POST /sessions`

Ikkita yangi ixtiyoriy maydon qo'shildi.

```json
{
  "sessionDate": "2026-10-05",
  "startTime": "11:00",
  "endTime": "12:15",
  "sessionType": "exam",
  "evaluationMode": "scored",
  "maxScore": 100,
  "topic": "Kirish sinov imtihoni",
  "groupId": "group-uuid",
  "roomId": "room-uuid",
  "teacherId": "teacher-uuid",
  "subjectId": "subject-uuid"
}
```

| Maydon | Turi | Majburiymi | Izoh |
| --- | --- | --- | --- |
| `evaluationMode` | `"attendance" \| "scored"` | ❌ | Berilmasa turning `defaultMode` i olinadi. Turning `allowedModes` ichida bo'lishi shart, aks holda `400 INVALID_EVALUATION_MODE`. |
| `maxScore` | `int` (1–100000) | ❌ | Faqat `scored` rejimda saqlanadi (`attendance` da e'tiborsiz, `null`). Berilmasa ball yuqoridan cheklanmaydi. |

**Boshqa o'zgarishlar:**
- `groupId`, `roomId`, `teacherId`, `subjectId` shu tenantga tegishliligi tekshiriladi. Tegishli bo'lmasa `404`.
- O'chirilgan sessiya endi dublikat hisoblanmaydi: o'chirilgan sessiya o'rniga xuddi shunday yangisini yaratish mumkin.

Javobda `evaluationMode` va `maxScore` ham qaytadi.

---

## 3. `PATCH /sessions/:id`

Yangi maydonlar: `evaluationMode`, `maxScore` (`null` yuborilsa chegara olib tashlanadi).

Qoidalar:
- `sessionType` o'zgarib `evaluationMode` berilmasa: joriy rejim yangi turda ruxsat etilgan bo'lsa saqlanadi, aks holda yangi turning default rejimi olinadi.
- **Tekshirilgan** (`isChecked: true`) sessiyaning rejimini o'zgartirib bo'lmaydi: `409 SESSION_ALREADY_CHECKED`.
- Qulflangan sessiyada `evaluationMode` va `maxScore` ham bloklanadi: `403 SESSION_LOCKED`.
- `maxScore` kiritilgan eng yuqori balldan kichik bo'lsa `400 MAX_SCORE_BELOW_EXISTING` (javobda `highestScore`).

---

## 4. `POST /sessions/:id/attendance`

Faqat **`attendance`** rejimidagi sessiyalar uchun. Request body o'zgarmadi:

```json
{
  "records": [
    { "studentId": "uuid-1", "isPresent": true, "homeworkDone": true },
    { "studentId": "uuid-2", "isPresent": false, "homeworkDone": false }
  ]
}
```

**Yangi tekshiruvlar** (avval yo'q edi):

| Holat | Javob |
| --- | --- |
| Sessiya `scored` rejimida | `400 WRONG_EVALUATION_MODE` (`evaluationMode` bilan) |
| `records` bo'sh, massiv emas, 300 dan ko'p yoki elementlarda maydon noto'g'ri | `400` (class-validator) |
| Bir o'quvchi ikki marta berilgan | `400 DUPLICATE_STUDENTS` (`studentIds` bilan) |
| O'quvchi sessiya guruhida emas | `400 STUDENTS_NOT_IN_GROUP` (`studentIds` bilan). Guruhdan chiqib ketgan, lekin shu sessiyada yozuvi bor o'quvchiga ruxsat beriladi. |

**Tuzatildi:** avval kelmagan o'quvchiga jarima yozilganda uning balansi yetmasa, butun so'rov o'rtada uzilib qolardi (bir qism o'quvchi saqlanib, qolgani saqlanmasdi). Endi faqat shu jarima o'tkazib yuboriladi va `coinsSkippedFor` da `INSUFFICIENT_BALANCE_FOR_PENALTY` kodi bilan qaytadi.

### Response (`201`)

```json
{
  "success": true,
  "message": "Yoqlama muvaffaqiyatli saqlandi va tangalar hisoblandi.",
  "processedRecordsCount": 12,
  "coinsSkippedFor": [
    {
      "studentId": "uuid-3",
      "code": "COINS_ALREADY_SPENT",
      "reason": "Balans yetarli emas (joriy: 2, qaytarish uchun kerak: 15) — talaba avvalgi coinlarni allaqachon sarflab bo'lgan"
    },
    {
      "studentId": "uuid-2",
      "code": "INSUFFICIENT_BALANCE_FOR_PENALTY",
      "reason": "Jarima uchun balans yetarli emas (joriy: 0, kerak: 3)",
      "sourceType": "attendance",
      "direction": "deduct",
      "amount": 3
    }
  ]
}
```

`coinsSkippedFor[]` elementi:

| Maydon | Izoh |
| --- | --- |
| `studentId` | O'quvchi |
| `code` | i18n kaliti (quyidagi jadvalga qarang) |
| `reason` | O'zbekcha tayyor matn (zaxira sifatida) |
| `sourceType`, `direction`, `amount` | Faqat bitta element o'tkazib yuborilganda (masalan jarima) |

> `COINS_ALREADY_SPENT` bo'lsa, yo'qlama yozuvi **saqlanadi**, lekin shu o'quvchining coinlari eski holatida qoladi.

---

## 5. `POST /sessions/:id/results`

**Yangi.** Faqat **`scored`** rejimidagi sessiyalar (imtihon, musobaqa, ball bilan tekshiriladigan qo'shimcha dars) uchun. Har bir o'quvchiga ball va coin alohida beriladi.

### Request Body

```json
{
  "records": [
    { "studentId": "uuid-1", "isPresent": true, "score": 92.5, "coinAmount": 50, "note": "A'lo" },
    { "studentId": "uuid-2", "isPresent": true, "score": 61, "coinAmount": 10 },
    { "studentId": "uuid-3", "isPresent": true, "score": 30, "coinAmount": 0 },
    { "studentId": "uuid-4", "isPresent": false, "coinAmount": 0 }
  ]
}
```

| Maydon | Turi | Majburiymi | Izoh |
| --- | --- | --- | --- |
| `records` | `array` | ✅ | 1–300 ta, `studentId` takrorlanmasin |
| `records[].studentId` | `string` (UUID) | ✅ | Sessiya guruhi a'zosi |
| `records[].isPresent` | `boolean` | ✅ | Qatnashdimi |
| `records[].score` | `number \| null` | ❌ | `>= 0`, ko'pi bilan 2 kasr xonasi. `maxScore` bo'lsa undan oshmasin. |
| `records[].coinAmount` | `int` (0–10000) | ✅ | Shu o'quvchiga beriladigan coin. `0` — coin berilmaydi. |
| `records[].note` | `string` (≤500) | ❌ | O'quvchi bo'yicha izoh |

### Logika

1. Sessiya `scored` rejimida, qulflanmagan bo'lishi va teacher uchun o'z darsi bo'lishi kerak.
2. Takrorlanish, guruh a'zoligi va `maxScore` tekshiriladi. Birortasi xato bo'lsa, **hech narsa saqlanmaydi** (`400`).
3. Har bir o'quvchi uchun bitta atomik tranzaksiyada:
   - `isPresent: false` bo'lsa, `score` = `null` va coin = `0` deb olinadi (frontend yuborgan qiymat e'tiborga olinmaydi);
   - ball va izoh saqlanadi;
   - shu sessiya bo'yicha avval berilgan natija coini (`exam`/`competition`) bekor qilinadi;
   - `coinAmount > 0` bo'lsa, `earn` tranzaksiyasi yaratiladi. `sourceType` = turning `scoredSourceType` i, izoh: `"<fan yoki guruh> natijasi uchun (ball: 92.5)"`.
4. Sessiya `isChecked: true` bo'ladi.

Imtihonda jarima yo'q, coin faqat beriladi. Coinni kamaytirish uchun o'quvchining `coinAmount` ini kichikroq qilib qayta saqlang: farq avtomatik hisoblanadi.

### Response (`201`)

```json
{
  "success": true,
  "message": "Natijalar muvaffaqiyatli saqlandi va tangalar hisoblandi.",
  "processedRecordsCount": 4,
  "coinsSkippedFor": []
}
```

`coinsSkippedFor` 4-bo'limdagi bilan bir xil shaklda. Bu yerda amalda faqat `COINS_ALREADY_SPENT` chiqadi: o'quvchi avval olgan coinni sarflab bo'lgan va yangi `coinAmount` kichikroq bo'lgan holatda.

### Xato misollari

```json
{
  "statusCode": 400,
  "message": "Ball maksimal balldan (100) oshmasligi kerak",
  "code": "SCORE_EXCEEDS_MAX",
  "maxScore": 100,
  "studentIds": ["uuid-1"]
}
```

```json
{
  "statusCode": 400,
  "message": "Bu sessiya \"attendance\" rejimida tekshiriladi -- POST /sessions/:id/attendance dan foydalaning",
  "code": "WRONG_EVALUATION_MODE",
  "evaluationMode": "attendance"
}
```

---

## 6. `GET /sessions/:id/attendance`

Javob avvalgidek massiv, lekin har bir elementga yangi maydonlar qo'shildi. Tekshirish ekranini oldindan to'ldirish uchun ishlating.

```json
[
  {
    "id": "record-uuid",
    "isPresent": true,
    "homeworkDone": false,
    "score": 92.5,
    "note": "A'lo",
    "recordedAt": "2026-10-05T07:20:00.000Z",
    "updatedAt": "2026-10-05T07:20:00.000Z",
    "isDeleted": false,
    "sessionId": "session-uuid",
    "studentId": "uuid-1",
    "recordedById": "teacher-uuid",
    "student": { "id": "uuid-1", "fullName": "Rustam Abduqahhorov", "phone": "+998990123456" },
    "coinAwarded": 50
  }
]
```

| Yangi maydon | Izoh |
| --- | --- |
| `score` | Ball (`scored` rejim). `attendance` da doim `null`. |
| `note` | Izoh |
| `coinAwarded` | Shu sessiya tekshiruvi orqali o'quvchiga berilgan **sof** coin (berilgan − jarima). `scored` da `coinAmount` inputini shu qiymat bilan to'ldiring. |

---

## 7. `DELETE /sessions/:id`

**Ruxsat:** `admin`, `super_admin`, `creator`

Endi sessiya o'chirilganda **uning tekshiruvi orqali berilgan barcha coinlar qaytariladi** (davomat, uy vazifasi, jarima, imtihon/musobaqa). Avval ular o'quvchida qolib ketardi.

| Query | Turi | Izoh |
| --- | --- | --- |
| `keepCoins` | `boolean` | `true` — coinlar qaytarilmaydi, faqat sessiya o'chiriladi |

- Kimdir coinni sarflab bo'lgan bo'lsa (qaytarsa balansi manfiy bo'lib qoladi), **hech narsa o'zgarmaydi** va `409 SESSION_COINS_SPENT` qaytadi (`studentIds` bilan). Foydalanuvchiga "Coinlarni qaytarmasdan o'chirish" ni taklif qiling (`?keepCoins=true`).
- Muvaffaqiyatli javobda qo'shimcha `reversedTransactions` (qaytarilgan tranzaksiyalar soni) bor.

```json
{
  "statusCode": 409,
  "message": "Ayrim o'quvchilar bu sessiyadan olgan coinlarini sarflab bo'lgan -- coinlarni qaytarib bo'lmaydi. keepCoins=true bilan o'chirish mumkin",
  "code": "SESSION_COINS_SPENT",
  "studentIds": ["uuid-3"]
}
```

---

## 8. Boshqa javoblardagi yangi maydonlar

| Endpoint | Yangi maydonlar |
| --- | --- |
| `GET /sessions`, `GET /sessions/:id` | `evaluationMode`, `maxScore` |
| `GET /sessions?evaluationMode=scored` | Yangi filtr |
| `GET /sessions/me/attendance` (o'quvchi) | `score`, `note`; `session.evaluationMode`, `session.maxScore` — o'quvchi profilida imtihon natijasini ko'rsatish uchun |
| `GET /coin-transactions/*`, `sourceType` enumi | Yangi qiymat: `exam` |

---

## Xato kodlari (i18n)

Yangi xatolarda `message` (o'zbekcha) bilan birga **`code`** maydoni ham keladi. Tarjimani `code` bo'yicha qiling, `message` ni zaxira sifatida ko'rsating.

| `code` | Status | Qachon | Qo'shimcha maydonlar |
| --- | --- | --- | --- |
| `INVALID_EVALUATION_MODE` | 400 | Tanlangan rejim tur uchun ruxsat etilmagan | `allowedModes` |
| `WRONG_EVALUATION_MODE` | 400 | Noto'g'ri endpoint (attendance ↔ results) | `evaluationMode` |
| `SESSION_LOCKED` | 400 / 403 | Sessiya qulflangan (tekshirish, struktura tahriri, qayta qulflash) | — |
| `SESSION_NOT_LOCKED` | 400 | Qulflanmagan sessiyani ochishga urinish | — |
| `SESSION_ALREADY_CHECKED` | 409 | Tekshirilgan sessiya rejimini o'zgartirish | — |
| `DUPLICATE_STUDENTS` | 400 | `records` da takroriy o'quvchi | `studentIds` |
| `STUDENTS_NOT_IN_GROUP` | 400 | O'quvchi sessiya guruhida emas | `studentIds` |
| `SCORE_EXCEEDS_MAX` | 400 | Ball `maxScore` dan katta | `maxScore`, `studentIds` |
| `MAX_SCORE_BELOW_EXISTING` | 400 | `maxScore` kiritilgan balldan kichik | `highestScore` |
| `SESSION_COINS_SPENT` | 409 | O'chirishda coinlarni qaytarib bo'lmaydi | `studentIds` |

`coinsSkippedFor[].code`:

| `code` | Ma'nosi |
| --- | --- |
| `COINS_ALREADY_SPENT` | O'quvchi avvalgi coinni sarflagan — uning coinlari o'zgarmadi |
| `INSUFFICIENT_BALANCE_FOR_PENALTY` | Jarimaga balans yetmadi — faqat jarima yozilmadi |

Enum qiymatlari ham tarjima kaliti sifatida ishlatiladi: `sessionType.*` (`lesson`, `exam`, `competition`, `extra`), `evaluationMode.*` (`attendance`, `scored`), `sourceType.exam`.

---

## Frontendda ishlatish tavsiyalari

1. **Sessiya yaratish formasi.** Ilova yuklanganda `GET /sessions/types` ni bir marta olib keshlang. Tur tanlanganda `allowedModes.length > 1` bo'lsa (hozir `extra`), "Tekshirish usuli" select'ini ko'rsating. `scored` tanlanganda "Maksimal ball" inputini ko'rsating.
2. **Tekshirish sahifasi** `session.evaluationMode` bo'yicha ikki xil jadval ko'rsatadi:
   - `attendance`: mavjud jadval (O'quvchi | Telefon | Keldi | Uy vazifasi) → `POST .../attendance`.
   - `scored`: O'quvchi | Telefon | Keldi | Ball (`/ maxScore`) | Coin | Izoh → `POST .../results`.
     - "Keldi" o'chirilsa, Ball va Coin inputlari disable bo'lsin.
     - `maxScore` bo'lsa, ball inputiga `max` qo'ying.
     - Header'da "Hammaga coin: [N]" yordamchi input qo'yish mumkin: u faqat frontendda barcha qatorlarni to'ldiradi.
3. **Oldindan to'ldirish.** `GET .../attendance` dagi `score`, `note` va `coinAwarded` qiymatlarini inputlarga qo'ying. Yozuvi yo'q o'quvchilar uchun: `isPresent: true`, `score: null`, `coinAmount: 0`.
4. **Natijani ko'rsatish.** `coinsSkippedFor` bo'sh bo'lmasa, ogohlantirish ko'rsating: "N ta o'quvchining coini yangilanmadi" va har biri uchun `code` tarjimasi.
5. **O'chirish.** `409 SESSION_COINS_SPENT` kelsa, tasdiqlash oynasida "Coinlarni qaytarmasdan o'chirish" tugmasini chiqaring (`?keepCoins=true`).
6. **Qo'lda coin bilan aralashtirmang.** `POST /coin-transactions/manual` orqali `sessionId` va `sourceType: exam | competition | attendance | homework` bilan berilgan coin ham sessiya tekshiruvi qayta saqlanganda bekor qilinadi. Sessiyadan tashqari bonus uchun `sourceType: bonus` yoki `manual` dan foydalaning.

---

## O'zgarishlar jurnali

| Sana | O'zgarish |
| --- | --- |
| 2026-09-30 | `Session.evaluationMode` (`attendance` \| `scored`) va `Session.maxScore` qo'shildi; tur → rejim konfiguratsiyasi, `GET /sessions/types` |
| 2026-09-30 | `POST /sessions/:id/results` — o'quvchiga alohida ball + coin; `AttendanceRecord.score`, `AttendanceRecord.note`; `SourceType.exam` |
| 2026-09-30 | `GET /sessions/:id/attendance` ga `score`, `note`, `coinAwarded` qo'shildi |
| 2026-09-30 | Tuzatish: jarimaga balans yetmasa yo'qlama o'rtada uzilmaydi; yozuv va coin atomik saqlanadi; `records` validatsiyasi va guruh a'zoligi tekshiruvi qo'shildi |
| 2026-09-30 | Tuzatish: sessiya o'chirilganda uning coinlari qaytariladi (`?keepCoins=true` — qaytarilmaydi); o'chirilgan sessiya dublikat hisoblanmaydi; `groupId`/`roomId`/`teacherId`/`subjectId` tenantga tegishliligi tekshiriladi |
| 2026-09-30 | Yangi xatolarda i18n uchun `code` maydoni |
| 2026-09-30 | Biriktirilgan o'qituvchining guruhga kirish huquqi kengaytirildi — batafsil: [teacher-group-access-api.md](teacher-group-access-api.md) |
