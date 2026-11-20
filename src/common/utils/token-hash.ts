import { createHash, randomBytes } from 'crypto';

/**
 * Yuqori entropiyali tokenlar (refresh token, parol tiklash tokeni) uchun sha256 hash.
 * bcrypt bunday tokenlar uchun mos emas: u faqat birinchi 72 baytni hisobga oladi —
 * JWT'ning boshi (header + payload boshi) bir userning barcha tokenlarida bir xil,
 * shuning uchun bcrypt eski tokenni ham "mos" deb topardi.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// URL'da xavfsiz bir martalik token (parol tiklash)
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
