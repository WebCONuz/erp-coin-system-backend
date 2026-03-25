import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function seedRoles() {
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'super_admin' },
    update: {},
    create: {
      name: 'super_admin',
      displayName: 'Super Admin',
      level: 4,
      canDelete: true,
      canManageAdmins: true,
      isSystem: true,
    },
  });

  await prisma.role.createMany({
    data: [
      { name: 'student', displayName: "O'quvchi", level: 1, isSystem: true },
      { name: 'teacher', displayName: "O'qituvchi", level: 2, isSystem: true },
      { name: 'admin', displayName: 'Admin', level: 3, isSystem: true },
    ],
    skipDuplicates: true,
  });

  console.log('Rollar seed qilindi');
  return superAdminRole;
}

async function seedTenant() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'main' },
    update: {},
    create: {
      name: 'Asosiy tashkilot',
      slug: 'main',
      plan: 'basic',
    },
  });

  console.log('Default tenant seed qilindi');
  return tenant;
}

async function seedSuperAdmin(tenantId: string, roleId: string) {
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
      roleId,
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
  // 1. Avval rollar (userga kerak)
  const superAdminRole = await seedRoles();

  // 2. Tenant (userga kerak)
  const tenant = await seedTenant();

  // 3. Super admin (rewardCategoryga createdBy sifatida kerak)
  const superAdmin = await seedSuperAdmin(tenant.id, superAdminRole.id);

  // 4. Eng oxirida — endi tenantId va createdById tayyor
  if (superAdmin) {
    await seedRewardCategories(tenant.id, superAdmin.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
