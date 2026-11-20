// Yangi parol siyosati (yaratish, o'zgartirish, tiklash). Login'da eski qisqa parollar ham qabul qilinadi.
export const PASSWORD_MIN_LENGTH = 8;
// bcrypt faqat birinchi 72 baytni hisobga oladi
export const PASSWORD_MAX_LENGTH = 72;

// Barcha parol hash'lari uchun yagona cost — login'dagi "dummy" hash ham shu bilan
// (aks holda javob vaqti orqali username mavjudligini bilib olish mumkin)
export const BCRYPT_ROUNDS = 12;
