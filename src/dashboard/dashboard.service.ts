import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EFFECTIVE_COIN_TX_WHERE } from 'src/coin-transaction/constants/effective-transaction';
import { CoinDirection } from 'src/generated/prisma/enums';
import { ACTIVE_STUDENT_WHERE } from 'src/common/utils/user-role-checks';
import {
  addDays,
  getTenantToday,
  startOfMonth,
  zonedDayStart,
} from 'src/common/utils/tenant-time';
import { buildTrendBuckets, sumByLocalDay } from 'src/common/utils/coin-trend';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminDashboard(tenantId: string) {
    // "Bugun" — tenant timezone'ida (server vaqtida emas). Session.sessionDate (@db.Date —
    // kalendar sana, UTC-yarim tun sifatida kodlangan) bilan sana sifatida solishtiriladi;
    // coin tranzaksiyalari (createdAt — instant) uchun mahalliy yarim tunning UTC instant'i
    const { tz, today } = await getTenantToday(this.prisma, tenantId);
    const todayStart = new Date(today);
    const todayEnd = new Date(addDays(today, 1));
    const twoWeeksAgo = new Date(addDays(today, -14));

    const weekStartDate = addDays(today, -6); // bugun bilan birga 7 kun
    const sevenDaysAgo = zonedDayStart(tz, weekStartDate);
    const monthStartAt = zonedDayStart(tz, startOfMonth(today));

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
      approvedPurchasesCount,
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
      // Muomaladagi coin — faqat o'quvchilar hamyonlari (xodimlarniki hisoblanmaydi)
      this.prisma.wallet.aggregate({
        where: {
          user: { tenantId, isDeleted: false, role: { name: 'student' } },
        },
        _sum: { balance: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: {
          tenantId,
          direction: CoinDirection.earn,
          ...EFFECTIVE_COIN_TX_WHERE,
          createdAt: { gte: monthStartAt },
        },
        _sum: { amount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: {
          tenantId,
          direction: CoinDirection.deduct,
          ...EFFECTIVE_COIN_TX_WHERE,
          createdAt: { gte: monthStartAt },
        },
        _sum: { amount: true },
      }),
      this.prisma.purchase.count({
        where: { status: 'pending', isDeleted: false, tenantId },
      }),
      // Tasdiqlangan, lekin hali talabaga topshirilmagan xaridlar
      this.prisma.purchase.count({
        where: { status: 'approved', isDeleted: false, tenantId },
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
        where: { tenantId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          amount: true,
          direction: true,
          sourceType: true,
          note: true,
          createdAt: true,
          reversalOfId: true,
          reversal: { select: { id: true, createdAt: true } },
          student: { select: { id: true, fullName: true, avatarUrl: true } },
          teacher: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.wallet.findMany({
        where: { user: { tenantId, ...ACTIVE_STUDENT_WHERE } },
        orderBy: { balance: 'desc' },
        take: 5,
        select: {
          balance: true,
          user: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      }),
      this.prisma.coinTransaction.findMany({
        where: {
          tenantId,
          ...EFFECTIVE_COIN_TX_WHERE,
          createdAt: { gte: sevenDaysAgo },
        },
        select: { amount: true, direction: true, createdAt: true },
      }),
    ]);

    // Oxirgi 7 kunlik earn/deduct trend (chart uchun) — tenant mahalliy kunlari bo'yicha
    const weeklyTrend = buildTrendBuckets(
      sumByLocalDay(tz, weekTransactions),
      weekStartDate,
      7,
      1,
    ).map((b) => ({ date: b.from, earned: b.earned, deducted: b.deducted }));

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
        approvedPurchases: approvedPurchasesCount,
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
