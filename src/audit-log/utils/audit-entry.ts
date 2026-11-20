import { AuditActionType, Prisma } from 'src/generated/prisma/client';
import { RequestContextStore } from 'src/common/context/request-context';

// Audit yoziladigan entitet turlari (AuditLog.entityType — erkin matn, lekin shu ro'yxatdan)
export const AUDIT_ENTITY = {
  user: 'User',
  coinTransaction: 'CoinTransaction',
  // Bir so'rovda bir nechta o'quvchiga coin (bulk / qoida qo'llash) — entityId: operatsiya ID'si
  coinOperation: 'CoinOperation',
  coinRule: 'CoinRule',
  purchase: 'Purchase',
  session: 'Session',
  tenant: 'Tenant',
  smsLog: 'SmsLog',
  emailLog: 'EmailLog',
} as const;

export type AuditEntityType = (typeof AUDIT_ENTITY)[keyof typeof AUDIT_ENTITY];

export interface AuditEntry {
  // Amal qaysi tenant ma'lumotiga tegishli (super_admin uchun — maqsadli tenant)
  tenantId: string;
  // Amalni bajargan user
  actorId: string;
  action: AuditActionType;
  entityType: AuditEntityType;
  entityId: string;
  // Nima o'zgardi — maxfiy maydonlar (parol, token) bu yerga yozilmaydi
  changes?: Prisma.InputJsonValue;
  description?: string;
}

// DB ustunlari uzunligi (AuditLog: description 500, ip_address 50)
const DESCRIPTION_MAX = 500;
const IP_MAX = 50;
const USER_AGENT_MAX = 500;

const cut = (value: string | undefined, max: number) =>
  value ? value.slice(0, max) : null;

export function buildAuditData(
  entry: AuditEntry,
  ctx: RequestContextStore,
): Prisma.AuditLogUncheckedCreateInput {
  return {
    tenantId: entry.tenantId,
    createdBy: entry.actorId,
    actionType: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    changes: entry.changes,
    description: cut(entry.description, DESCRIPTION_MAX),
    ipAddress: cut(ctx.ipAddress, IP_MAX),
    userAgent: cut(ctx.userAgent, USER_AGENT_MAX),
  };
}

// `dto` dan faqat yuborilgan (undefined bo'lmagan) maydonlar — PATCH audit'i uchun
export function definedFields(
  dto: object,
  omit: string[] = [],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(dto).filter(
      ([key, value]) => value !== undefined && !omit.includes(key),
    ),
  );
}
