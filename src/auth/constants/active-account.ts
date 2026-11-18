import { Prisma } from 'src/generated/prisma/client';

// Tizimdan foydalanishga ruxsat berilgan akkaunt: user faol va o'chirilmagan,
// tenanti ham faol va o'chirilmagan. Login, refresh va har bir so'rovdagi JWT tekshiruvida ishlatiladi.
export const ACTIVE_ACCOUNT_WHERE = {
  isActive: true,
  isDeleted: false,
  tenant: { isActive: true, isDeleted: false },
} satisfies Prisma.UserWhereInput;

// Frontend tenant to'xtatilgan holatni alohida ko'rsatishi uchun
export const AUTH_ERROR_CODES = {
  TENANT_INACTIVE: 'TENANT_INACTIVE',
} as const;
