export const DEFAULT_TENANT_ROLES = [
  { name: 'admin', displayName: 'Administrator', level: 60 },
  { name: 'teacher', displayName: "O'qituvchi", level: 40 },
  { name: 'student', displayName: 'Talaba', level: 20 },
] as const;

// Tizim tenantidagi rollar (seed yaratadi)
export const SYSTEM_ROLES = [
  { name: 'creator', displayName: 'Creator (System)', level: 100 },
  { name: 'super_admin', displayName: 'Super Admin', level: 90 },
] as const;

/**
 * Rol nomi → level. Level barcha tenantlarda bir xil (CLAUDE.md), shuning uchun RolesGuard
 * talab qilingan rol darajasini DB'dan emas, shu xaritadan oladi. Seed ham shu qiymatlarni yozadi.
 */
export const ROLE_LEVELS: Readonly<Record<string, number>> = Object.fromEntries(
  [...SYSTEM_ROLES, ...DEFAULT_TENANT_ROLES].map((r) => [r.name, r.level]),
);
