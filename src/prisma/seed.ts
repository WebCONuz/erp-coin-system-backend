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

  console.log('System tenant seed qilindi');
  return systemTenant;
}

async function seedRoles(systemTenantId: string) {
  const creatorRole = await prisma.role.upsert({
    where: {
      tenantId_name: {
        tenantId: systemTenantId,
        name: 'creator',
      },
    },
    update: {},
    create: {
      name: 'creator',
      displayName: 'Creator (System)',
      level: 5,
      scope: 'system',
      canDelete: true,
      canManageAdmins: true,
      canManageUsers: true,
      isSystem: true,
      tenantId: systemTenantId,
    },
  });

  const superAdminRole = await prisma.role.upsert({
    where: {
      tenantId_name: {
        tenantId: systemTenantId,
        name: 'super_admin',
      },
    },
    update: {},
    create: {
      name: 'super_admin',
      displayName: 'Super Admin',
      level: 4,
      scope: 'system',
      canDelete: true,
      canManageAdmins: true,
      canManageUsers: true,
      isSystem: true,
      tenantId: systemTenantId,
    },
  });

  await prisma.role.createMany({
    data: [
      {
        name: 'student',
        displayName: "O'quvchi",
        level: 1,
        scope: 'system',
        isSystem: true,
        tenantId: systemTenantId,
      },
      {
        name: 'teacher',
        displayName: "O'qituvchi",
        level: 2,
        scope: 'system',
        isSystem: true,
        tenantId: systemTenantId,
      },
      {
        name: 'admin',
        displayName: 'Tenant Admin',
        level: 3,
        scope: 'system',
        isSystem: true,
        tenantId: systemTenantId,
      },
    ],
    skipDuplicates: true,
  });

  console.log('Rollar seed qilindi');
  return { creatorRole, superAdminRole };
}

async function seedCreator(systemTenantId: string, creatorRoleId: string) {
  const phone = process.env.CREATOR_PHONE;
  const password = process.env.CREATOR_PASSWORD;
  const fullName = process.env.CREATOR_NAME ?? 'Creator';
  const email = process.env.CREATOR_EMAIL ?? 'creator@system.local';

  if (!phone || !password) {
    console.warn('CREATOR_PHONE yoki CREATOR_PASSWORD .env da topilmadi.');
    return null;
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    console.log('Creator allaqachon mavjud.');
    return existing;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const creator = await prisma.user.create({
    data: {
      phone,
      email,
      passwordHash,
      fullName,
      tenantId: systemTenantId, // System tenant'da
      roleId: creatorRoleId,
    },
  });

  await prisma.wallet.create({
    data: { userId: creator.id },
  });

  console.log(`Creator yaratildi: ${phone}`);
  return creator;
}

async function seedSuperAdmin(tenantId: string, superAdminRoleId: string) {
  const phone = process.env.SUPER_ADMIN_PHONE;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const fullName = process.env.SUPER_ADMIN_NAME ?? 'Super Admin';
  const email = process.env.SMTP_USER ?? 'muxammadi0799@gmail.com';

  if (!phone || !password) {
    console.warn(
      'SUPER_ADMIN_PHONE yoki SUPER_ADMIN_PASSWORD .env da topilmadi',
    );
    return null;
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    console.log("Super admin allaqachon mavjud, o'tkazib yuborildi.");
    return existing;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const superAdmin = await prisma.user.create({
    data: {
      phone,
      email,
      passwordHash,
      fullName,
      tenantId,
      roleId: superAdminRoleId,
    },
  });

  await prisma.wallet.create({
    data: { userId: superAdmin.id },
  });

  console.log(`Super admin yaratildi: ${phone}`);
  return superAdmin;
}

async function seedRewardCategories(tenantId: string, createdById: string) {
  await prisma.rewardCategory.createMany({
    data: [
      { name: 'Digital', tenantId, createdById },
      { name: 'Imtiyoz', tenantId, createdById },
      { name: "Fizik sovg'a", tenantId, createdById },
    ],
    skipDuplicates: true,
  });

  console.log('Reward kategoriyalari seed qilindi');
}

async function main() {
  const systemTenant = await seedSystemTenant();
  const { creatorRole, superAdminRole } = await seedRoles(systemTenant.id);

  await seedCreator(systemTenant.id, creatorRole.id);
  const mainTenant = await prisma.tenant.upsert({
    where: { slug: 'main' },
    update: {},
    create: {
      name: 'Asosiy tashkilot',
      slug: 'main',
      plan: 'basic',
    },
  });

  const superAdmin = await seedSuperAdmin(mainTenant.id, superAdminRole.id);
  if (superAdmin) {
    await seedRewardCategories(mainTenant.id, superAdmin.id);
  }

  console.log('\n✅ Seed muvaffaqiyatli yakunlandi!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
