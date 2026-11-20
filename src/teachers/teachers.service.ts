import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { teacherGroupAccessWhere } from 'src/common/utils/teacher-group-access';
import { addDays, getTenantToday } from 'src/common/utils/tenant-time';

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

    // "Bugun" — tenant timezone'ida; sessionDate (@db.Date) bilan kalendar sana sifatida solishtiriladi
    const { today } = await getTenantToday(this.prisma, tenantId);
    const todayStart = new Date(today);
    const todayEnd = new Date(addDays(today, 1));
    const weekEnd = new Date(addDays(today, 7));
    const twoWeeksAgo = new Date(addDays(today, -14));

    const [
      activeGroups,
      todaySessions,
      upcomingSessions,
      pendingAttendanceSessions,
      recentCoinTransactions,
    ] = await this.prisma.$transaction([
      this.prisma.group.findMany({
        where: {
          tenantId,
          isDeleted: false,
          isActive: true,
          ...teacherGroupAccessWhere(teacherId),
        },
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
          isChecked: true,
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
          isLocked: true,
          isChecked: true,
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
          isChecked: false,
          sessionDate: { gte: twoWeeksAgo, lt: todayEnd },
        },
        select: {
          id: true,
          sessionDate: true,
          startTime: true,
          endTime: true,
          sessionType: true,
          isLocked: true,
          isChecked: true,
          group: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
        },
        orderBy: { sessionDate: 'desc' },
      }),
      this.prisma.coinTransaction.findMany({
        where: { teacherId, isDeleted: false, tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          amount: true,
          direction: true,
          sourceType: true,
          note: true,
          createdAt: true,
          reversalOfId: true,
          reversal: { select: { id: true, createdAt: true } },
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
