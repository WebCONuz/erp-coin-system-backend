# Frontend Savollariga Aniqliklar — API Qo'llanmasi

> [security-stability-update-api.md](security-stability-update-api.md) bo'yicha frontend integratsiyasida chiqqan 6 ta savolga backend kodi asosida javoblar. Tekshiruv paytida backend'da **3 ta xato** topildi va tuzatildi — ular ham shu yerda.

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie (`access_token`, `refresh_token`) — `withCredentials: true` shart
**Format:** JSON

---

## Mundarija

- [Qisqacha javoblar](#qisqacha-javoblar)
- [1. Admin coin tarixi — `studentId` filtri](#1-admin-coin-tarixi--studentid-filtri)
- [2. Teacher: o'quvchi sahifasidagi tarix va teskari yozuvlar](#2-teacher-oquvchi-sahifasidagi-tarix-va-teskari-yozuvlar)
- [3. Istisno vaqtini tozalash (`PATCH /schedule-exceptions/:id`)](#3-istisno-vaqtini-tozalash-patch-schedule-exceptionsid)
- [4. `generate-sessions` — 92 kun](#4-generate-sessions--92-kun)
- [5. Kalendarda dam olish kuni](#5-kalendarda-dam-olish-kuni)
- [6. Parol modallarida `oldPassword`](#6-parol-modallarida-oldpassword)
- [7. `?tenantId=` bilan `GET /holidays` va boshqa ro'yxatlar (super_admin)](#7-tenantid-bilan-get-holidays-va-boshqa-royxatlar-super_admin)
- [Backend tuzatishlari (shu tekshiruvda)](#backend-tuzatishlari-shu-tekshiruvda)
- [O'zgarishlar jurnali](#ozgarishlar-jurnali)

---

## Qisqacha javoblar

| # | Savol | Javob | Frontend |
| --- | --- | --- | --- |
| 1 | `GET /coin-transactions/history` `studentId` ni qabul qiladimi? | **Ha** | O'zgartirish shart emas |
| 2 | `/students/:id` tarixida teskari yozuv belgilari bormi? | **Avval yo'q edi — endi bor** (backend tuzatildi) | Mavjud yondashuv to'g'ri, endi belgilar chiqadi |
| 3 | Istisnoda `startTime: null, endTime: null` vaqtni tozalaydimi? | **Avval tozalamasdi — endi tozalaydi** (backend tuzatildi) | Yondashuv to'g'ri |
| 4 | 92 kunni ikkala chekka bilan hisoblash | **Aynan to'g'ri** — backend ham shunday hisoblaydi | O'zgartirish shart emas |
| 5 | Kunda `holiday` bo'lsa darslarni yashirish | **Deyarli to'g'ri** — `session` bor elementlarni yashirmang | Kichik tuzatish |
| 6 | Boshqa user parolidagi `oldPassword` maydoni | **Olib tashlang** — faqat o'z parolida kerak | Olib tashlash |

---

## 1. Admin coin tarixi — `studentId` filtri

`GET /coin-transactions/history?studentId=<uuid>` — **ishlaydi**.

**Kim:** `admin`, `super_admin` (`?tenantId=` bilan), `teacher` (cheklov bilan — [2-bo'lim](#2-teacher-oquvchi-sahifasidagi-tarix-va-teskari-yozuvlar)).

| Query | Tip | Izoh |
| --- | --- | --- |
| `studentId` | uuid | Bitta o'quvchining tranzaksiyalari |
| `teacherId` | uuid | Kim bergan bo'yicha (teacher uchun e'tiborsiz — doim o'zi) |
| `direction` | `earn` \| `deduct` | |
| `sourceType` | `SourceType` | |
| `page`, `limit` | number | Standart `1`, `10` |

**Response** — format `{ data, meta }` emas, quyidagicha:

```json
{
  "data": [
    {
      "id": "uuid",
      "amount": 5,
      "direction": "earn",
      "sourceType": "attendance",
      "note": "Darsda qatnashgani uchun avtomatik bonus (Matematika)",
      "createdAt": "2026-11-18T09:00:00.000Z",
      "reversalOfId": null,
      "reversal": { "id": "uuid", "createdAt": "2026-11-18T10:05:00.000Z" },
      "purchaseId": null,
      "student": { "fullName": "Aliyev Vali", "phone": "+998901234567" },
      "teacher": { "fullName": "Karimov Anvar" },
      "rule": { "name": "Davomat" }
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 10,
  "totalPages": 5
}
```

Tarixda teskari yozuvlar ham bor (`reversalOfId` / `reversal`) — UI bo'yicha [asosiy hujjat 2.4](security-stability-update-api.md#24--bekor-qilish-endi-teskari-yozuv-bilan-alohida-elon).

---

## 2. Teacher: o'quvchi sahifasidagi tarix va teskari yozuvlar

**Teacher `GET /coin-transactions/history` ga kira oladi**, lekin faqat **o'zi bergan** tranzaksiyalarni ko'radi (backend `teacherId` ni majburan teacherning o'ziga qo'yadi; `studentId` filtri u bilan birga ishlaydi). O'quvchining to'liq tarixi uchun bu mos emas.

Shuning uchun teacher o'quvchi sahifasida `GET /students/:id` dan foydalanish — **to'g'ri yondashuv**. U o'quvchining (kim berganidan qat'i nazar) **oxirgi 20 ta** tranzaksiyasini `coinTransactionsReceived` da qaytaradi.

**Tuzatildi:** avval `coinTransactionsReceived` da `reversalOfId` va `reversal` maydonlari **yo'q edi** — teskari yozuv belgilari chiqmasdi. Endi bor:

```json
{
  "coinTransactionsReceived": [
    {
      "id": "b2c...",
      "amount": 5,
      "direction": "deduct",
      "sourceType": "attendance",
      "note": "Tekshiruv qayta saqlandi — avvalgi yozuv bekor qilindi",
      "createdAt": "2026-11-18T10:05:00.000Z",
      "reversalOfId": "a1f...",
      "reversal": null,
      "teacher": { "id": "uuid", "fullName": "Karimov Anvar" }
    }
  ]
}
```

Xuddi shu ikki maydon quyidagi ro'yxatlarga ham qo'shildi (ular ham avval yo'q edi):

| Endpoint | Maydon |
| --- | --- |
| `GET /students/:id` | `coinTransactionsReceived[]` |
| `GET /students/me/dashboard` | oxirgi tranzaksiyalar ro'yxati |
| `GET /teachers/me/dashboard` | oxirgi tranzaksiyalar ro'yxati |
| `GET /dashboard/admin` | oxirgi faoliyat (tranzaksiyalar) ro'yxati |

> Teacher o'zi bergan coinni admin bekor qilsa: `/history` da teacherning asl yozuvi `reversal` bilan ko'rinadi, lekin teskari yozuvning o'zi ko'rinmaydi (uni admin yaratgan). `/students/:id` da ikkalasi ham ko'rinadi.

---

## 3. Istisno vaqtini tozalash (`PATCH /schedule-exceptions/:id`)

**Tuzatildi.** Avval `startTime: null, endTime: null` yuborilsa backend **eski vaqtni saqlab qolardi** — vaqtni tozalab bo'lmasdi. Yana ikki muammo bor edi (pastda). Endi PATCH **qisman yangilash** sifatida ishlaydi:

| Maydon | Yuborilmasa | `null` | Qiymat |
| --- | --- | --- | --- |
| `startTime`, `endTime` | o'zgarmaydi | tozalanadi — shablon vaqti ishlaydi (**ikkalasi birga**) | yangi vaqt (`HH:MM`, ikkalasi birga) |
| `roomId` | o'zgarmaydi | shablondagi xona | boshqa xona |
| `teacherId` | o'zgarmaydi | shablondagi o'qituvchi | o'rinbosar |
| `isCancelled` | o'zgarmaydi | — | `true` bo'lsa vaqt/xona/o'qituvchi tozalanadi |
| `note` | o'zgarmaydi | — | yangi izoh |
| `exceptionDate` | — | — | **e'tiborsiz qoldiriladi** (sanani o'zgartirib bo'lmaydi — istisnoni o'chirib, yangi sanaga qo'shing) |

**Misol — vaqt o'zgarishini bekor qilish, o'rinbosarni qoldirish:**

```json
{ "startTime": null, "endTime": null }
```

**Qoida (avvalgidek):** bekor qilinmagan istisno kamida bittasini o'zgartirishi kerak — vaqt, xona yoki o'qituvchi. Hammasi tozalansa — `400` `"Bekor qilinmagan istisnoda yangi vaqt, xona yoki o'qituvchi berilishi kerak"`. Bunday holatda istisnoni o'chiring (`DELETE /schedule-exceptions/:id`).

| Status | `message` |
| --- | --- |
| `400` | `"Vaqt o'zgarsa startTime va endTime birga berilishi kerak"` — faqat bittasi `null` yoki faqat bittasi berilgan |
| `400` | `"Bekor qilinmagan istisnoda yangi vaqt, xona yoki o'qituvchi berilishi kerak"` |

> Shu tuzatish bilan **ikki yashirin xato** ham yopildi: (1) PATCH'da `exceptionDate` va `isCancelled` majburiy edi — endi hamma maydon ixtiyoriy; (2) faqat izoh yoki vaqtni o'zgartiruvchi PATCH istisnodagi o'rinbosar o'qituvchi va xonani **o'chirib yuborardi**. Xuddi shu xato `PATCH /schedule-templates/:id` da ham bor edi — faqat vaqtni o'zgartirish shablonning `teacherId` va `subjectId` sini tozalab yuborardi. Tuzatildi ([pastda](#backend-tuzatishlari-shu-tekshiruvda)).

---

## 4. `generate-sessions` — 92 kun

Backend oraliqni **ikkala chekkasi bilan** hisoblaydi: `toDate − fromDate + 1 ≤ 92`. Frontend hisobi **aynan bir xil** — "xavfsiz tomoni" emas, to'g'ri.

| `fromDate` | `toDate` | Kunlar | Natija |
| --- | --- | --- | --- |
| `2026-01-01` | `2026-04-02` | 92 | ✅ |
| `2026-01-01` | `2026-04-03` | 93 | ❌ `400` |

---

## 5. Kalendarda dam olish kuni

`holiday` **kun bo'yicha** beriladi: shu sanadagi **barcha** elementlarda bir xil `{ id, name }` (yoki hammasida `null`).

Darslarni yashirish to'g'ri, **bitta istisno bilan**: elementda `session` bo'lsa, uni yashirmang.

| Element | Ko'rsatish |
| --- | --- |
| `holiday` bor, `session: null` | Yashirish — dars bo'lmaydi |
| `holiday` bor, `session` bor | **Ko'rsatish** (masalan "Dam olish kuni — o'tkazilgan dars" belgisi bilan) |

Nega dam olish kunida `session` qolishi mumkin:
- dam olish kuni qo'shilishidan **oldin** shu dars tekshirilgan yoki qulflangan — backend uni o'chirmaydi (tarix);
- shu kunga **qo'lda** yaratilgan dars (qo'shimcha dars) — u ham avtomatik o'chirilmaydi.

Kun sarlavhasida `holiday.name` ni ko'rsating (masalan "🎉 Yangi yil").

---

## 6. Parol modallarida `oldPassword`

`PATCH /users/:id/change-password` da:
- **boshqa userning** parolida (`id !== currentUser.id`) `oldPassword` **tekshirilmaydi** — e'tiborsiz qoldiriladi. Admin xodimlar/teacherlar modallaridan **olib tashlang**.
- **o'z parolida** (`id === currentUser.id`) `oldPassword` **majburiy** (`400` / `403`).

> Agar admin xodimlar ro'yxatida o'zini ham ko'rsa va shu modal orqali o'z parolini o'zgartira olsa — o'sha holatda `oldPassword` maydonini ko'rsating (`target.id === currentUser.id`). Eng sodda yo'l: o'z parolini faqat profil sahifasidan o'zgartirishga ruxsat berish, ro'yxatda o'z qatorida parol tugmasini yashirish.

---

## 7. `?tenantId=` bilan `GET /holidays` va boshqa ro'yxatlar (super_admin)

**Tuzatildi.** super_admin/creator tenantga oid endpointlarga `?tenantId=` yuborishi **majburiy**, lekin quyidagi ro'yxat endpointlarining query DTO'sida `tenantId` yo'q edi — backend (`forbidNonWhitelisted`) har doim `400 "property tenantId should not exist"` qaytarardi:

| Endpoint | Kim chaqiradi | Holat |
| --- | --- | --- |
| `GET /holidays` | admin, super_admin, teacher | super_admin uchun **har doim 400** edi → tuzatildi |
| `GET /audit-logs` | admin, super_admin | super_admin uchun **har doim 400** edi (avvaldan) → tuzatildi |
| `GET /coin-transactions/my-history`, `my-stats`, `GET /sessions/me/attendance` | o'quvchi (o'z ma'lumoti) | Izchillik uchun tuzatildi (super_admin uchun amaliy ahamiyati yo'q) |

Endi barcha ro'yxat endpointlari `?tenantId=<uuid>` ni qabul qiladi — tenantga oid **barcha** `GET` so'rovlarda super_admin uchun `tenantId` ni bir xil qo'shishingiz mumkin. Admin, teacher, student uchun `tenantId` yuborish shart emas (tokendan olinadi; yuborilsa e'tiborsiz qoldiriladi).

> Backend'ga test qo'shildi: barcha controllerlardagi har bir `@Query()` DTO'si `?tenantId=` bilan tekshiriladi — yangi endpoint qo'shilganda ham bu xato qaytmaydi.

---

## Backend tuzatishlari (shu tekshiruvda)

| # | Muammo | Ta'siri | Tuzatish |
| --- | --- | --- | --- |
| 1 | `/students/:id` va dashboard'lardagi tranzaksiya ro'yxatlarida `reversalOfId`/`reversal` yo'q edi | Teskari yozuv belgilari chiqmasdi | 4 ta ro'yxatga qo'shildi ([2](#2-teacher-oquvchi-sahifasidagi-tarix-va-teskari-yozuvlar)) |
| 2 | `PATCH /schedule-exceptions/:id`: `null` vaqtni tozalamasdi; `exceptionDate`/`isCancelled` majburiy edi; yuborilmagan xona/o'rinbosar o'chib ketardi | Istisnoni to'g'ri tahrirlab bo'lmasdi | Qisman yangilash ([3](#3-istisno-vaqtini-tozalash-patch-schedule-exceptionsid)) |
| 3 | `PATCH /schedule-templates/:id`: yuborilmagan `teacherId`/`subjectId` tozalanib ketardi | Faqat vaqtni o'zgartirish shablon o'qituvchisi va fanini o'chirardi | Endi faqat yuborilgan maydon o'zgaradi; `null` — tozalash |
| 4 | `PATCH /sessions/:id` qulflangan darsda **faqat** `topic`/`subjectId` yuborilganda ham `403 SESSION_LOCKED` | Qulflangan dars mavzusini tahrirlab bo'lmasdi | Endi faqat vaqt/xona/o'qituvchi/tur/rejim/maxScore yuborilsa bloklanadi |
| 5 | `GET /holidays`, `GET /audit-logs` (va o'quvchining `my-*` endpointlari) `?tenantId=` ni rad etardi | super_admin bu sahifalarni ocha olmasdi (`400`) | Query DTO'larga `tenantId` qo'shildi ([7](#7-tenantid-bilan-get-holidays-va-boshqa-royxatlar-super_admin)) |

> 3 va 4 avvaldan (bugungi o'zgarishlardan oldin ham) bor edi. Sababi bitta: ES2022+ da DTO obyektida yuborilmagan maydonlar ham `undefined` bo'lib turadi, `'x' in dto` esa har doim `true` qaytaradi.

**Frontendga ta'siri:** 3 va 4 frontend kutgan (hujjatda yozilgan) xatti-harakatni tiklaydi — kod o'zgartirish shart emas. Agar frontend 3-xato sababli shablon PATCH'ida `teacherId`/`subjectId` ni har doim qayta yuborayotgan bo'lsa, bu ham ishlayveradi.

---

## O'zgarishlar jurnali

| Sana | O'zgarish |
| --- | --- |
| 2026-11-19 | Frontend savollariga javoblar (6 ta) |
| 2026-11-19 | `/students/:id`, o'quvchi/teacher/admin dashboard tranzaksiya ro'yxatlariga `reversalOfId`, `reversal` |
| 2026-11-19 | `PATCH /schedule-exceptions/:id` — qisman yangilash, `null` bilan tozalash, `exceptionDate` e'tiborsiz |
| 2026-11-19 | `PATCH /schedule-templates/:id` — yuborilmagan `teacherId`/`subjectId` endi tozalanmaydi |
| 2026-11-19 | `PATCH /sessions/:id` — qulflangan darsda `topic`/`subjectId` tahriri ishlaydi |
| 2026-11-19 | `GET /holidays`, `GET /audit-logs`, `my-history`, `my-stats`, `GET /sessions/me/attendance` — `?tenantId=` qabul qilinadi (super_admin) |
