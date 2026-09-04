import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── O'qituvchining shaxsiy Dashboard xulosasi ─────────────────
  async getMyDashboard(teacherId: string, tenantId: string) {
    const teacher = await this.prisma.user.findFirst({
      where: { id: teacherId, tenantId, isDeleted: false },
      select: { id: true, fullName: true, avatarUrl: true },
    });
    if (!teacher) throw new NotFoundException("O'qituvchi topilmadi");

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayStart.getDate() + 1);

    const weekEnd = new Date(todayStart);
    weekEnd.setDate(todayStart.getDate() + 7);

    const twoWeeksAgo = new Date(todayStart);
    twoWeeksAgo.setDate(todayStart.getDate() - 14);

    const [
      activeGroups,
      todaySessions,
      upcomingSessions,
      pendingAttendanceSessions,
      recentCoinTransactions,
    ] = await this.prisma.$transaction([
      this.prisma.group.findMany({
        where: { teacherId, tenantId, isDeleted: false, isActive: true },
        select: {
          id: true,
          name: true,
          course: { select: { id: true, title: true } },
          _count: { select: { students: { where: { isDeleted: false } } } },
        },
      }),
      this.prisma.session.findMany({
        where: {
          teacherId,
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
          isLocked: true,
          group: { select: { id: true, name: true } },
          room: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.session.findMany({
        where: {
          teacherId,
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
          subject: { select: { id: true, name: true } },
        },
        orderBy: [{ sessionDate: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.session.findMany({
        where: {
          teacherId,
          tenantId,
          isDeleted: false,
          isLocked: false,
          sessionDate: { gte: twoWeeksAgo, lt: todayEnd },
          attendanceRecords: { none: { isDeleted: false } },
        },
        select: {
          id: true,
          sessionDate: true,
          startTime: true,
          endTime: true,
          sessionType: true,
          group: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
        },
        orderBy: { sessionDate: 'desc' },
      }),
      this.prisma.coinTransaction.findMany({
        where: { teacherId, isDeleted: false, student: { tenantId } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          amount: true,
          direction: true,
          sourceType: true,
          note: true,
          createdAt: true,
          student: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    const totalStudents = activeGroups.reduce(
      (sum, g) => sum + g._count.students,
      0,
    );

    return {
      teacher,
      groups: {
        totalActive: activeGroups.length,
        totalStudents,
        list: activeGroups,
      },
      todaySessions,
      upcomingSessions,
      pendingAttendanceSessions,
      recentCoinTransactions,
    };
  }
}
