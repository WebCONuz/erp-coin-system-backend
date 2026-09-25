import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { DEFAULT_TENANT_ROLES } from '../roles/constants';
import { DEFAULT_TENANT_COIN_RULES } from '../coin-rules/constants';
import { normalizeUsername, USERNAME_REGEX } from '../users/constants/username';

dotenv.config();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function seedSystemTenant() {
  const systemTenant = await prisma.tenant.upsert({
    where: { slug: 'system' },
    update: {},
    create: {
      name: 'System Tenant',
      slug: 'system',
      plan: 'enterprise',
    },
  });
  return systemTenant;
}

async function seedRoles(systemTenantId: string) {
  const creatorRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: systemTenantId, name: 'creator' } },
    update: {},
    create: {
      name: 'creator',
      displayName: 'Creator (System)',
      level: 100,
      scope: 'system',
      canDelete: true,
      canManageAdmins: true,
      canManageUsers: true,
      isSystem: true,
      tenantId: systemTenantId,
    },
  });

  const superAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: systemTenantId, name: 'super_admin' } },
    update: {},
    create: {
      name: 'super_admin',
      displayName: 'Super Admin',
      level: 90,
      scope: 'system',
      canDelete: true,
      canManageAdmins: true,
      canManageUsers: true,
      isSystem: true,
      tenantId: systemTenantId,
    },
  });

  return { creatorRole, superAdminRole };
}

// Mavjud tenantlar uchun backfill: yetishmayotgan default rollarni yaratadi va
// levelini barcha tenantlarda bir xil qiladi (RolesGuard shunga tayanadi)
async function seedTenantDefaultRoles(systemTenantId: string) {
  const tenants = await prisma.tenant.findMany({
    where: { id: { not: systemTenantId } },
    select: { id: true },
  });

  for (const tenant of tenants) {
    for (const role of DEFAULT_TENANT_ROLES) {
      await prisma.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: role.name } },
        update: { level: role.level },
        create: { ...role, tenantId: tenant.id },
      });
    }
  }
}

// Mavjud tenantlar uchun backfill: har bir asosiy coin qoidasi uchun tenantda mos
// umumiy auto qoida (groupId: null) bo'lsa — uni isBuiltIn deb belgilaydi (coin
// miqdori saqlanadi), bo'lmasa default qiymat bilan yangisini yaratadi
async function seedTenantDefaultCoinRules(
  systemTenantId: string,
  createdById: string | undefined,
) {
  if (!createdById) {
    console.warn(
      "Coin qoidalari backfill o'tkazib yuborildi: createdBy uchun super_admin/creator user topilmadi",
    );
    return;
  }

  const tenants = await prisma.tenant.findMany({
    where: { id: { not: systemTenantId } },
    select: { id: true },
  });

  for (const tenant of tenants) {
    for (const rule of DEFAULT_TENANT_COIN_RULES) {
      const existing = await prisma.coinRule.findFirst({
        where: {
          tenantId: tenant.id,
          isDeleted: false,
          triggerType: rule.triggerType,
          sourceType: rule.sourceType,
          direction: rule.direction,
          groupId: null,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (existing) {
        if (!existing.isBuiltIn) {
          await prisma.coinRule.update({
            where: { id: existing.id },
            data: { isBuiltIn: true },
          });
        }
      } else {
        await prisma.coinRule.create({
          data: { ...rule, isBuiltIn: true, tenantId: tenant.id, createdById },
        });
      }
    }
  }
}

// System tenantdagi user (creator / super_admin): yo'q bo'lsa yaratadi, bor bo'lsa
// username'ini .env dagi qiymatga keltiradi (migratsiyada username = telefon qo'yilgan edi)
async function seedSystemUser(params: {
  envPrefix: 'CREATOR' | 'SUPER_ADMIN';
  systemTenantId: string;
  roleId: string;
  defaultName: string;
  defaultEmail: string;
}) {
  const { envPrefix, systemTenantId, roleId } = params;
  const phone = process.env[`${envPrefix}_PHONE`];
  const password = process.env[`${envPrefix}_PASSWORD`];
  const rawUsername = process.env[`${envPrefix}_USERNAME`];
  const fullName = process.env[`${envPrefix}_NAME`] ?? params.defaultName;
  const email = process.env[`${envPrefix}_EMAIL`] ?? params.defaultEmail;

  if (!phone || !password || !rawUsername) {
    console.warn(
      `${envPrefix}_PHONE, ${envPrefix}_PASSWORD yoki ${envPrefix}_USERNAME .env da topilmadi`,
    );
    return null;
  }

  const username = normalizeUsername(rawUsername);
  if (!USERNAME_REGEX.test(username)) {
    console.warn(
      `${envPrefix}_USERNAME noto'g'ri formatda ("${username}"): 3–30 belgi, faqat a-z, 0-9, '_' va '.'`,
    );
    return null;
  }

  // Username boshqa userda band bo'lmasligi kerak
  const usernameOwner = await prisma.user.findUnique({
    where: { username },
    select: { id: true, phone: true, tenantId: true },
  });

  const existing = await prisma.user.findUnique({
    where: { tenantId_phone: { tenantId: systemTenantId, phone } },
  });

  if (existing) {
    if (existing.username === username) return existing;

    if (usernameOwner && usernameOwner.id !== existing.id) {
      console.warn(
        `${envPrefix}_USERNAME "${username}" boshqa userda band — username yangilanmadi`,
      );
      return existing;
    }

    return prisma.user.update({
      where: { id: existing.id },
      data: { username },
    });
  }

  if (usernameOwner) {
    console.warn(
      `${envPrefix}_USERNAME "${username}" boshqa userda band — ${envPrefix} yaratilmadi`,
    );
    return null;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  return prisma.user.create({
    data: {
      username,
      phone,
      email,
      passwordHash,
      fullName,
      tenantId: systemTenantId,
      roleId,
    },
  });
}

async function main() {
  const systemTenant = await seedSystemTenant();
  const { creatorRole, superAdminRole } = await seedRoles(systemTenant.id);

  const creator = await seedSystemUser({
    envPrefix: 'CREATOR',
    systemTenantId: systemTenant.id,
    roleId: creatorRole.id,
    defaultName: 'Creator',
    defaultEmail: 'creator@system.local',
  });
  const superAdmin = await seedSystemUser({
    envPrefix: 'SUPER_ADMIN',
    systemTenantId: systemTenant.id,
    roleId: superAdminRole.id,
    defaultName: 'Super Admin',
    defaultEmail: 'superadmin@system.local',
  });
  await seedTenantDefaultRoles(systemTenant.id);
  await seedTenantDefaultCoinRules(
    systemTenant.id,
    superAdmin?.id ?? creator?.id,
  );

  console.log('\n✅ Seed muvaffaqiyatli yakunlandi!');
}

main()
  .catch((e) => {
    console.error('Seed xatolik:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
