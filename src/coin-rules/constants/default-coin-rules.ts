import {
  CoinDirection,
  SourceType,
  TriggerType,
} from 'src/generated/prisma/enums';

// Har bir tenant uchun backend avtomatik yaratadigan asosiy (isBuiltIn) coin qoidalari.
// SessionsService yo'qlamada qoidani nomi bo'yicha emas, triggerType + sourceType +
// direction (+ groupId: null) bo'yicha topadi — shuning uchun bu maydonlar asosiy
// qoidada o'zgartirilmaydi, tenant faqat coinAmount/name/description ni o'zgartiradi.
export const DEFAULT_TENANT_COIN_RULES = [
  {
    name: 'Davomat',
    description: 'Darsda qatnashgani uchun avtomatik beriladi',
    coinAmount: 5,
    direction: CoinDirection.earn,
    triggerType: TriggerType.auto,
    sourceType: SourceType.attendance,
  },
  {
    name: 'Uyga vazifa',
    description: 'Uy vazifasini bajargani uchun avtomatik beriladi',
    coinAmount: 10,
    direction: CoinDirection.earn,
    triggerType: TriggerType.auto,
    sourceType: SourceType.homework,
  },
] as const;

// Asosiy qoidada o'zgartirib bo'lmaydigan maydonlar
export const BUILT_IN_LOCKED_FIELDS = [
  'direction',
  'triggerType',
  'sourceType',
  'groupId',
] as const;
