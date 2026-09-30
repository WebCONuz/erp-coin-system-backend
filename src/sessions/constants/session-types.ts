import {
  EvaluationMode,
  SessionType,
  SourceType,
} from 'src/generated/prisma/enums';

export interface SessionTypeConfig {
  // Sessiya yaratishda evaluationMode berilmasa ishlatiladigan rejim
  defaultMode: EvaluationMode;
  // Shu tur uchun ruxsat etilgan rejimlar (bittadan ko'p bo'lsa — frontend tanlatadi)
  allowedModes: EvaluationMode[];
  // scored rejimida beriladigan coin tranzaksiyasining manbasi
  scoredSourceType: SourceType;
}

// Yangi sessiya turi qo'shish: schema.prisma dagi `SessionType` enumiga qiymat
// qo'shib migration qilinadi va shu yerga bitta qator yoziladi. Logika tur
// nomiga emas, `evaluationMode` ga qaraydi — boshqa kod o'zgarmaydi.
export const SESSION_TYPE_CONFIG: Record<SessionType, SessionTypeConfig> = {
  [SessionType.lesson]: {
    defaultMode: EvaluationMode.attendance,
    allowedModes: [EvaluationMode.attendance],
    scoredSourceType: SourceType.exam,
  },
  [SessionType.exam]: {
    defaultMode: EvaluationMode.scored,
    allowedModes: [EvaluationMode.scored],
    scoredSourceType: SourceType.exam,
  },
  [SessionType.competition]: {
    defaultMode: EvaluationMode.scored,
    allowedModes: [EvaluationMode.scored],
    scoredSourceType: SourceType.competition,
  },
  [SessionType.extra]: {
    defaultMode: EvaluationMode.attendance,
    allowedModes: [EvaluationMode.attendance, EvaluationMode.scored],
    scoredSourceType: SourceType.exam,
  },
};

// Sessiya tekshiruvi boshqaradigan (qayta saqlashda bekor qilinib, qayta
// yaratiladigan) tranzaksiya manbalari — rejim bo'yicha
export const SESSION_MANAGED_SOURCE_TYPES: Record<
  EvaluationMode,
  SourceType[]
> = {
  [EvaluationMode.attendance]: [SourceType.attendance, SourceType.homework],
  [EvaluationMode.scored]: [SourceType.exam, SourceType.competition],
};

export const ALL_SESSION_MANAGED_SOURCE_TYPES: SourceType[] = [
  SourceType.attendance,
  SourceType.homework,
  SourceType.exam,
  SourceType.competition,
];

// Frontend i18n uchun mashina o'qiydigan xato/sabab kodlari
export const SESSION_ERROR_CODES = {
  INVALID_EVALUATION_MODE: 'INVALID_EVALUATION_MODE',
  WRONG_EVALUATION_MODE: 'WRONG_EVALUATION_MODE',
  SESSION_ALREADY_CHECKED: 'SESSION_ALREADY_CHECKED',
  SESSION_LOCKED: 'SESSION_LOCKED',
  DUPLICATE_STUDENTS: 'DUPLICATE_STUDENTS',
  STUDENTS_NOT_IN_GROUP: 'STUDENTS_NOT_IN_GROUP',
  SCORE_EXCEEDS_MAX: 'SCORE_EXCEEDS_MAX',
  MAX_SCORE_BELOW_EXISTING: 'MAX_SCORE_BELOW_EXISTING',
  SESSION_COINS_SPENT: 'SESSION_COINS_SPENT',
} as const;

export const COIN_SKIP_CODES = {
  COINS_ALREADY_SPENT: 'COINS_ALREADY_SPENT',
  INSUFFICIENT_BALANCE_FOR_PENALTY: 'INSUFFICIENT_BALANCE_FOR_PENALTY',
} as const;

export type CoinSkipCode =
  (typeof COIN_SKIP_CODES)[keyof typeof COIN_SKIP_CODES];

export function resolveEvaluationMode(
  sessionType: SessionType,
  requested?: EvaluationMode,
): EvaluationMode | null {
  const config = SESSION_TYPE_CONFIG[sessionType];
  if (!requested) return config.defaultMode;
  return config.allowedModes.includes(requested) ? requested : null;
}
