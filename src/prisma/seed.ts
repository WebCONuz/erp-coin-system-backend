import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

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

async function seedCreator(systemTenantId: string, creatorRoleId: string) {
  const phone = process.env.CREATOR_PHONE;
  const password = process.env.CREATOR_PASSWORD;
  const fullName = process.env.CREATOR_NAME ?? 'Creator';
  const email = process.env.CREATOR_EMAIL ?? 'creator@system.local';

  if (!phone || !password) {
    console.warn('CREATOR_PHONE yoki CREATOR_PASSWORD .env da topilmadi');
    return null;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const creator = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: {
      phone,
      email,
      passwordHash,
      fullName,
      tenantId: systemTenantId,
      roleId: creatorRoleId,
    },
  });

  return creator;
}

async function seedSuperAdmin(
  systemTenantId: string,
  superAdminRoleId: string,
) {
  const phone = process.env.SUPER_ADMIN_PHONE;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const fullName = process.env.SUPER_ADMIN_NAME ?? 'Super Admin';
  const email = process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@system.local';

  if (!phone || !password) {
    console.warn(
      'SUPER_ADMIN_PHONE yoki SUPER_ADMIN_PASSWORD .env da topilmadi',
    );
    return null;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const superAdmin = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: {
      phone,
      email,
      passwordHash,
      fullName,
      tenantId: systemTenantId,
      roleId: superAdminRoleId,
    },
  });

  return superAdmin;
}

async function main() {
  const systemTenant = await seedSystemTenant();
  const { creatorRole, superAdminRole } = await seedRoles(systemTenant.id);

  await seedCreator(systemTenant.id, creatorRole.id);
  await seedSuperAdmin(systemTenant.id, superAdminRole.id);

  console.log('\n✅ Seed muvaffaqiyatli yakunlandi!');
}

main()
  .catch((e) => {
    console.error('Seed xatolik:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
