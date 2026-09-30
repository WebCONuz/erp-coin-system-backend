# O'qituvchining Guruhga Kirish Huquqi (Biriktirilgan O'qituvchi) — Frontend API Qo'llanmasi

> Admin sessiyani (masalan imtihonni) yoki dars jadvali shablonini guruhning asosiy o'qituvchisidan boshqa o'qituvchiga biriktirishi mumkin. Avval bunday **biriktirilgan o'qituvchi** o'z sessiyasini ko'rardi, lekin guruh o'quvchilarini ololmasdi (`403 "Siz bu guruhni ko'ra olmaysiz"`). Natijada natija kiritish sahifasida "Guruhda o'quvchilar mavjud emas" chiqardi. Endi teacher uchun guruhga kirishning **yagona qoidasi** bor va u barcha tegishli endpointlarda bir xil ishlaydi.

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie (`access_token`, `refresh_token`) — `withCredentials: true` shart
**Format:** JSON
**Kimga tegishli:** faqat `teacher` roli. `admin`, `super_admin` va `creator` uchun hech narsa o'zgarmadi.

---

## Mundarija

- [Yangi qoida](#yangi-qoida)
- [O'zgargan endpointlar](#ozgargan-endpointlar)
- [Guruhlar](#guruhlar)
- [O'quvchilar](#oquvchilar)
- [Tanga (coin) berish](#tanga-coin-berish)
- [Dars jadvali](#dars-jadvali)
- [Teacher dashboard](#teacher-dashboard)
- [O'zgarmagan joylar](#ozgarmagan-joylar)
- [Frontendda ishlatish tavsiyalari](#frontendda-ishlatish-tavsiyalari)
- [Xato holatlari](#xato-holatlari)
- [O'zgarishlar jurnali](#ozgarishlar-jurnali)

---

## Yangi qoida

Teacher guruhga **quyidagilardan kamida bittasi** bajarilsa kira oladi:

| # | Shart | Misol |
| --- | --- | --- |
| 1 | U guruhning **asosiy o'qituvchisi** (`group.teacher`) | Guruhni yaratishda tanlangan o'qituvchi |
| 2 | Shu guruhda unga biriktirilgan **sessiya** bor (o'chirilmagan) | Admin imtihonni boshqa o'qituvchiga berdi |
| 3 | Shu guruhning **dars jadvali shablonida** u o'qituvchi (o'chirilmagan) | Jadvalda "Dushanba 09:00 — Kimyo" darsi alohida o'qituvchiga berilgan |

Sessiya yoki shablon o'chirilsa (soft delete), 2- va 3-shartlar bo'yicha huquq ham yo'qoladi. Agar teacher asosiy o'qituvchi bo'lmasa, guruh uning ro'yxatlaridan chiqib ketadi.

---

## O'zgargan endpointlar

Request va response **shakli o'zgarmadi**. Faqat teacher ko'radigan ma'lumotlar doirasi kengaydi va avvalgi ayrim `403` xatolar endi chiqmaydi.

### Guruhlar

| Endpoint | Avval (teacher) | Endi (teacher) |
| --- | --- | --- |
| `GET /groups` | Faqat asosiy o'qituvchi bo'lgan guruhlar | + sessiya/jadval orqali biriktirilgan guruhlar |
| `GET /groups/:id` | Asosiy o'qituvchi bo'lmasa `403` | Qoidaga mos bo'lsa guruh o'quvchilar ro'yxati bilan qaytadi |
| `GET /groups/me` (shaxsiy profil — "Mening guruhlarim") | Faqat asosiy o'qituvchi bo'lgan guruhlar | + biriktirilgan guruhlar |

> Aynan shu tuzatish natija kiritish sahifasidagi muammoni hal qiladi. Frontend `GET /groups/:id` ni avvalgidek chaqiradi, o'zgartirish shart emas.

### O'quvchilar

| Endpoint | Avval (teacher) | Endi (teacher) |
| --- | --- | --- |
| `GET /students` (teacher'ning o'quvchilari) | Faqat asosiy guruhlaridagi o'quvchilar | + biriktirilgan guruhlardagi o'quvchilar. `?groupId=` filtri ham ishlaydi |
| `GET /students/:id` (o'quvchi profili) | O'quvchi teacherning asosiy guruhida bo'lmasa `403` | Qoidaga mos guruhda bo'lsa ochiladi |
| `GET /users` (teacher chaqirganda o'quvchilar ro'yxati) | Faqat asosiy guruhlar | + biriktirilgan guruhlar |

Qo'shimcha: `GET /students/:id` dagi davomat tarixi (`attendanceAsStudent[]`) endi `score`, `note`, `session.evaluationMode` va `session.maxScore` ni ham qaytaradi. Profilda imtihon natijasini ko'rsatish uchun ishlating (qarang: [session-evaluation-api.md](session-evaluation-api.md)).

```json
{
  "id": "attendance-uuid",
  "isPresent": true,
  "homeworkDone": false,
  "score": 92.5,
  "note": "A'lo",
  "recordedAt": "2026-10-05T07:20:00.000Z",
  "session": {
    "id": "session-uuid",
    "sessionDate": "2026-10-05T00:00:00.000Z",
    "sessionType": "exam",
    "evaluationMode": "scored",
    "maxScore": 100,
    "topic": "Fan olimpiadasiga tayyorgarlik bo'yicha sinov imtihoni",
    "startTime": "14:30",
    "endTime": "16:30",
    "group": { "id": "group-uuid", "name": "9-B (Kimyo, Biologiya)" },
    "subject": { "id": "subject-uuid", "name": "Algebra" }
  }
}
```

### Tanga (coin) berish

| Endpoint | Avval (teacher) | Endi (teacher) |
| --- | --- | --- |
| `POST /coin-transactions/manual` | Faqat asosiy guruh o'quvchisiga, aks holda `403` | Qoidaga mos istalgan guruh o'quvchisiga |
| `POST /coin-transactions/bulk-manual` | Asosiy guruhdan tashqaridagilar `results[]` da `success: false` | Biriktirilgan guruh o'quvchilari ham `success: true` |
| `POST /coin-transactions/apply-rule` | Xuddi shunday | Xuddi shunday kengaydi |

Xato matni o'zgarmadi: `"Siz faqat o'z guruhingizdagi o'quvchiga tanga bera olasiz"`. Endi u faqat o'quvchi teacherga **hech qanday** yo'l bilan tegishli bo'lmasa chiqadi.

### Dars jadvali

| Endpoint | Avval (teacher) | Endi (teacher) |
| --- | --- | --- |
| `GET /schedule-templates` (shablonlar ro'yxati) | Faqat asosiy guruhlar jadvali | + biriktirilgan guruhlar jadvali |
| `GET /schedule-templates/:id` | Asosiy o'qituvchi bo'lmasa `403` | Qoidaga mos bo'lsa ochiladi |
| `GET /schedule-templates/:id/exceptions` | Xuddi shunday `403` | Qoidaga mos bo'lsa ochiladi |
| `GET /schedule-templates/calendar?groupId=&year=&month=` (guruh kalendari) | Xuddi shunday `403` | Qoidaga mos bo'lsa ochiladi |

> Diqqat: shablon o'qituvchisi (3-shart) ham qoidaga kiradi. Avval jadvalda darsi bor, lekin asosiy o'qituvchi bo'lmagan teacher shu jadvalni ko'ra olmasdi. Bu ham tuzatildi.

### Teacher dashboard

| Endpoint | O'zgarish |
| --- | --- |
| `GET /teachers/me/dashboard` | Guruhlar bloki endi biriktirilgan guruhlarni ham ko'rsatadi. Sessiyalar bloklari avvalgidek sessiyaga biriktirilgan o'qituvchi bo'yicha ishlaydi. |

---

## O'zgarmagan joylar

| Endpoint | Qoida |
| --- | --- |
| `POST /sessions` (teacher sessiya yaratishi) | Avvalgidek **faqat guruhning asosiy o'qituvchisi**. Biriktirilgan o'qituvchi shu guruhga yangi sessiya ocha olmaydi, bu ataylab shunday. |
| `GET/PATCH /sessions/:id`, `POST /sessions/:id/attendance`, `POST /sessions/:id/results`, `POST /sessions/:id/lock` | Avvalgidek **sessiyaga biriktirilgan o'qituvchi** (`session.teacher`). Guruhning asosiy o'qituvchisi boshqa o'qituvchiga berilgan sessiyani tekshira olmaydi. |
| `GET /sessions` (teacher) | Faqat unga biriktirilgan sessiyalar |
| `GET /coin-transactions/history` (teacher) | Faqat o'zi bergan tranzaksiyalar |

---

## Frontendda ishlatish tavsiyalari

1. **Natija kiritish / yo'qlama sahifasi.** Hech narsani o'zgartirish shart emas: `GET /groups/:id` endi biriktirilgan o'qituvchiga ham o'quvchilarni qaytaradi. Agar `403` ni "Guruhda o'quvchilar mavjud emas" deb ko'rsatayotgan bo'lsangiz, xato holatini alohida chiqaring (masalan "Bu guruhni ko'rish huquqingiz yo'q"). Bo'sh ro'yxat va ruxsat yo'qligi foydalanuvchiga turlicha ko'rinishi kerak.
2. **"Guruhlarim" sahifasi.** Ro'yxatda endi teacher asosiy o'qituvchi bo'lmagan guruhlar ham chiqadi. Farqlash uchun `group.teacher.id !== currentUser.id` bo'lsa, "Biriktirilgan" belgisini (badge) qo'yish mumkin. Bu ma'lumot javobda allaqachon bor.
3. **Sessiya yaratish tugmasi.** Biriktirilgan guruhda teacher uchun "Sessiya qo'shish" tugmasini yashiring yoki disable qiling (`group.teacher.id !== currentUser.id`). Backend baribir `403` qaytaradi.
4. **i18n.** Yangi xato kodlari qo'shilmadi, mavjud xabarlar o'zgarmadi.

---

## Xato holatlari

| Status | Qachon (teacher) |
| --- | --- |
| `403` | Teacher guruhga yangi qoidaning uchala shartidan hech biri bo'yicha tegishli emas: `"Siz bu guruhni ko'ra olmaysiz"`, `"Siz bu o'quvchini ko'ra olmaysiz"`, `"Siz bu dars jadvalini ko'ra olmaysiz"`, `"Siz bu guruhning kalendarini ko'ra olmaysiz"` |
| `403` | `POST /sessions` — teacher guruhning asosiy o'qituvchisi emas |
| `results[].success: false` | `bulk-manual` / `apply-rule` — o'quvchi teacherga tegishli emas |
| `404` | Guruh, o'quvchi yoki jadval topilmadi |

---

## O'zgarishlar jurnali

| Sana | O'zgarish |
| --- | --- |
| 2026-09-30 | Teacher'ning guruhga kirishi uchun yagona qoida: asosiy o'qituvchi **yoki** guruhda biriktirilgan sessiya **yoki** jadval shablonidagi o'qituvchi |
| 2026-09-30 | Qoida qo'llanildi: `GET /groups`, `GET /groups/:id`, `GET /groups/me`, `GET /students`, `GET /students/:id`, `GET /users`, `POST /coin-transactions/manual`, `bulk-manual`, `apply-rule`, `GET /schedule-templates*` (ro'yxat, bitta shablon, istisnolar, kalendar), `GET /teachers/me/dashboard` (guruhlar) |
| 2026-09-30 | `GET /students/:id` davomat tarixiga `score`, `note`, `session.evaluationMode`, `session.maxScore` qo'shildi |
