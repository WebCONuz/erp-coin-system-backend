# Subject (Fan) — Frontend API Qo'llanmasi

> Ushbu hujjat backendga yangi qo'shilgan **`Subject` (fan)** tushunchasini va u sabab bo'lgan barcha o'zgarishlarni (sxema, API javoblari, coin izohlari) tasvirlaydi. Maqsad: dars jadvalida va sessiyalarda "aynan qaysi fan darsi" ekanligini talaba, o'qituvchi va admin uchun aniq ko'rsatish.

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie (`access_token`, `refresh_token`) — `withCredentials: true` shart
**Format:** JSON

---

## Mundarija

- [1. Nima uchun qo'shildi (kontekst)](#1-nima-uchun-qoshildi-kontekst)
- [2. Sxema (data model) o'zgarishlari](#2-sxema-data-model-ozgarishlari)
- [3. Yangi API: `Subjects` (Fanlar) CRUD](#3-yangi-api-subjects-fanlar-crud)
- [4. `ScheduleTemplate` (Dars jadvali) — subject bilan ishlash](#4-scheduletemplate-dars-jadvali--subject-bilan-ishlash)
- [5. `Session` (Dars) — subject bilan ishlash](#5-session-dars--subject-bilan-ishlash)
- [6. Coin (tanga) tranzaksiyalari — izohlarga fan nomi qo'shildi](#6-coin-tanga-tranzaksiyalari--izohlarga-fan-nomi-qoshildi)
- [7. Student va Teacher dashboard/profil javoblari](#7-student-va-teacher-dashboardprofil-javoblari)
- [8. Ikkita ishlatilish stsenariysi (maktab vs o'quv markaz)](#8-ikkita-ishlatilish-stsenariysi-maktab-vs-oquv-markaz)
- [9. Frontend uchun amaliy tavsiyalar](#9-frontend-uchun-amaliy-tavsiyalar)
- [Xato holatlari](#xato-holatlari)
- [O'zgarishlar jurnali](#ozgarishlar-jurnali)

---

## 1. Nima uchun qo'shildi (kontekst)

Ilgari sistemada `Session` (dars) faqat `Group`, `Room` va `Teacher`ga bog'langan edi — **fan (subject) haqida hech qanday ma'lumot yo'q edi**. Bu quyidagi muammoni keltirib chiqargan:

- Maktab tipidagi tashkilotlarda bitta guruh ("8-A") haftasiga bir nechta turli fan darsiga ega bo'ladi (dushanba — ona tili, matematika, ingliz tili, geografiya). Talaba "bugun bir darsni o'tkazib yuborganini" bilardi, lekin **aynan qaysi fan darsini** o'tkazib yuborganini API javobidan bilib bo'lmasdi.
- Tanga (coin) berish tranzaksiyasi izohida ham faqat `Dars ID: ...` ko'rsatilardi, fan nomi yo'q edi.

**Yechim:** yangi, **ixtiyoriy (nullable)** `Subject` modeli qo'shildi. U `Course`/`Group`ga emas, balki **`ScheduleTemplate`** (haftalik dars jadvali shabloni) va **`Session`** (aniq dars) darajasida bog'lanadi. Batafsil izoh — [8-bo'lim](#8-ikkita-ishlatilish-stsenariysi-maktab-vs-oquv-markaz).

> **Muhim:** `Course` va `Group` modellari **o'zgarmagan**. `Subject` ularning o'rnini bosmaydi — mustaqil, qo'shimcha qatlam.

---

## 2. Sxema (data model) o'zgarishlari

### Yangi model: `Subject`

```ts
Subject {
  id:           string;          // UUID
  name:         string;          // fan nomi, masalan "Matematika"
  description?: string | null;
  isActive:     boolean;         // default: true
  isDeleted:    boolean;         // default: false (soft-delete)
  archivedAt?:  string | null;   // ISO date
  archivedById?: string | null;
  createdAt:    string;          // ISO date
  updatedAt:    string;          // ISO date
  deletedAt?:   string | null;
  tenantId:     string;
  createdById:  string;
}
```

- Har bir tenant ichida fan nomi **unique** (`@@unique([tenantId, name])`) — bir xil nomli fanni ikki marta yaratib bo'lmaydi (`409 Conflict` qaytadi).

### Mavjud modellarga qo'shilgan ixtiyoriy maydon

| Model | Yangi maydon | Izoh |
| --- | --- | --- |
| `ScheduleTemplate` | `subjectId?: string \| null` + `subject?: Subject \| null` | Haftalik dars slotining fani. Berilmasa `null`. |
| `Session` | `subjectId?: string \| null` + `subject?: Subject \| null` | Aniq darsning fani. `generate-sessions` orqali shablondan avtomatik ko'chiriladi (pastga qarang), yoki qo'lda `POST /sessions`da berilishi mumkin. |

`Course`, `Group`, `GroupStudent`, `CoinRule` — **o'zgarmagan**.

---

## 3. Yangi API: `Subjects` (Fanlar) CRUD

`Course`lar (`/courses`) bilan bir xil, sodda CRUD pattern.

| Method | Route | Ruxsat |
| --- | --- | --- |
| `POST` | `/subjects` | `admin`, `super_admin` |
| `GET` | `/subjects` | `admin`, `super_admin`, `teacher` |
| `GET` | `/subjects/:id` | `admin`, `super_admin`, `teacher` |
| `PATCH` | `/subjects/:id` | `admin`, `super_admin` |
| `DELETE` | `/subjects/:id` | `admin`, `super_admin` |

> `teacher` roliga o'qish ruxsati berilgan, chunki dars jadvali (`ScheduleTemplate`) tuzishda/ko'rishda fan tanlash/ko'rish kerak bo'ladi.

### `POST /subjects`

**Body:**

```json
{
  "name": "Matematika",
  "description": "Algebra va geometriya asoslari"
}
```

- `name` — majburiy, 2–150 belgi.
- `description` — ixtiyoriy.

**201 Response:** yaratilgan `Subject` obyekti.

**Xato:** `409 Conflict` — shu nomdagi fan tenantda allaqachon mavjud.

### `GET /subjects?page=&limit=&search=&isActive=`

**200 Response:**

```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "name": "Matematika",
      "description": "Algebra va geometriya asoslari",
      "isActive": true,
      "createdAt": "2026-09-04T06:00:00.000Z",
      "updatedAt": "2026-09-04T06:00:00.000Z"
    }
  ],
  "meta": { "total": 5, "page": 1, "limit": 10, "totalPages": 1 }
}
```

- `search` — nom bo'yicha qidiruv (case-insensitive).
- `isActive` berilmasa faqat faol fanlar qaytadi.

### `GET /subjects/:id`

To'liq `Subject` obyektini qaytaradi. Topilmasa `404`.

### `PATCH /subjects/:id`

**Body** (ixtiyoriy maydonlar): `{ "name"?: string, "description"?: string }`

### `DELETE /subjects/:id`

Soft-delete (`isDeleted: true`, `isActive: false`). **200 Response:** `{ "message": "Fan muvaffaqiyatli o'chirildi", "id": "uuid" }`

> **Diqqat:** Agar bir fan o'chirilsa, unga bog'langan eski `ScheduleTemplate`/`Session` yozuvlari **o'zgarmaydi** — ular hamon shu `subjectId`ga ishora qiladi (tarixiy ma'lumot buzilmasligi uchun). Frontend fan tanlash dropdown'ida faqat `isActive: true` fanlarni ko'rsating.

---

## 4. `ScheduleTemplate` (Dars jadvali) — subject bilan ishlash

### `POST /schedule-templates`

**Body**ga yangi ixtiyoriy maydon qo'shildi:

```json
{
  "weekday": "monday",
  "startTime": "09:00",
  "endTime": "10:00",
  "groupId": "group-uuid",
  "roomId": "room-uuid",
  "teacherId": "teacher-uuid",
  "subjectId": "subject-uuid"
}
```

`subjectId` berilmasa `null` bo'lib qoladi (masalan o'quv markaz stsenariysida — [8-bo'lim](#8-ikkita-ishlatilish-stsenariysi-maktab-vs-oquv-markaz)ga qarang).

### `PATCH /schedule-templates/:id`

`subjectId` maydoni ham yangilanishi mumkin (yuborilmasa eski qiymat saqlanadi; `null` yuborilsa fan olib tashlanadi).

### Javoblarga qo'shilgan `subject`

`POST`, `GET /schedule-templates`, `GET /schedule-templates/:id`, `PATCH /schedule-templates/:id` javoblarining har birida endi:

```json
{
  "id": "uuid",
  "weekday": "monday",
  "startTime": "09:00",
  "endTime": "10:00",
  "group": { "id": "uuid", "name": "8-A" },
  "room": { "id": "uuid", "name": "301-xona" },
  "subject": { "id": "uuid", "name": "Geografiya" }
}
```

`subjectId` berilmagan bo'lsa `"subject": null`.

### `GET /schedule-templates/calendar?groupId=&year=&month=`

Kalendar javobidagi har bir kun elementida `template.subject` va `session.subject` maydonlari paydo bo'ldi:

```json
{
  "2026-09-07": [
    {
      "template": {
        "id": "uuid",
        "weekday": "monday",
        "startTime": "09:00",
        "endTime": "10:00",
        "room": { "id": "uuid", "name": "301-xona" },
        "subject": { "id": "uuid", "name": "Geografiya" }
      },
      "exception": null,
      "session": {
        "id": "uuid",
        "sessionDate": "2026-09-07T00:00:00.000Z",
        "startTime": "09:00",
        "endTime": "10:00",
        "isLocked": false,
        "sessionType": "lesson",
        "topic": null,
        "subject": { "id": "uuid", "name": "Geografiya" }
      }
    }
  ]
}
```

`GET /schedule-templates/calendar/me` (talabaning barcha guruhlari birlashtirilgan kalendari) ham xuddi shu tuzilmani meros oladi.

### `POST /schedule-templates/generate-sessions` — eng muhim joy

**Bu endpoint shablon (`ScheduleTemplate`) asosida haqiqiy `Session` yozuvlarini yaratadi.** Endi generatsiya paytida `subjectId` **shablondan sessiyaga avtomatik ko'chiriladi**:

```json
{ "groupId": "group-uuid", "fromDate": "2026-09-01", "toDate": "2026-09-30" }
```

Natijada: agar "8-A guruhi, dushanba, 09:00-10:00" shabloniga `subjectId = Geografiya` berilgan bo'lsa, shu davr uchun yaratilgan **har bir dushanbalik `Session`** o'zining `subjectId`sida "Geografiya"ni saqlaydi — **hatto keyinchalik shablon boshqa fanga o'zgartirilsa ham**, allaqachon yaratilgan sessiyalar o'z fanini yo'qotmaydi (qiymat nusxalanadi, referens emas).

Endpoint javobi o'zi o'zgarmagan (`{ message, created, skipped, cancelled }`), lekin natijada yaratilgan sessiyalarni `GET /sessions` orqali olsangiz endi `subject` bilan qaytadi.

---

## 5. `Session` (Dars) — subject bilan ishlash

### `POST /sessions` (qo'lda dars yaratish)

Odatda darslar `generate-sessions` orqali avtomatik yaratiladi, lekin qo'lda yaratishda ham fan berish mumkin:

```json
{
  "sessionDate": "2026-09-07",
  "startTime": "09:00",
  "endTime": "10:00",
  "sessionType": "lesson",
  "groupId": "group-uuid",
  "roomId": "room-uuid",
  "teacherId": "teacher-uuid",
  "subjectId": "subject-uuid"
}
```

`subjectId` ixtiyoriy — berilmasa `null`.

### `PATCH /sessions/:id`

`subjectId` ham tahrirlanadigan maydonlar qatoriga qo'shildi.

### `GET /sessions`, `GET /sessions/:id`

Javobdagi har bir sessiyada endi:

```json
{
  "id": "uuid",
  "sessionDate": "2026-09-07T00:00:00.000Z",
  "startTime": "09:00",
  "endTime": "10:00",
  "sessionType": "lesson",
  "topic": null,
  "group": { "id": "uuid", "name": "8-A" },
  "room": { "id": "uuid", "name": "301-xona" },
  "teacher": { "id": "uuid", "fullName": "Nodira Yusupova" },
  "subject": { "id": "uuid", "name": "Geografiya" }
}
```

### `GET /sessions/me/attendance` — **talaba uchun eng muhim o'zgarish**

Bu aynan boshlang'ich muammoni hal qiladi: talaba endi "qaysi darsni o'tkazib yuborganini" **fan nomi orqali aniq** ko'radi.

```json
{
  "data": [
    {
      "id": "uuid",
      "isPresent": false,
      "homeworkDone": false,
      "recordedAt": "2026-09-07T09:05:00.000Z",
      "session": {
        "id": "uuid",
        "sessionDate": "2026-09-07T00:00:00.000Z",
        "sessionType": "lesson",
        "topic": null,
        "group": { "id": "uuid", "name": "8-A" },
        "subject": { "id": "uuid", "name": "Geografiya" }
      }
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

Frontendda: `isPresent: false` bo'lgan yozuvlarni ko'rsatishda endi `session.subject?.name` orqali "Siz **Geografiya** darsiga kelmadingiz" kabi aniq xabar chiqarish mumkin. `subject` bo'lmasa (`null` — o'quv markaz stsenariysi), avvalgidek `group.name`ga tayaning.

---

## 6. Coin (tanga) tranzaksiyalari — izohlarga fan nomi qo'shildi

`POST /sessions/:id/attendance` (yo'qlama saqlash) chaqirilganda avtomatik yaratiladigan `CoinTransaction.note` matnlariga endi fan nomi (agar mavjud bo'lsa) qo'shiladi:

| Holat | Eski izoh | Yangi izoh |
| --- | --- | --- |
| Qatnashgani uchun bonus | `Darsda qatnashgani uchun avtomatik bonus. Dars ID: ...` | `Darsda qatnashgani uchun avtomatik bonus (Geografiya). Dars ID: ...` |
| Uy vazifasi uchun bonus | `Uy vazifasini bajargani uchun bonus. Dars ID: ...` | `Uy vazifasini bajargani uchun bonus (Geografiya). Dars ID: ...` |
| Sababsiz kelmagani uchun jarima | `Darsga sababsiz kelmagani uchun jarima. Dars ID: ...` | `Darsga sababsiz kelmagani uchun jarima (Geografiya). Dars ID: ...` |

Sessiyada `subjectId` bo'lmasa (`null`), izoh **avvalgidek**, qavs qo'shilmaydi. Bu o'zgarish `GET /coin-transactions/history`, `GET /students/:id` (`coinTransactionsReceived`), `GET /teachers/me/dashboard` (`recentCoinTransactions`) javoblarida ko'rinadi — chunki bularning barchasi `note` matnini o'zgartirmasdan qaytaradi.

> Frontendda bu matnni parslashga hojat yo'q — u faqat foydalanuvchiga o'qish uchun tayyor tavsif. Agar dasturiy ravishda fan nomi kerak bo'lsa, tranzaksiyaning `sessionId`si orqali `GET /sessions/:id`ni chaqirib `subject.name`ni oling.

---

## 7. Student va Teacher dashboard/profil javoblari

Quyidagi mavjud endpointlarning javoblaridagi session ro'yxatlariga `subject: { id, name } | null` maydoni qo'shildi — **boshqa hech narsa o'zgarmagan**:

| Endpoint | Qaysi qismga qo'shildi |
| --- | --- |
| `GET /students/:id` | `attendanceAsStudent[].session.subject` |
| `GET /students/me/dashboard` | `todaySessions[].subject`, `upcomingSessions[].subject` |
| `GET /teachers/me/dashboard` | `todaySessions[].subject`, `upcomingSessions[].subject`, `pendingAttendanceSessions[].subject` |

Masalan `GET /students/me/dashboard`dagi `todaySessions` elementi endi:

```json
{
  "id": "uuid",
  "sessionDate": "2026-09-07T00:00:00.000Z",
  "startTime": "09:00",
  "endTime": "10:00",
  "sessionType": "lesson",
  "topic": null,
  "group": { "id": "uuid", "name": "8-A" },
  "room": { "id": "uuid", "name": "301-xona" },
  "subject": { "id": "uuid", "name": "Geografiya" }
}
```

---

## 8. Ikkita ishlatilish stsenariysi (maktab vs o'quv markaz)

Platforma ham maktab, ham o'quv markaz uchun ishlaydi. `Course`/`Group` ikkalasida ham **bir xil ishlaydi**, farq faqat nomlanishda; `Subject` esa faqat maktab stsenariysida kerak.

### Maktab

- `Course` = sinf: `"7-sinf"`, `"8-sinf"`
- `Group` = shu sinfdagi guruh: `"7-A"`, `"8-A"`
- `Subject` = dars jadvalida ko'rsatilgan fan: `"Ona tili"`, `"Matematika"`, `"Geografiya"` — **majburiy tarzda beriladi**, chunki bitta guruh haftasiga bir nechta fan darsiga ega.

### O'quv markaz

- `Course` = kurs nomi: `"Ingliz tili"`, `"Matematika"`
- `Group` = shu kurs doirasidagi guruh: `"Pre IELTS"`, `"English Beginner"`
- `Subject` — **ishlatilmaydi** (`subjectId` har doim `null` qoldiriladi), chunki bitta guruh allaqachon bitta fanga (kursga) tegishli — bu ma'lumot `group.course.title` orqali bilinadi.

**Frontend uchun xulosa:** `ScheduleTemplate`/`Session` yaratish formasida `subjectId` maydonini **ixtiyoriy** qilib qo'ying (masalan tenant sozlamalarida "Bu tashkilot maktabmi?" degan flag bo'lsa, shunga qarab formani ko'rsating/yashiring — hozircha bunday flag backendda yo'q, shuning uchun eng sodda yechim: fan tanlovini har doim ko'rsating, lekin majburiy qilmang). `subject: null` kelgan joylarda UI'da shunchaki fan bloki ko'rsatilmasin yoki `group.name`/`topic` bilan cheklaning.

---

## 9. Frontend uchun amaliy tavsiyalar

1. **Fan boshqaruvi (admin panel):** yangi "Fanlar" bo'limi qo'shing — `GET/POST/PATCH/DELETE /subjects` orqali oddiy CRUD jadval (nomi + tavsifi).
2. **Dars jadvali tuzish formasi** (`ScheduleTemplate` yaratish/tahrirlash): guruh va xona tanlovi yonida ixtiyoriy "Fan" dropdown (`GET /subjects?isActive=true`) qo'shing.
3. **Talaba "Davomat tarixi" sahifasi:** `GET /sessions/me/attendance` javobidagi `session.subject?.name`ni asosiy identifikator sifatida ko'rsating (masalan karta sarlavhasida): `subject` bo'lmasa `group.name`ga qayting.
4. **O'qituvchi/Admin "Bugungi darslar" ro'yxati:** `todaySessions`/`upcomingSessions` kartalarida `subject.name` badge sifatida ko'rsatilsin (masalan rangli chip: "Geografiya").
5. **Kalendar ko'rinishi** (`GET /schedule-templates/calendar`): har bir slotni fan nomi bilan rangli/belgili qilib chizish mumkin — bir xil guruhning turli fan darslarini vizual ajratish uchun qulay.
6. Fan **o'chirilgan** (`isActive: false`) bo'lsa ham eski sessiyalarda ko'rinishda davom etadi — buni "arxivlangan fan" sifatida belgilab qo'yish mumkin, lekin funksional jihatdan hech narsa buzilmaydi.

---

## Xato holatlari

| Status | Qachon |
| --- | --- |
| `401` | Token yo'q/muddati tugagan → `/auth/refresh` chaqiring |
| `403` | `admin`/`super_admin` bo'lmagan foydalanuvchi `POST/PATCH/DELETE /subjects` chaqirganda |
| `404` | `subjects/:id`, `sessions/:id` va h.k. topilmadi yoki boshqa tenantga tegishli |
| `409` | `POST /subjects` — shu nomdagi fan tenantda allaqachon mavjud |

```json
{
  "statusCode": 409,
  "message": "Bu name allaqachon mavjud",
  "error": "Conflict"
}
```

---

## O'zgarishlar jurnali

**Yangi endpointlar:**

- `POST /subjects`, `GET /subjects`, `GET /subjects/:id`, `PATCH /subjects/:id`, `DELETE /subjects/:id`

**Kengaytirilgan (yangi ixtiyoriy `subjectId` request maydoni):**

- `POST /schedule-templates`, `PATCH /schedule-templates/:id`
- `POST /sessions`, `PATCH /sessions/:id`

**Kengaytirilgan (javobga yangi `subject` maydoni qo'shildi, hech narsa olib tashlanmadi):**

- `GET /schedule-templates`, `GET /schedule-templates/:id`, `GET /schedule-templates/calendar`, `GET /schedule-templates/calendar/me`
- `GET /sessions`, `GET /sessions/:id`, `GET /sessions/me/attendance`
- `GET /students/:id`, `GET /students/me/dashboard`
- `GET /teachers/me/dashboard`

**Ichki logika o'zgarishi (javob tuzilmasi bir xil, faqat matn/qiymat boyidi):**

- `POST /schedule-templates/generate-sessions` — endi shablondagi `subjectId`ni yaratilgan har bir `Session`ga nusxalaydi.
- `POST /sessions/:id/attendance` — avtomatik yaratilgan `CoinTransaction.note` matniga fan nomi (mavjud bo'lsa) qavs ichida qo'shiladi.

**Sxema:**

- Yangi `Subject` jadvali.
- `ScheduleTemplate.subjectId`, `Session.subjectId` — ikkalasi ham **ixtiyoriy (nullable)**, orqaga qarab mos (backward-compatible): eski yozuvlar `subjectId: null` bilan ishlashda davom etadi, hech qanday breaking change yo'q.
