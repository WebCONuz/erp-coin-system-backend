import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ArchiveStudentDto } from './dto/archive-student.dto';
import { QueryStudentDto } from './dto/query-student.dto';
import { Prisma } from 'src/generated/prisma/client';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Studentlar ro'yxati (isDeleted:false default) ─────────────
  async findAll(
    query: QueryStudentDto,
    tenantId: string,
    requesterRole: string,
    requesterId: string,
  ) {
    const { search, groupId, isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    // Teacher faqat o'z guruhidagi studentlarni ko'ra oladi
    if (requesterRole === 'teacher') {
      return this.findByTeacher(requesterId, query);
    }

    const where: Prisma.UserWhereInput = {
      isDeleted: false,
      role: { name: 'student' },
    };

    if (requesterRole !== 'super_admin') {
      where.tenantId = tenantId;
    } else if (query.tenantId) {
      where.tenantId = query.tenantId;
    }

    // isActive filter: undefined → ikkalasi (faol + arxivlangan), true/false → aniq holat
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    if (groupId) {
      where.groupMemberships = { some: { groupId, isDeleted: false } };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          avatarUrl: true,
          parentPhone: true,
          isActive: true,
          isDeleted: true,
          archivedAt: true,
          createdAt: true,
          role: { select: { id: true, name: true, displayName: true } },
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

  // ─── Barcha studentlar (isDeleted:true larni ham) — faqat super_admin ──
  async findAllIncludingDeleted(query: QueryStudentDto, _tenantId: string) {
    const { search, isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      role: { name: 'student' },
    };

    if (query.tenantId) {
      where.tenantId = query.tenantId;
    }

    if (isActive !== undefined) where.isActive = isActive;

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
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          avatarUrl: true,
          parentPhone: true,
          isActive: true,
          isDeleted: true,
          archivedAt: true,
          deletedAt: true,
          createdAt: true,
          role: { select: { id: true, name: true, displayName: true } },
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

  // ─── Arxivlash / O'chirish / Tiklash ──────────────────────────
  async archiveOrDelete(
    id: string,
    dto: ArchiveStudentDto,
    tenantId: string,
    requesterId: string,
    requesterRole: string,
  ) {
    if (dto.isActive === undefined && dto.isDeleted === undefined) {
      throw new BadRequestException(
        'isActive yoki isDeleted maydonlaridan kamida bittasi kerak',
      );
    }

    const where: Prisma.UserWhereInput = { id };
    if (requesterRole !== 'super_admin') where.tenantId = tenantId;

    const student = await this.prisma.user.findFirst({
      where,
      include: { role: true },
    });

    if (!student) throw new NotFoundException("O'quvchi topilmadi");
    if (student.role.name !== 'student') {
      throw new BadRequestException('Bu foydalanuvchi student emas');
    }

    // isDeleted: false (tiklash) — faqat super_admin
    if (dto.isDeleted === false && requesterRole !== 'super_admin') {
      throw new ForbiddenException(
        "O'chirilgan o'quvchini tiklash faqat super_admin uchun",
      );
    }

    const updateData: Prisma.UserUncheckedUpdateInput = {};

    if (dto.isDeleted === true) {
      // Soft delete: ham isDeleted, ham isActive o'chiriladi
      updateData.isDeleted = true;
      updateData.deletedAt = new Date();
      updateData.isActive = false;
      updateData.archivedAt = null;
      updateData.archivedById = null;
    } else if (dto.isDeleted === false) {
      // Tiklash: isDeleted va arxiv tozalanadi
      updateData.isDeleted = false;
      updateData.deletedAt = null;
      updateData.isActive = true;
    } else if (dto.isActive === false) {
      // Arxivlash
      updateData.isActive = false;
      updateData.archivedAt = new Date();
      updateData.archivedById = requesterId;
    } else if (dto.isActive === true) {
      // Arxivdan qaytarish
      updateData.isActive = true;
      updateData.archivedAt = null;
      updateData.archivedById = null;
    }

    await this.prisma.user.update({ where: { id }, data: updateData });

    const messages: Record<string, string> = {
      deleted: "O'quvchi o'chirildi (soft delete)",
      restored: "O'quvchi tiklandi",
      archived: "O'quvchi arxivlandi",
      unarchived: "O'quvchi arxivdan chiqarildi",
    };

    let msg: string;
    if (dto.isDeleted === true) msg = messages.deleted;
    else if (dto.isDeleted === false) msg = messages.restored;
    else if (dto.isActive === false) msg = messages.archived;
    else msg = messages.unarchived;

    return { message: msg, studentId: id };
  }

  // ─── Studentga oid to'liq profil (profil + wallet + guruh + statistika) ──
  async getFullProfile(
    id: string,
    tenantId: string,
    requesterRole: string,
    requesterId: string,
  ) {
    const where: Prisma.UserWhereInput = { id, isDeleted: false };
    if (requesterRole !== 'super_admin') where.tenantId = tenantId;

    const student = await this.prisma.user.findFirst({
      where,
      include: {
        role: { select: { id: true, name: true, displayName: true } },
        wallet: { select: { id: true, balance: true, updatedAt: true } },
        groupMemberships: {
          where: { isDeleted: false },
          select: {
            id: true,
            joinedAt: true,
            isActive: true,
            group: {
              select: {
                id: true,
                name: true,
                isActive: true,
                course: { select: { id: true, title: true } },
                teacher: { select: { id: true, fullName: true, phone: true } },
              },
            },
          },
        },
        attendanceAsStudent: {
          where: { isDeleted: false },
          orderBy: { recordedAt: 'desc' },
          take: 20,
          select: {
            id: true,
            isPresent: true,
            homeworkDone: true,
            recordedAt: true,
            session: {
              select: {
                id: true,
                sessionDate: true,
                sessionType: true,
                topic: true,
                group: { select: { id: true, name: true } },
              },
            },
          },
        },
        coinTransactionsReceived: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            amount: true,
            direction: true,
            sourceType: true,
            note: true,
            createdAt: true,
            teacher: { select: { id: true, fullName: true } },
          },
        },
        purchases: {
          orderBy: { purchasedAt: 'desc' },
          take: 20,
          select: {
            id: true,
            coinSpent: true,
            status: true,
            purchasedAt: true,
            reward: { select: { id: true, title: true, imageUrl: true } },
          },
        },
      },
    });

    if (!student) throw new NotFoundException("O'quvchi topilmadi");
    if (student.role.name !== 'student') {
      throw new BadRequestException('Bu foydalanuvchi student emas');
    }

    // Student faqat o'z profilini ko'ra oladi
    if (requesterRole === 'student' && id !== requesterId) {
      throw new ForbiddenException("Siz faqat o'z profilingizni ko'ra olasiz");
    }

    // Teacher faqat o'z guruhidagi studentni ko'ra oladi
    if (requesterRole === 'teacher') {
      const isInTeacherGroup = student.groupMemberships.some(
        (m) => m.group.teacher.id === requesterId,
      );
      if (!isInTeacherGroup) {
        throw new ForbiddenException("Siz bu o'quvchini ko'ra olmaysiz");
      }
    }

    const [
      totalSessions,
      presentCount,
      homeworkDoneCount,
      earnedAgg,
      deductedAgg,
      purchasesCount,
    ] = await this.prisma.$transaction([
      this.prisma.attendanceRecord.count({
        where: { studentId: id, isDeleted: false },
      }),
      this.prisma.attendanceRecord.count({
        where: { studentId: id, isPresent: true, isDeleted: false },
      }),
      this.prisma.attendanceRecord.count({
        where: { studentId: id, homeworkDone: true, isDeleted: false },
      }),
      this.prisma.coinTransaction.aggregate({
        where: { studentId: id, direction: 'earn', isDeleted: false },
        _sum: { amount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: { studentId: id, direction: 'deduct', isDeleted: false },
        _sum: { amount: true },
      }),
      this.prisma.purchase.count({ where: { studentId: id } }),
    ]);

    const {
      passwordHash: _ph,
      refreshTokenHash: _rth,
      passwordResetToken: _prt,
      passwordResetExpiry: _pre,
      ...safeStudent
    } = student as typeof student & {
      passwordHash?: string;
      refreshTokenHash?: string;
      passwordResetToken?: string;
      passwordResetExpiry?: Date;
    };

    return {
      ...safeStudent,
      stats: {
        totalSessions,
        presentCount,
        absentCount: totalSessions - presentCount,
        homeworkDoneCount,
        totalCoinsEarned: earnedAgg._sum.amount ?? 0,
        totalCoinsDeducted: deductedAgg._sum.amount ?? 0,
        totalPurchases: purchasesCount,
      },
    };
  }

  // ─── Talabaning shaxsiy Dashboard xulosasi ─────────────────────
  async getMyDashboard(studentId: string, tenantId: string) {
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, tenantId, isDeleted: false },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        wallet: { select: { balance: true, updatedAt: true } },
      },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayStart.getDate() + 1);

    const weekEnd = new Date(todayStart);
    weekEnd.setDate(todayStart.getDate() + 7);

    const activeGroupIds = (
      await this.prisma.groupStudent.findMany({
        where: { studentId, isDeleted: false, group: { isDeleted: false } },
        select: { groupId: true },
      })
    ).map((g) => g.groupId);

    const [
      weekEarnedAgg,
      weekDeductedAgg,
      monthEarnedAgg,
      monthDeductedAgg,
      totalSessions30d,
      presentCount30d,
      homeworkDoneCount30d,
      todaySessions,
      upcomingSessions,
      recentTransactions,
      pendingPurchasesCount,
      recentPurchases,
    ] = await this.prisma.$transaction([
      this.prisma.coinTransaction.aggregate({
        where: {
          studentId,
          direction: 'earn',
          isDeleted: false,
          createdAt: { gte: startOfWeek },
        },
        _sum: { amount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: {
          studentId,
          direction: 'deduct',
          isDeleted: false,
          createdAt: { gte: startOfWeek },
        },
        _sum: { amount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: {
          studentId,
          direction: 'earn',
          isDeleted: false,
          createdAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: {
          studentId,
          direction: 'deduct',
          isDeleted: false,
          createdAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      }),
      this.prisma.attendanceRecord.count({
        where: {
          studentId,
          isDeleted: false,
          session: { sessionDate: { gte: thirtyDaysAgo } },
        },
      }),
      this.prisma.attendanceRecord.count({
        where: {
          studentId,
          isPresent: true,
          isDeleted: false,
          session: { sessionDate: { gte: thirtyDaysAgo } },
        },
      }),
      this.prisma.attendanceRecord.count({
        where: {
          studentId,
          homeworkDone: true,
          isDeleted: false,
          session: { sessionDate: { gte: thirtyDaysAgo } },
        },
      }),
      this.prisma.session.findMany({
        where: {
          groupId: { in: activeGroupIds },
          tenantId,
          isDeleted: false,
          sessionDate: { gte: todayStart, lt: todayEnd },
        },
        select: {
          id: true,
          sessionDate: true,
          startTime: true,
          endTime: true,
          sessionType: true,
          topic: true,
          group: { select: { id: true, name: true } },
          room: { select: { id: true, name: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.session.findMany({
        where: {
          groupId: { in: activeGroupIds },
          tenantId,
          isDeleted: false,
          sessionDate: { gte: todayEnd, lt: weekEnd },
        },
        select: {
          id: true,
          sessionDate: true,
          startTime: true,
          endTime: true,
          sessionType: true,
          group: { select: { id: true, name: true } },
        },
        orderBy: [{ sessionDate: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.coinTransaction.findMany({
        where: { studentId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          amount: true,
          direction: true,
          sourceType: true,
          note: true,
          createdAt: true,
        },
      }),
      this.prisma.purchase.count({
        where: { studentId, status: 'pending' },
      }),
      this.prisma.purchase.findMany({
        where: { studentId },
        orderBy: { purchasedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          coinSpent: true,
          status: true,
          purchasedAt: true,
          reward: { select: { id: true, title: true, imageUrl: true } },
        },
      }),
    ]);

    return {
      student: {
        id: student.id,
        fullName: student.fullName,
        avatarUrl: student.avatarUrl,
      },
      wallet: {
        balance: student.wallet?.balance ?? 0,
        weekDelta:
          (weekEarnedAgg._sum.amount ?? 0) - (weekDeductedAgg._sum.amount ?? 0),
        monthDelta:
          (monthEarnedAgg._sum.amount ?? 0) -
          (monthDeductedAgg._sum.amount ?? 0),
      },
      attendance: {
        last30Days: {
          totalSessions: totalSessions30d,
          presentCount: presentCount30d,
          absentCount: totalSessions30d - presentCount30d,
          attendanceRate:
            totalSessions30d > 0
              ? Math.round((presentCount30d / totalSessions30d) * 100)
              : null,
          homeworkDoneCount: homeworkDoneCount30d,
          homeworkRate:
            totalSessions30d > 0
              ? Math.round((homeworkDoneCount30d / totalSessions30d) * 100)
              : null,
        },
      },
      todaySessions,
      upcomingSessions,
      recentTransactions,
      purchases: {
        pendingCount: pendingPurchasesCount,
        recent: recentPurchases,
      },
    };
  }

  // ─── Avatar URL yangilash ──────────────────────────────────────
  async updateAvatar(id: string, tenantId: string, avatarUrl: string) {
    const student = await this.prisma.user.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    return this.prisma.user.update({
      where: { id },
      data: { avatarUrl },
      select: { id: true, avatarUrl: true },
    });
  }

  // ─── (private) Teacher o'z guruhidagi studentlar ───────────────
  private async findByTeacher(teacherId: string, query: QueryStudentDto) {
    const { search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      isDeleted: false,
      isActive: true,
      groupMemberships: {
        some: {
          isDeleted: false,
          group: { teacherId },
        },
      },
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
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          avatarUrl: true,
          parentPhone: true,
          isActive: true,
          createdAt: true,
          role: { select: { id: true, name: true, displayName: true } },
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
}
