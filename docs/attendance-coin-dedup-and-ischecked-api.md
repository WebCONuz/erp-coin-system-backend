# Yo'qlama — Dublikat Coin Tuzatildi va `isChecked` Maydoni — Frontend Qo'llanmasi

> Ushbu hujjat `POST /sessions/:id/attendance` endpointida topilgan jiddiy bugni (bitta sessionni necha marta saqlasa, coin shuncha marta berilishi) va uni tuzatish uchun qo'shilgan `Session.isChecked` maydonini tasvirlaydi.

**Base URL:** `http://localhost:3031/api`
**Auth:** HttpOnly Cookie — `withCredentials: true` shart
**Format:** JSON

---

## Mundarija

- [1. Nima buzilgan edi](#1-nima-buzilgan-edi)
- [2. Qanday tuzatildi](#2-qanday-tuzatildi)
- [3. `POST /sessions/:id/attendance` — yangi response maydoni](#3-post-sessionsidattendance--yangi-response-maydoni)
- [4. `isChecked` — qayerlarda ko'rinadi](#4-ischecked--qayerlarda-korinadi)
- [5. Frontendda nima qilish kerak](#5-frontendda-nima-qilish-kerak)

---

## 1. Nima buzilgan edi

`POST /sessions/:id/attendance` chaqirilganda, tizim har bir `isPresent: true` / `homeworkDone: true` bo'lgan o'quvchiga **shartsiz** yangi `CoinTransaction` yaratardi. `AttendanceRecord` (davomat yozuvining o'zi) `upsert` orqali to'g'ri yangilanardi (dublikat qator hosil bo'lmasdi), lekin **coin berish bu bilan bog'liq emas edi**.

Natija: agar o'qituvchi (masalan xato tuzatish uchun, yoki tarmoq muammosi sabab qayta yuborilib) shu endpointni bitta session uchun 4 marta chaqirsa — o'quvchiga **4 marta** coin berilardi.

## 2. Qanday tuzatildi

Endi har safar `POST /sessions/:id/attendance` chaqirilganda, **har bir o'quvchi uchun**:

1. Avval o'sha session + o'quvchi bo'yicha mavjud **faol** avtomatik tranzaksiyalar (davomat bonusi, uy vazifa bonusi, jarima) qidiriladi va **bekor qilinadi** (balans qaytariladi, tranzaksiya arxivlanadi).
2. Keyin joriy (yangi yuborilgan) holatga mos yangi tranzaksiya(lar) yaratiladi.

Natijada, sessionni necha marta qayta saqlasangiz ham, har bir o'quvchida shu session bo'yicha doim **faqat bitta** faol tranzaksiya bo'ladi — miqdor har doim eng oxirgi holatga mos.

### ⚠️ Bitta maxsus holat: coin allaqachon sarflangan bo'lsa

Agar o'quvchi avvalgi coinini (masalan do'kondan biror narsa sotib olib) **allaqachon sarflab bo'lgan bo'lsa**, balans manfiy bo'lib ketmasligi uchun tizim o'sha o'quvchi uchun bekor qilish/qayta berishni **butunlay o'tkazib yuboradi** — eski tranzaksiya tegilmaydi, yangisi berilmaydi. Bu holat javobda alohida ko'rsatiladi (pastga qarang).

---

## 3. `POST /sessions/:id/attendance` — yangi response maydoni

Mavjud javob shakli **o'zgarmadi**, faqat yangi maydon qo'shildi: `coinsSkippedFor`.

```json
{
  "success": true,
  "message": "Yoqlama muvaffaqiyatli saqlandi va tangalar hisoblandi.",
  "processedRecordsCount": 15,
  "coinsSkippedFor": [
    {
      "studentId": "student-uuid",
      "reason": "Balans yetarli emas (joriy: 2, kerak: 5) — talaba avvalgi coinlarni allaqachon sarflab bo'lgan"
    }
  ]
}
```

- `coinsSkippedFor` odatda **bo'sh massiv** bo'ladi (oddiy holatda). Faqat yuqoridagi maxsus holat yuz berganda elementlar paydo bo'ladi.
- Har bir element: `{ studentId, reason }` — `reason` allaqachon o'zbek tilida, foydalanuvchiga to'g'ridan-to'g'ri ko'rsatish uchun tayyor matn.

---

## 4. `isChecked` — qayerlarda ko'rinadi

Har bir `Session` obyektiga yangi `isChecked: boolean` maydoni qo'shildi — **"bu darsda yo'qlama qilinganmi"** degan ma'noni bildiradi (`isLocked`dan farqli — `isLocked` "tahrirlab bo'lmaydimi" degani, `isChecked` "yo'qlama umuman kiritilganmi" degani).

| Endpoint | Qayerda |
| --- | --- |
| `GET /sessions` | har bir elementda `isChecked` |
| `GET /sessions/:id` | `isChecked` |
| `GET /schedule-templates/calendar` | `session.isChecked` |
| `GET /teachers/me/dashboard` | `todaySessions[].isChecked`, `upcomingSessions[].isChecked`, `pendingAttendanceSessions[].isChecked` (bu ro'yxatda doim `false`, chunki filtr shunga asoslangan) |

`POST /sessions/:id/attendance` muvaffaqiyatli yakunlangach avtomatik `true` bo'ladi va **qayta `false`ga qaytmaydi** (hozircha yo'qlamani "bekor qilish" imkoniyati yo'q, faqat qayta saqlash orqali yangilanadi).

**Eski sessionlar**: migratsiya paytida, allaqachon davomat yozuvi bo'lgan barcha eski sessionlar uchun `isChecked` bir martalik backfill bilan `true` qilib qo'yildi — hech qanday sessiya noto'g'ri "yo'qlama qilinmagan" deb ko'rinmaydi.

---

## 5. Frontendda nima qilish kerak

1. **Session ro'yxati/kartochkalarida** `isChecked` orqali badge/ikonka ko'rsating: masalan ✅ "Yo'qlama qilingan" / ⏳ "Yo'qlama kutilmoqda". Bu allaqachon `pendingAttendanceSessions` orqali qisman qilingan bo'lsa, endi har bir sessionda to'g'ridan-to'g'ri `isChecked` bilan ham tekshirish mumkin.
2. **Yo'qlama saqlash formasida** (`POST /sessions/:id/attendance` chaqirilgandan keyin): javobdagi `coinsSkippedFor`ni tekshiring. Bo'sh bo'lmasa, foydalanuvchiga ogohlantirish ko'rsating, masalan:
   > "Yo'qlama saqlandi, lekin 1 ta o'quvchi uchun coin avtomatik yangilanmadi: Ali Valiyev — Balans yetarli emas... (u avvalgi coinlarni sarflab bo'lgan). Kerak bo'lsa qo'lda coin bering."
   — va tugmani `POST /coin-transactions/manual`ga yo'naltiring (bu allaqachon mavjud endpoint).
3. **Qayta saqlashda ehtiyot bo'ling**: endi bitta sessionni istalgancha qayta saqlash **xavfsiz** (dublikat coin yo'q) — shuning uchun "Yo'qlamani tahrirlash" tugmasini "faqat bir marta bosiladigan" qilib cheklashning hojati yo'q, lekin baribir foydalanuvchi tajribasi uchun "Saqlandi" degan tasdiq ko'rsating.
