import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, ChangePasswordDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // ─── Yaratish ───────────────────────────────────────────────
  async create(dto: CreateUserDto, tenantId: string, createdById: string) {
    // Telefon band emasligini tekshirish
    const existingPhone = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (existingPhone) {
      throw new ConflictException(
        "Bu telefon raqam allaqachon ro'yxatdan o'tgan",
      );
    }

    // Email band emasligini tekshirish (agar berilgan bo'lsa)
    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new ConflictException("Bu email allaqachon ro'yxatdan o'tgan");
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        passwordHash,
        fullName: dto.fullName,
        email: dto.email,
        avatarUrl: dto.avatarUrl,
        parentPhone: dto.parentPhone,
        tenantId,
        roleId: dto.roleId,
        createdById,
      },
      include: { role: true },
    });

    // Wallet avtomatik yaratish
    await this.prisma.wallet.create({
      data: { userId: user.id },
    });

    return this.exclude(user, ['passwordHash']);
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
      groupId,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
    } = query;
    const skip = (page - 1) * limit;

    // Teacher faqat o'z guruhidagi studentlarni ko'ra oladi
    if (requesterRole === 'teacher') {
      return this.findStudentsByTeacher(requesterId, query);
    }

    const where: any = { tenantId, isActive: true };

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    if (roleId) where.roleId = roleId;
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
          wallet: { select: { balance: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: data.map((u) => this.exclude(u, ['passwordHash'])),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // Teacher o'z guruhidagi studentlar
  private async findStudentsByTeacher(teacherId: string, query: QueryUserDto) {
    const { search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      groupMemberships: {
        some: {
          group: { teacherId },
          isActive: true,
        },
      },
      isActive: true,
    };

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
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
      data: data.map((u) => this.exclude(u, ['passwordHash'])),
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
    const where: any = { id, isActive: true };

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

    // Teacher faqat o'z guruhidagi studentni ko'ra oladi
    if (requesterRole === 'teacher') {
      const isInTeacherGroup = user.groupMemberships.some(
        (m) => m.group.teacherId === requesterId,
      );
      if (!isInTeacherGroup) {
        throw new ForbiddenException("Siz bu foydalanuvchini ko'ra olmaysiz");
      }
    }

    return this.exclude(user, ['passwordHash']);
  }

  // ─── Yangilash ───────────────────────────────────────────────
  async update(
    id: string,
    dto: UpdateUserDto,
    tenantId: string,
    requesterRole: string,
    requesterId: string,
  ) {
    await this.findOneOrFail(id, tenantId, requesterRole);

    if (dto.phone) {
      const existing = await this.prisma.user.findFirst({
        where: { phone: dto.phone, id: { not: id } },
      });
      if (existing) throw new ConflictException('Bu telefon raqam band');
    }

    if (dto.email) {
      const existing = await this.prisma.user.findFirst({
        where: { email: dto.email, id: { not: id } },
      });
      if (existing) throw new ConflictException('Bu email band');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      include: { role: true },
    });

    return this.exclude(user, ['passwordHash']);
  }

  // ─── Parol o'zgartirish ──────────────────────────────────────
  async changePassword(
    id: string,
    dto: ChangePasswordDto,
    requesterId: string,
    requesterRole: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    // O'z parolini o'zgartirsa — eski parolni tekshirish
    const isSelf = id === requesterId;
    const isAdmin = ['admin', 'super_admin'].includes(requesterRole);

    if (isSelf && dto.oldPassword) {
      const valid = await bcrypt.compare(dto.oldPassword, user.passwordHash);
      if (!valid) throw new ForbiddenException("Eski parol noto'g'ri");
    } else if (!isAdmin) {
      throw new ForbiddenException("Ruxsat yo'q");
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    return { message: "Parol muvaffaqiyatli o'zgartirildi" };
  }

  // ─── O'chirish (soft delete) ─────────────────────────────────
  async remove(
    id: string,
    tenantId: string,
    archiverId: string,
    requesterRole: string,
  ) {
    const user = await this.findOneOrFail(id, tenantId, requesterRole);

    // super_admin ni hech kim o'chira olmaydi
    if (user.role.name === 'super_admin') {
      throw new ForbiddenException("Super adminni arxivlab bo'lmaydi");
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        archivedAt: new Date(),
        archivedById: archiverId,
      },
    });

    return { message: 'Foydalanuvchi arxivlandi' };
  }

  // Faqat o'z profili — barcha rollar uchun
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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
    return this.exclude(user, [
      'passwordHash',
      'refreshTokenHash',
      'passwordResetToken',
      'passwordResetExpiry',
    ]);
  }

  // Arxivdan qaytarish
  async restore(id: string, tenantId: string, requesterRole: string) {
    const where: any = { id };
    if (requesterRole !== 'super_admin') where.tenantId = tenantId;

    const user = await this.prisma.user.findFirst({ where });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    await this.prisma.user.update({
      where: { id },
      data: {
        isActive: true,
        archivedAt: null,
        archivedById: null,
      },
    });

    return { message: 'Foydalanuvchi tiklandi' };
  }

  // ─── Helpers ─────────────────────────────────────────────────
  private async findOneOrFail(
    id: string,
    tenantId: string,
    requesterRole: string,
  ) {
    const where: any = { id, isActive: true };
    if (requesterRole !== 'super_admin') where.tenantId = tenantId;

    const user = await this.prisma.user.findFirst({
      where,
      include: { role: true },
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    return user;
  }

  // passwordHash ni response dan olib tashlash
  private exclude<T extends Record<string, any>>(
    user: T,
    keys: string[],
  ): Omit<T, (typeof keys)[number]> {
    return Object.fromEntries(
      Object.entries(user).filter(([k]) => !keys.includes(k)),
    ) as Omit<T, (typeof keys)[number]>;
  }
}
