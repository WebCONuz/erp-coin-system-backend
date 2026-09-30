import { CoinDirection, SourceType } from 'src/generated/prisma/enums';

export interface ExecuteCoinProcessData {
  studentId: string;
  amount: number;
  direction: CoinDirection;
  sourceType: SourceType;
  note?: string | null;
  teacherId?: string | null;
  ruleId?: string | null;
  groupId?: string | null;
  sessionId?: string | null;
}

// Sessiya tekshiruvida bitta o'quvchi uchun berilishi kerak bo'lgan tranzaksiya
export type SessionCoinItem = Omit<ExecuteCoinProcessData, 'studentId'>;

export interface SkippedSessionCoinItem {
  sourceType: SourceType;
  direction: CoinDirection;
  amount: number;
  code: string;
  reason: string;
}

export interface ReplaceSessionCoinsResult {
  // true — avvalgi coinlar qaytarib bo'lmagani uchun hech narsa o'zgarmadi
  skipped: boolean;
  code?: string;
  reason?: string;
  reversed: number;
  created: number;
  // Faqat ayrim elementlar o'tkazib yuborilganda (masalan jarimaga balans yetmadi)
  skippedItems: SkippedSessionCoinItem[];
}
