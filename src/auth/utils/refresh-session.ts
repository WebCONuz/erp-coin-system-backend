// Refresh token (va qurilma sessiyasi) amal qilish muddati
export const REFRESH_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Bir vaqtdagi parallel refresh (bir nechta tab bir xil cookie bilan) uchun muhlat:
// shu vaqt ichida oldingi token bilan kelgan so'rovga faqat yangi access token beriladi
export const REFRESH_GRACE_MS = 30_000;

// Bitta userning bir vaqtdagi faol qurilma sessiyalari — eng eskilari o'chiriladi
export const MAX_SESSIONS_PER_USER = 10;

/**
 * - `current` — joriy token: aylantiriladi (yangi refresh + access)
 * - `grace`   — boshqa tab hozirgina aylantirgan oldingi token: faqat yangi access token
 * - `reuse`   — eski token muhlatdan keyin qayta ishlatildi (o'g'irlangan bo'lishi mumkin): sessiya bekor
 * - `expired` — sessiya muddati tugagan
 */
export type RefreshTokenMatch = 'current' | 'grace' | 'reuse' | 'expired';

export interface RefreshSessionState {
  tokenHash: string;
  previousTokenHash: string | null;
  rotatedAt: Date | null;
  expiresAt: Date;
}

export function classifyRefreshToken(
  session: RefreshSessionState,
  presentedHash: string,
  now: Date,
): RefreshTokenMatch {
  if (session.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (presentedHash === session.tokenHash) return 'current';
  if (
    presentedHash === session.previousTokenHash &&
    session.rotatedAt !== null &&
    now.getTime() - session.rotatedAt.getTime() <= REFRESH_GRACE_MS
  ) {
    return 'grace';
  }
  return 'reuse';
}
