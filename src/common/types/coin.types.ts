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
