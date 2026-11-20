import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { teacherGroupAccessWhere } from '../common/utils/teacher-group-access';
import { CreateUserDto } from './dto/create-user.dto';
import {
  UpdateUserDto,
  UpdateOwnProfileDto,
  ChangePasswordDto,
} from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import * as bcrypt from 'bcrypt';
import { AuditActionType, Prisma } from 'src/generated/prisma/client';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { AUDIT_ENTITY, definedFields } from 'src/audit-log/utils/audit-entry';
import { assertCanManageUser, UserManager } from './utils/user-hierarchy';
import { BCRYPT_ROUNDS } from './constants/password';
import { releaseUnusedUpload } from 'src/common/utils/upload-cleanup';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogService,
  ) {}

  // ─── Yaratish ───────────────────────────────────────────────
  async create(dto: CreateUserDto, tenantId: string, requester: UserManager) {
    await this.assertUsernameFree(dto.username);
    await this.assertPhoneFreeInTenant(dto.phone, tenantId);
    await this.assertAssignableRole(dto.roleId, tenantId, requester);

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        phone: dto.phone,
        passwordHash,
        fullName: dto.fullName,
        email: dto.email,
        avatarUrl: dto.avatarUrl,
        parentPhone: dto.parentPhone,
        tenantId,
        roleId: dto.roleId,
        createdById: requester.id,
        // Wallet user bilan bitta atomik yozuvda yaratiladi
        wallet: { create: {} },
      },
      include: { role: true },
    });

    await this.audit.recordSafe({
      tenantId,
      actorId: requester.id,
      action: AuditActionType.create,
      entityType: AUDIT_ENTITY.user,
      entityId: user.id,
      changes: {
        username: user.username,
        fullName: user.fullName,
        role: user.role.name,
      },
    });

    return user;
  }

  // Username butun tizimda unique (login shu orqali)
  private async assertUsernameFree(username: string, excludeUserId?: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        username,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Bu username band');
    }
  }

  // Telefon faqat tenant ichida unique — boshqa tenantda shu raqamli user bo'lishi mumkin
  private async assertPhoneFreeInTenant(
    phone: string,
    tenantId: string,
    excludeUserId?: string,
  ) {
    const existing = await this.prisma.user.findFirst({
      where: {
        phone,
        tenantId,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        "Bu telefon raqam ushbu tenantda allaqachon ro'yxatdan o'tgan",
      );
    }
  }

  // Rol shu tenantga tegishli va faol bo'lishi shart — aks holda boshqa tenantning
  // (masalan system tenantdagi super_admin) roleId sini berib huquqni oshirish mumkin bo'lardi
  // Bundan tashqari rol tayinlovchining o'zidan past darajada bo'lishi shart:
  // admin faqat teacher/student beradi, admin rolini faqat super_admin (va creator) beradi
  private async assertAssignableRole(
    roleId: string,
    tenantId: string,
    requester: UserManager,
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId, isDeleted: false, isActive: true },
      select: { id: true, level: true },
    });
    if (!role) {
      throw new BadRequestException(
        'Bu tenantga tegishli bunday rol topilmadi',
      );
    }
    if (role.level >= requester.roleLevel) {
      throw new ForbiddenException(
        "Faqat o'zingizdan past darajadagi rolni tayinlay olasiz",
      );
    }
  }

  // ─── Ro'yxat ────────────────────────────────────────────────
  async findAll(
    query: QueryUserDto,
    tenantId: string,
    requesterId: string,
    requesterRole: string,
  ) {
    const {
      search,
      roleId,
      roleName,
      groupId,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
    } = query;
    const skip = (page - 1) * limit;

    // 1. Teacher faqat o'z guruhidagi studentlarni ko'ra oladi
    if (requesterRole === 'teacher') {
      return this.findStudentsByTeacher(requesterId, query);
    }

    // Base Query setting (super_admin bo'lsa barcha tenantlarni ko'rishi mumkin)
    const where: Prisma.UserWhereInput = { isActive: true, isDeleted: false };

    if (requesterRole !== 'super_admin') {
      where.tenantId = tenantId;
    } else if (query.tenantId) {
      where.tenantId = query.tenantId;
    }

    // 2. Search logic
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { username: { contains: search, mode: 'insensitive' } },
      ];
    }

    // 3. Role ID bo'yicha filtr
    if (roleId) {
      where.roleId = roleId;
    }

    // 4. Dinamik Role Name bo'yicha filtr (Frontend uchun eng muhim joyi)
    if (roleName) {
      where.role = {
        name: roleName,
      };
    }

    // 5. Group bo'yicha filtr
    if (groupId) {
      where.groupMemberships = {
        some: { groupId, isActive: true },
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: 'desc' },
        include: {
          role: true,
          wallet:
            roleName === 'student' ? { select: { balance: true } } : false,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Xodimlar ro'yxati (student dan boshqa barcha) ─────────────
  async findAllStaff(
    query: QueryUserDto,
    requesterRole: string,
    userTenantId: string,
  ) {
    const {
      search,
      roleId,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
    } = query;
    const skip = (page - 1) * limit;

    // creator=100, super_admin=90 — bulardan pastroqlar ko'rsatiladi
    // creator barcha → hech qanday level cap yo'q
    // super_admin → level < 100 (creator ko'rinmaydi)
    // admin → level < 90 (creator va super_admin ko'rinmaydi)
    const MAX_VISIBLE_LEVEL: Record<string, number> = {
      creator: 1000,
      super_admin: 99,
      admin: 89,
    };
    const maxLevel = MAX_VISIBLE_LEVEL[requesterRole] ?? 0;

    const roleFilter: Prisma.RoleWhereInput = { name: { not: 'student' } };
    if (maxLevel < 1000) {
      roleFilter.level = { lte: maxLevel };
    }

    const where: Prisma.UserWhereInput = { role: roleFilter, isDeleted: false };

    // Tenant scope
    const isElevated =
      requesterRole === 'creator' || requesterRole === 'super_admin';
    if (!isElevated) {
      // admin: faqat o'z tenanti
      where.tenantId = userTenantId;
    } else if (query.tenantId) {
      // elevated: ixtiyoriy filtr
      where.tenantId = query.tenantId;
    }

    // roleId filtr
    if (roleId) {
      where.roleId = roleId;
    }

    // isActive filtr (berilmasa ikkalasini ham ko'rsatadi)
    if (typeof query.isActive === 'boolean') {
      where.isActive = query.isActive;
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { username: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: 'desc' },
        select: {
          id: true,
          username: true,
          fullName: true,
          phone: true,
          email: true,
          avatarUrl: true,
          isActive: true,
          createdAt: true,
          tenantId: true,
          role: {
            select: { id: true, name: true, displayName: true, level: true },
          },
          tenant: { select: { id: true, name: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAllTeachers(
    query: QueryUserDto,
    requesterRole: string,
    userTenantId: string,
  ) {
    const { search, page = 1, limit = 20, sortBy = 'createdAt' } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      role: { name: 'teacher' },
      isDeleted: false,
    };

    // Tenant scope
    const isElevated =
      requesterRole === 'creator' || requesterRole === 'super_admin';
    if (!isElevated) {
      where.tenantId = userTenantId;
    } else if (query.tenantId) {
      where.tenantId = query.tenantId;
    }

    // isActive filtr
    if (typeof query.isActive === 'boolean') {
      where.isActive = query.isActive;
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { username: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: 'desc' },
        select: {
          id: true,
          username: true,
          phone: true,
          fullName: true,
          email: true,
          avatarUrl: true,
          isActive: true,
          createdAt: true,
          role: { select: { id: true, name: true, displayName: true } },
          taughtGroups: {
            where: { isDeleted: false, isActive: true },
            select: { id: true, name: true, maxStudents: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneTeacher(
    id: string,
    requesterRole: string,
    userTenantId: string,
  ) {
    const where: Prisma.UserWhereInput = {
      id,
      role: { name: 'teacher' },
      isDeleted: false,
    };

    const isElevated =
      requesterRole === 'creator' || requesterRole === 'super_admin';
    if (!isElevated) {
      where.tenantId = userTenantId;
    }

    const teacher = await this.prisma.user.findFirst({
      where,
      select: {
        id: true,
        username: true,
        fullName: true,
        phone: true,
        email: true,
        avatarUrl: true,
        isActive: true,
        createdAt: true,
        tenantId: true,
        role: { select: { id: true, name: true, displayName: true } },
        taughtGroups: {
          where: { isDeleted: false, isActive: true },
          select: {
            id: true,
            name: true,
            maxStudents: true,
            course: {
              select: {
                id: true,
                title: true,
                description: true,
                isActive: true,
              },
            },
            _count: {
              select: {
                students: { where: { isActive: true, isDeleted: false } },
              },
            },
          },
        },
      },
    });

    if (!teacher) throw new NotFoundException("O'qituvchi topilmadi");
    return teacher;
  }

  async findAllStudents(
    query: QueryUserDto,
    tenantId: string,
    requesterRole: string,
  ) {
    const { search, page = 1, limit = 20, sortBy = 'createdAt' } = query;
    const skip = (page - 1) * limit;

    // Base Query setting
    const where: Prisma.UserWhereInput = {
      role: {
        name: 'student',
      },
      isDeleted: false,
    };

    // Multi-tenant tekshiruvi
    if (requesterRole !== 'super_admin') {
      where.tenantId = tenantId;
    } else if (query.tenantId) {
      where.tenantId = query.tenantId;
    }

    // Search logic
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { username: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: 'desc' },
        select: {
          id: true,
          username: true,
          phone: true,
          fullName: true,
          email: true,
          avatarUrl: true,
          createdAt: true,
          updatedAt: true,
          role: { select: { id: true, name: true, displayName: true } },
          wallet: true,
          taughtGroups: false,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      status: 'success',
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // Teacher o’z guruhidagi studentlar
  private async findStudentsByTeacher(teacherId: string, query: QueryUserDto) {
    const { search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      groupMemberships: {
        some: {
          group: { isDeleted: false, ...teacherGroupAccessWhere(teacherId) },
          isActive: true,
          isDeleted: false,
        },
      },
      isActive: true,
      isDeleted: false,
    };

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { username: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { fullName: 'asc' },
        include: {
          role: true,
          wallet: { select: { balance: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Bitta user ──────────────────────────────────────────────
  async findOne(
    id: string,
    tenantId: string,
    requesterRole: string,
    requesterId: string,
  ) {
    const where: Prisma.UserWhereInput = {
      id,
      isActive: true,
      isDeleted: false,
    };

    // super_admin istalgan tenantni ko'ra oladi
    if (requesterRole !== 'super_admin') {
      where.tenantId = tenantId;
    }

    const user = await this.prisma.user.findFirst({
      where,
      include: {
        role: true,
        wallet: { select: { balance: true } },
        groupMemberships: {
          where: { isActive: true },
          include: { group: { include: { course: true } } },
        },
      },
    });

    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    // Teacher faqat o'ziga tegishli (asosiy / sessiya / jadval orqali) guruhdagi studentni ko'ra oladi
    if (requesterRole === 'teacher') {
      const isInTeacherGroup = await this.prisma.group.findFirst({
        where: {
          tenantId: user.tenantId,
          isDeleted: false,
          students: { some: { studentId: id, isDeleted: false } },
          ...teacherGroupAccessWhere(requesterId),
        },
        select: { id: true },
      });
      if (!isInTeacherGroup) {
        throw new ForbiddenException("Siz bu foydalanuvchini ko'ra olmaysiz");
      }
    }

    return user;
  }

  // ─── Yangilash ───────────────────────────────────────────────
  async update(
    id: string,
    dto: UpdateUserDto,
    tenantId: string,
    requester: UserManager,
  ) {
    const target = await this.findOneOrFail(id, tenantId, requester.role);
    // Admin boshqa adminni (yoki o'zini — buning uchun PATCH /users/me bor) tahrirlay olmaydi
    assertCanManageUser(requester, target);

    if (dto.username) {
      await this.assertUsernameFree(dto.username, id);
    }

    // super_admin uchun findOneOrFail tenant bo'yicha filtrlamaydi, shuning uchun
    // telefon va rolni query dagi tenantId emas, userning haqiqiy tenanti bo'yicha tekshiramiz
    if (dto.phone) {
      await this.assertPhoneFreeInTenant(dto.phone, target.tenantId, id);
    }

    if (dto.roleId) {
      await this.assertAssignableRole(dto.roleId, target.tenantId, requester);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      include: { role: true },
    });
    if (dto.avatarUrl !== undefined && dto.avatarUrl !== target.avatarUrl) {
      await releaseUnusedUpload(this.prisma, target.avatarUrl);
    }

    // Rol o'zgarishi alohida amal turi bilan (huquq berish — eng muhim hodisa)
    const roleChanged =
      dto.roleId !== undefined && dto.roleId !== target.roleId;
    await this.audit.recordSafe({
      tenantId: target.tenantId,
      actorId: requester.id,
      action: roleChanged ? AuditActionType.assign : AuditActionType.update,
      entityType: AUDIT_ENTITY.user,
      entityId: id,
      changes: {
        ...definedFields(dto),
        ...(roleChanged
          ? { roleFrom: target.role.name, roleTo: user.role.name }
          : {}),
      },
    });

    return user;
  }

  // ─── Parol o'zgartirish ──────────────────────────────────────
  async changePassword(
    id: string,
    dto: ChangePasswordDto,
    requester: UserManager,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id, isDeleted: false },
      include: { role: { select: { level: true } } },
      omit: { passwordHash: false }, // eski parolni tekshirish uchun kerak
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    if (id === requester.id) {
      // O'z paroli — eski parol majburiy (o'g'irlangan sessiya bilan parolni almashtirib bo'lmasin)
      if (!dto.oldPassword) {
        throw new BadRequestException('Eski parolni kiriting');
      }
      const valid = await bcrypt.compare(dto.oldPassword, user.passwordHash);
      if (!valid) throw new ForbiddenException("Eski parol noto'g'ri");
    } else {
      // Boshqa userning paroli — faqat o'z tenantidagi, o'zidan past darajadagi user
      assertCanManageUser(requester, user);
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          passwordHash,
          passwordResetToken: null,
          passwordResetExpiry: null,
        },
      }),
      // Barcha qurilmalardagi sessiyalar bekor qilinadi — qayta login talab qilinadi
      this.prisma.refreshSession.deleteMany({ where: { userId: id } }),
      this.prisma.auditLog.create({
        data: this.audit.data({
          tenantId: user.tenantId,
          actorId: requester.id,
          action: AuditActionType.update,
          entityType: AUDIT_ENTITY.user,
          entityId: id,
          changes: { field: 'password', self: id === requester.id },
          description: "Parol o'zgartirildi",
        }),
      }),
    ]);

    return { message: "Parol muvaffaqiyatli o'zgartirildi. Qayta kiring." };
  }

  // ─── O'chirish (soft delete) ─────────────────────────────────
  async remove(id: string, tenantId: string, requester: UserManager) {
    const user = await this.findOneOrFail(id, tenantId, requester.role);

    // Faqat o'zidan past darajadagi user (super_admin/creator'ni ham, boshqa adminni ham arxivlab bo'lmaydi)
    assertCanManageUser(requester, user);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          isActive: false,
          archivedAt: new Date(),
          archivedById: requester.id,
        },
      }),
      // Arxivlangan user qayta kira olmasligi uchun barcha qurilma sessiyalari ham bekor qilinadi
      this.prisma.refreshSession.deleteMany({ where: { userId: id } }),
      this.prisma.auditLog.create({
        data: this.audit.data({
          tenantId: user.tenantId,
          actorId: requester.id,
          action: AuditActionType.archive,
          entityType: AUDIT_ENTITY.user,
          entityId: id,
          changes: { username: user.username, role: user.role.name },
        }),
      }),
    ]);

    return { message: 'Foydalanuvchi arxivlandi' };
  }

  // Faqat o'z profili — barcha rollar uchun
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        tenant: { select: { id: true, name: true, slug: true, type: true } },
        wallet: { select: { balance: true } },
        groupMemberships: {
          where: { isActive: true },
          include: { group: { include: { course: true } } },
        },
        taughtGroups: {
          where: { isDeleted: false, isActive: true },
          select: {
            id: true,
            name: true,
            maxStudents: true,
            course: { select: { id: true, title: true } },
            _count: {
              select: {
                students: { where: { isActive: true, isDeleted: false } },
              },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    return user;
  }

  // ─── O'zini o'zi tahrirlash (har qanday rol, faqat xavfsiz maydonlar) ──
  async updateOwnProfile(userId: string, dto: UpdateOwnProfileDto) {
    const me = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: { id: true, tenantId: true, avatarUrl: true },
    });
    if (!me) throw new NotFoundException('Foydalanuvchi topilmadi');

    if (dto.username) {
      await this.assertUsernameFree(dto.username, userId);
    }

    // Telefon userning o'z tenanti ichida band emasligi tekshiriladi
    if (dto.phone) {
      await this.assertPhoneFreeInTenant(dto.phone, me.tenantId, userId);
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.username !== undefined ? { username: dto.username } : {}),
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.parentPhone !== undefined
          ? { parentPhone: dto.parentPhone }
          : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
      },
      include: { role: true },
    });
    if (dto.avatarUrl !== undefined && dto.avatarUrl !== me.avatarUrl) {
      await releaseUnusedUpload(this.prisma, me.avatarUrl);
    }

    return user;
  }

  // Arxivdan qaytarish
  async restore(id: string, tenantId: string, requester: UserManager) {
    // Arxivdan qaytarish — o'chirilgan (isDeleted) user bu yerda tiklanmaydi
    const where: Prisma.UserWhereInput = { id, isDeleted: false };
    if (requester.role !== 'super_admin') where.tenantId = tenantId;

    const user = await this.prisma.user.findFirst({
      where,
      include: { role: { select: { level: true } } },
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    assertCanManageUser(requester, user);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          isActive: true,
          archivedAt: null,
          archivedById: null,
        },
      }),
      this.prisma.auditLog.create({
        data: this.audit.data({
          tenantId: user.tenantId,
          actorId: requester.id,
          action: AuditActionType.restore,
          entityType: AUDIT_ENTITY.user,
          entityId: id,
          changes: { username: user.username },
        }),
      }),
    ]);

    return { message: 'Foydalanuvchi tiklandi' };
  }

  // ─── Helpers ─────────────────────────────────────────────────
  private async findOneOrFail(
    id: string,
    tenantId: string,
    requesterRole: string,
  ) {
    const where: Prisma.UserWhereInput = {
      id,
      isActive: true,
      isDeleted: false,
    };
    if (requesterRole !== 'super_admin') where.tenantId = tenantId;

    const user = await this.prisma.user.findFirst({
      where,
      include: { role: true },
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    return user;
  }
}
