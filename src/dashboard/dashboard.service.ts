import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CoinDirection } from 'src/generated/prisma/enums';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminDashboard(tenantId: string) {
    const now = new Date();

    // UTC asosida — timezone shift oldini olish uchun (Session.sessionDate ham UTC-midnight sifatida saqlanadi)
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const todayEnd = new Date(todayStart);
    todayEnd.setUTCDate(todayStart.getUTCDate() + 1);

    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setUTCDate(todayStart.getUTCDate() - 6); // bugun bilan birga 7 kun

    const twoWeeksAgo = new Date(todayStart);
    twoWeeksAgo.setUTCDate(todayStart.getUTCDate() - 14);

    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    const [
      groupsCount,
      studentsCount,
      teachersCount,
      subjectsCount,
      rewardsCount,
      walletAgg,
      monthEarnedAgg,
      monthDeductedAgg,
      pendingPurchasesCount,
      todaySessionsCount,
      pendingAttendanceCount,
      recentTransactions,
      topWallets,
      weekTransactions,
    ] = await this.prisma.$transaction([
      this.prisma.group.count({
        where: { tenantId, isDeleted: false, isActive: true },
      }),
      this.prisma.user.count({
        where: {
          tenantId,
          isDeleted: false,
          isActive: true,
          role: { name: 'student' },
        },
      }),
      this.prisma.user.count({
        where: {
          tenantId,
          isDeleted: false,
          isActive: true,
          role: { name: 'teacher' },
        },
      }),
      this.prisma.subject.count({
        where: { tenantId, isDeleted: false, isActive: true },
      }),
      this.prisma.reward.count({
        where: { tenantId, isDeleted: false, isActive: true },
      }),
      this.prisma.wallet.aggregate({
        where: { user: { tenantId, isDeleted: false } },
        _sum: { balance: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: {
          student: { tenantId },
          direction: CoinDirection.earn,
          isDeleted: false,
          createdAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: {
          student: { tenantId },
          direction: CoinDirection.deduct,
          isDeleted: false,
          createdAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      }),
      this.prisma.purchase.count({
        where: { status: 'pending', student: { tenantId } },
      }),
      this.prisma.session.count({
        where: {
          tenantId,
          isDeleted: false,
          sessionDate: { gte: todayStart, lt: todayEnd },
        },
      }),
      this.prisma.session.count({
        where: {
          tenantId,
          isDeleted: false,
          isLocked: false,
          sessionDate: { gte: twoWeeksAgo, lt: todayEnd },
          attendanceRecords: { none: { isDeleted: false } },
        },
      }),
      this.prisma.coinTransaction.findMany({
        where: { student: { tenantId }, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          amount: true,
          direction: true,
          sourceType: true,
          note: true,
          createdAt: true,
          student: { select: { id: true, fullName: true, avatarUrl: true } },
          teacher: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.wallet.findMany({
        where: { user: { tenantId, isDeleted: false, isActive: true } },
        orderBy: { balance: 'desc' },
        take: 5,
        select: {
          balance: true,
          user: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      }),
      this.prisma.coinTransaction.findMany({
        where: {
          student: { tenantId },
          isDeleted: false,
          createdAt: { gte: sevenDaysAgo },
        },
        select: { amount: true, direction: true, createdAt: true },
      }),
    ]);

    // Oxirgi 7 kunlik earn/deduct trend (chart uchun)
    const weeklyTrend: { date: string; earned: number; deducted: number }[] =
      [];
    for (let i = 0; i < 7; i++) {
      const bucketStart = new Date(sevenDaysAgo);
      bucketStart.setUTCDate(sevenDaysAgo.getUTCDate() + i);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setUTCDate(bucketStart.getUTCDate() + 1);

      let earned = 0;
      let deducted = 0;
      for (const t of weekTransactions) {
        if (t.createdAt >= bucketStart && t.createdAt < bucketEnd) {
          if (t.direction === CoinDirection.earn) earned += t.amount;
          else deducted += t.amount;
        }
      }

      weeklyTrend.push({
        date: bucketStart.toISOString().split('T')[0],
        earned,
        deducted,
      });
    }

    return {
      stats: {
        groups: groupsCount,
        students: studentsCount,
        teachers: teachersCount,
        subjects: subjectsCount,
        rewards: rewardsCount,
      },
      coinEconomy: {
        totalInCirculation: walletAgg._sum.balance ?? 0,
        earnedThisMonth: monthEarnedAgg._sum.amount ?? 0,
        deductedThisMonth: monthDeductedAgg._sum.amount ?? 0,
        weeklyTrend,
      },
      needsAttention: {
        pendingPurchases: pendingPurchasesCount,
        pendingAttendanceSessions: pendingAttendanceCount,
      },
      todaySessionsCount,
      recentActivity: recentTransactions,
      leaderboard: topWallets.map((w) => ({
        student: w.user,
        balance: w.balance,
      })),
    };
  }
}
