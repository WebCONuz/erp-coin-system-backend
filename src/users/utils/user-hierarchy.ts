import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DEFAULT_TENANT_ROLES } from 'src/roles/constants/default-roles';

// Boshqa userni boshqarish (parol, tahrirlash, arxivlash) uchun kamida admin darajasi kerak
const ADMIN_LEVEL = DEFAULT_TENANT_ROLES.find((r) => r.name === 'admin')!.level;

// Tenantdan tashqaridagi userlarni boshqara oladigan rollar
const CROSS_TENANT_ROLES = ['super_admin', 'creator'];

export interface UserManager {
  id: string;
  role: string;
  roleLevel: number;
  tenantId: string;
}

export interface ManagedUser {
  id: string;
  tenantId: string;
  role: { level: number };
}

/**
 * So'rov yuboruvchi `target` userni boshqara oladimi:
 * - kamida admin darajasida bo'lishi kerak;
 * - admin faqat o'z tenantidagi userni (boshqa tenant useri "topilmadi" deb ko'rinadi);
 * - faqat o'zidan **past** level'dagi userni (admin boshqa adminni, super_admin creator'ni boshqara olmaydi).
 */
export function assertCanManageUser(
  requester: UserManager,
  target: ManagedUser,
): void {
  if (requester.roleLevel < ADMIN_LEVEL) {
    throw new ForbiddenException("Ruxsat yo'q");
  }

  if (
    !CROSS_TENANT_ROLES.includes(requester.role) &&
    target.tenantId !== requester.tenantId
  ) {
    throw new NotFoundException('Foydalanuvchi topilmadi');
  }

  if (target.role.level >= requester.roleLevel) {
    throw new ForbiddenException(
      "Faqat o'zingizdan past darajadagi foydalanuvchilarni boshqara olasiz",
    );
  }
}
