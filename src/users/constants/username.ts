// Username: 3–30 belgi, faqat kichik lotin harflari, raqam, "_" va "."
// Katta-kichik harf farqlanmaydi — qiymat doim trim + kichik harfga keltirilib saqlanadi
export const USERNAME_REGEX = /^[a-z0-9_.]{3,30}$/;

export const normalizeUsername = (value: string) => value.trim().toLowerCase();
