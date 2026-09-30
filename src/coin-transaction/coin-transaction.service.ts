import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCoinTransactionDto } from './dto/create-coin-transaction.dto';
import { QueryCoinTransactionDto } from './dto/query-coin-transaction.dto';
import { QueryMyCoinHistoryDto } from './dto/query-my-coin-history.dto';
import { QueryCoinStatsDto } from './dto/query-coin-stats.dto';
import { BulkGiveCoinDto } from './dto/bulk-give-coin.dto';
import { ApplyCoinRuleDto } from './dto/apply-coin-rule.dto';
import { CoinDirection, SourceType } from 'src/generated/prisma/enums';
import {
  ExecuteCoinProcessData,
  ReplaceSessionCoinsResult,
  SessionCoinItem,
  SkippedSessionCoinItem,
} from 'src/common/types';
import { Prisma } from 'src/generated/prisma/client';
import { COIN_SKIP_CODES } from 'src/sessions/constants/session-types';
import { teacherGroupAccessWhere } from 'src/common/utils/teacher-group-access';

export interface BulkCoinResultItem {
  studentId: string;
  success: boolean;
  direction?: CoinDirection;
  transactionId?: string;
  newBalance?: number;
  error?: string;
}

@Injectable()
export class CoinTransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. MANUALLY (QO'LDA) TRANZAKSIYA YARATISH (Controller ishlatadi)
  async createManualTransaction(
    tenantId: string,
    teacherId: string,
    dto: CreateCoinTransactionDto,
    requesterRole?: string,
  ) {
    // Teacher faqat o'zi dars beradigan guruhdagi o'quvchiga coin bera oladi
    if (requesterRole === 'teacher') {
      const isOwnStudent = await this.prisma.groupStudent.findFirst({
        where: {
          studentId: dto.studentId,
          isDeleted: false,
          group: {
            tenantId,
            isDeleted: false,
            ...teacherGroupAccessWhere(teacherId),
          },
        },
      });
      if (!isOwnStudent) {
        throw new ForbiddenException(
          "Siz faqat o'z guruhingizdagi o'quvchiga tanga bera olasiz",
        );
      }
    }

    return this.executeCoinProcess(tenantId, {
      studentId: dto.studentId,
      amount: dto.amount,
      direction: dto.direction,
      sourceType: dto.sourceType,
      note: dto.note,
      teacherId,
      ruleId: dto.ruleId,
      groupId: dto.groupId,
      sessionId: dto.sessionId,
    });
  }

  // 2. TIZIM ICHKI XIZMATLARI UCHUN INTERFEYS (Buni dars yo'qlama moduli chaqiradi)
  async createInternalTransaction(
    tenantId: string,
    data: ExecuteCoinProcessData,
  ) {
    return this.executeCoinProcess(tenantId, data);
  }

  // 3. ASOSIY YORDAMCHI TRANZAKSIYA METODI (CORE LOGIC)
  private async executeCoinProcess(
    tenantId: string,
    data: ExecuteCoinProcessData,
  ) {
    const {
      studentId,
      amount,
      direction,
      sourceType,
      note,
      teacherId,
      ruleId,
      groupId,
      sessionId,
    } = data;

    // Talabani tekshiramiz
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, tenantId, isDeleted: false },
      select: { id: true },
    });

    if (!student) throw new NotFoundException('O‘quvchi topilmadi');

    // Tranzaksiyani xavfsiz ishga tushiramiz
    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.getOrCreateWallet(tx, studentId);

      // Agar tanga ayirilayotgan bo'lsa, balans yetarliligini tekshiramiz
      if (direction === CoinDirection.deduct && wallet.balance < amount) {
        throw new BadRequestException(
          `Talabaning balansi yetarli emas. Joriy balans: ${wallet.balance}, ayirilmoqchi: ${amount}`,
        );
      }

      const result = await this.applyCoinInTx(tx, wallet.id, {
        studentId,
        amount,
        direction,
        sourceType,
        note,
        teacherId,
        ruleId,
        groupId,
        sessionId,
      });

      return { success: true, ...result };
    });
  }

  // 3a. Hamyon topiladi, yo'q bo'lsa (User yaratilganda ochilmay qolgan bo'lsa) ochiladi
  private async getOrCreateWallet(
    tx: Prisma.TransactionClient,
    studentId: string,
  ) {
    const wallet = await tx.wallet.findUnique({ where: { userId: studentId } });
    if (wallet) return wallet;
    return tx.wallet.create({ data: { userId: studentId, balance: 0 } });
  }

  // 3a1. Balansni o'zgartirish + tranzaksiya logi (faqat tx ichida chaqiriladi)
  private async applyCoinInTx(
    tx: Prisma.TransactionClient,
    walletId: string,
    data: ExecuteCoinProcessData,
  ) {
    const updatedWallet = await tx.wallet.update({
      where: { id: walletId },
      data: {
        balance:
          data.direction === CoinDirection.earn
            ? { increment: data.amount }
            : { decrement: data.amount },
      },
    });

    const transactionRecord = await tx.coinTransaction.create({
      data: {
        amount: data.amount,
        direction: data.direction,
        sourceType: data.sourceType,
        note: data.note || null,
        ruleId: data.ruleId || null,
        walletId,
        studentId: data.studentId,
        teacherId: data.teacherId || null,
        sessionId: data.sessionId || null,
        groupId: data.groupId || null,
      },
    });

    return {
      transactionId: transactionRecord.id,
      newBalance: updatedWallet.balance,
    };
  }

  // 3a2. SESSIYA TEKSHIRUVI COINLARINI ALMASHTIRISH — yo'qlama/natija qayta
  // saqlanganda shu session+student bo'yicha avvalgi (sourceTypes dagi)
  // tranzaksiyalar bekor qilinib, `items` yaratiladi. Chaqiruvchining tx'i
  // ichida ishlaydi (AttendanceRecord upsert bilan bitta atomik blok).
  // - Avvalgi coinlarni qaytarib bo'lmasa (talaba sarflab bo'lgan) — hech
  //   narsa o'zgarmaydi, `skipped: true`.
  // - Ayirish (jarima) elementiga balans yetmasa — faqat shu element
  //   o'tkazib yuboriladi, qolganlari beriladi.
  async replaceSessionTransactions(
    tx: Prisma.TransactionClient,
    params: {
      sessionId: string;
      studentId: string;
      sourceTypes: SourceType[];
      items: SessionCoinItem[];
    },
  ): Promise<ReplaceSessionCoinsResult> {
    const { sessionId, studentId, sourceTypes, items } = params;

    const activeTransactions = await tx.coinTransaction.findMany({
      where: {
        sessionId,
        studentId,
        isDeleted: false,
        sourceType: { in: sourceTypes },
      },
    });

    const wallet = await this.getOrCreateWallet(tx, studentId);

    // Bekor qilishdan keyingi balans: berilganlar ayiriladi, ayirilganlar qaytariladi
    const reversalDelta = activeTransactions.reduce(
      (sum, trx) =>
        sum + (trx.direction === CoinDirection.earn ? -trx.amount : trx.amount),
      0,
    );
    let balance = wallet.balance + reversalDelta;

    if (balance < 0) {
      return {
        skipped: true,
        code: COIN_SKIP_CODES.COINS_ALREADY_SPENT,
        reason: `Balans yetarli emas (joriy: ${wallet.balance}, qaytarish uchun kerak: ${-reversalDelta}) — talaba avvalgi coinlarni allaqachon sarflab bo'lgan`,
        reversed: 0,
        created: 0,
        skippedItems: [],
      };
    }

    for (const trx of activeTransactions) {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance:
            trx.direction === CoinDirection.earn
              ? { decrement: trx.amount }
              : { increment: trx.amount },
        },
      });
      await tx.coinTransaction.update({
        where: { id: trx.id },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    }

    const skippedItems: SkippedSessionCoinItem[] = [];
    let created = 0;

    for (const item of items) {
      if (item.amount <= 0) continue;

      if (item.direction === CoinDirection.deduct && balance < item.amount) {
        skippedItems.push({
          sourceType: item.sourceType,
          direction: item.direction,
          amount: item.amount,
          code: COIN_SKIP_CODES.INSUFFICIENT_BALANCE_FOR_PENALTY,
          reason: `Jarima uchun balans yetarli emas (joriy: ${balance}, kerak: ${item.amount})`,
        });
        continue;
      }

      const result = await this.applyCoinInTx(tx, wallet.id, {
        ...item,
        studentId,
      });
      balance = result.newBalance;
      created++;
    }

    return {
      skipped: false,
      reversed: activeTransactions.length,
      created,
      skippedItems,
    };
  }

  // 3a3. SESSIYA O'CHIRILGANDA — uning tekshiruvi orqali berilgan barcha
  // coinlarni qaytarish (hammasi yoki hech biri). Kimdir coinni sarflab
  // bo'lgan bo'lsa, hech narsa o'zgarmaydi va shu o'quvchilar qaytariladi.
  async reverseSessionTransactions(
    tx: Prisma.TransactionClient,
    sessionId: string,
    sourceTypes: SourceType[],
  ): Promise<{ reversed: number; blockedStudentIds: string[] }> {
    const activeTransactions = await tx.coinTransaction.findMany({
      where: { sessionId, isDeleted: false, sourceType: { in: sourceTypes } },
      include: { wallet: { select: { balance: true } } },
    });

    const perWallet = new Map<
      string,
      { studentId: string; balance: number; delta: number }
    >();
    for (const trx of activeTransactions) {
      const entry = perWallet.get(trx.walletId) ?? {
        studentId: trx.studentId,
        balance: trx.wallet.balance,
        delta: 0,
      };
      entry.delta +=
        trx.direction === CoinDirection.earn ? -trx.amount : trx.amount;
      perWallet.set(trx.walletId, entry);
    }

    const blockedStudentIds = [...perWallet.values()]
      .filter((w) => w.balance + w.delta < 0)
      .map((w) => w.studentId);

    if (blockedStudentIds.length) {
      return { reversed: 0, blockedStudentIds };
    }

    for (const [walletId, { delta }] of perWallet) {
      if (delta === 0) continue;
      await tx.wallet.update({
        where: { id: walletId },
        data: {
          balance: delta > 0 ? { increment: delta } : { decrement: -delta },
        },
      });
    }

    await tx.coinTransaction.updateMany({
      where: { id: { in: activeTransactions.map((t) => t.id) } },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return { reversed: activeTransactions.length, blockedStudentIds: [] };
  }

  // 3b. BIR NECHTA O'QUVCHIGA BIRDANIGA BIR XIL MIQDORDA COIN BERISH/AYIRISH
  async giveBulkManual(
    tenantId: string,
    teacherId: string,
    dto: BulkGiveCoinDto,
    requesterRole?: string,
  ) {
    const uniqueStudentIds = Array.from(new Set(dto.studentIds));
    const results: BulkCoinResultItem[] = [];

    for (const studentId of uniqueStudentIds) {
      try {
        // Teacher faqat o'zi dars beradigan guruhdagi o'quvchiga coin bera oladi
        if (requesterRole === 'teacher') {
          const isOwnStudent = await this.prisma.groupStudent.findFirst({
            where: {
              studentId,
              isDeleted: false,
              group: {
                tenantId,
                isDeleted: false,
                ...teacherGroupAccessWhere(teacherId),
              },
            },
          });
          if (!isOwnStudent) {
            throw new ForbiddenException(
              "Siz faqat o'z guruhingizdagi o'quvchiga tanga bera olasiz",
            );
          }
        }

        const result = await this.executeCoinProcess(tenantId, {
          studentId,
          amount: dto.amount,
          direction: dto.direction,
          sourceType: dto.sourceType,
          note: dto.note,
          teacherId,
          groupId: dto.groupId,
          sessionId: dto.sessionId,
        });

        results.push({
          studentId,
          success: true,
          direction: dto.direction,
          transactionId: result.transactionId,
          newBalance: result.newBalance,
        });
      } catch (err) {
        results.push({
          studentId,
          success: false,
          direction: dto.direction,
          error: err instanceof Error ? err.message : "Noma'lum xatolik",
        });
      }
    }

    return {
      totalRequested: uniqueStudentIds.length,
      successCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success).length,
      results,
    };
  }

  // 3c. MAVJUD COIN QOIDASINI BIR YOKI BIR NECHTA STUDENTGA QO'LLASH
  async applyRuleToStudents(
    tenantId: string,
    teacherId: string,
    dto: ApplyCoinRuleDto,
    requesterRole?: string,
  ) {
    const rule = await this.prisma.coinRule.findFirst({
      where: {
        id: dto.ruleId,
        tenantId,
        isDeleted: false,
        isActive: true,
      },
    });

    if (!rule) {
      throw new NotFoundException('Tanga qoidasi topilmadi yoki nofaol');
    }

    const uniqueStudentIds = Array.from(new Set(dto.studentIds));
    const results: BulkCoinResultItem[] = [];
    const note = dto.note || `"${rule.name}" qoidasi asosida`;

    for (const studentId of uniqueStudentIds) {
      try {
        // Agar qoida ma'lum bir guruhga biriktirilgan bo'lsa,
        // faqat shu guruh a'zolariga qo'llash mumkin
        if (rule.groupId) {
          const isMember = await this.prisma.groupStudent.findFirst({
            where: { studentId, groupId: rule.groupId, isDeleted: false },
          });
          if (!isMember) {
            throw new BadRequestException(
              "Bu qoida faqat biriktirilgan guruh a'zolariga qo'llanadi, o'quvchi shu guruhda emas",
            );
          }
        }

        // Teacher faqat o'zi dars beradigan guruhdagi o'quvchiga coin bera oladi
        if (requesterRole === 'teacher') {
          const isOwnStudent = await this.prisma.groupStudent.findFirst({
            where: {
              studentId,
              isDeleted: false,
              group: {
                tenantId,
                isDeleted: false,
                ...teacherGroupAccessWhere(teacherId),
              },
            },
          });
          if (!isOwnStudent) {
            throw new ForbiddenException(
              "Siz faqat o'z guruhingizdagi o'quvchiga tanga bera olasiz",
            );
          }
        }

        const result = await this.executeCoinProcess(tenantId, {
          studentId,
          amount: rule.coinAmount,
          direction: rule.direction,
          sourceType: rule.sourceType ?? SourceType.manual,
          note,
          teacherId,
          ruleId: rule.id,
          groupId: rule.groupId,
          sessionId: dto.sessionId,
        });

        results.push({
          studentId,
          success: true,
          direction: rule.direction,
          transactionId: result.transactionId,
          newBalance: result.newBalance,
        });
      } catch (err) {
        results.push({
          studentId,
          success: false,
          direction: rule.direction,
          error: err instanceof Error ? err.message : "Noma'lum xatolik",
        });
      }
    }

    return {
      rule: {
        id: rule.id,
        name: rule.name,
        coinAmount: rule.coinAmount,
        direction: rule.direction,
      },
      totalRequested: uniqueStudentIds.length,
      successCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success).length,
      results,
    };
  }

  // 4. TRANZAKSIYALAR TARIXINI OLISH
  async findAll(
    query: QueryCoinTransactionDto,
    tenantId: string,
    requesterRole?: string,
    requesterId?: string,
  ) {
    const {
      page = 1,
      limit = 10,
      studentId,
      teacherId,
      direction,
      sourceType,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CoinTransactionWhereInput = {
      isDeleted: false,
      student: { tenantId },
    };

    if (studentId) where.studentId = studentId;
    if (teacherId) where.teacherId = teacherId;
    if (direction) where.direction = direction;
    if (sourceType) where.sourceType = sourceType;

    // Teacher faqat o'zi bergan/qayd etgan tranzaksiyalarni ko'radi
    if (requesterRole === 'teacher') {
      where.teacherId = requesterId;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.coinTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          student: { select: { fullName: true, phone: true } },
          teacher: { select: { fullName: true } },
          rule: { select: { name: true } },
        },
      }),
      this.prisma.coinTransaction.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // 5. TRANZAKSIYANI BEKOR QILISH (ROLLBACK LOGIC)
  async cancelTransaction(id: string, tenantId: string) {
    const trx = await this.prisma.coinTransaction.findFirst({
      where: { id, isDeleted: false, student: { tenantId } },
      include: { wallet: true },
    });

    if (!trx)
      throw new NotFoundException(
        'Tranzaksiya topilmadi yoki allaqachon o‘chirilgan',
      );

    return this.prisma.$transaction(async (tx) => {
      // Agar avval coin berilgan bo'lsa (earn) - endi ayiramiz (deduct). Va aksinchasi.
      if (trx.direction === CoinDirection.earn) {
        if (trx.wallet.balance < trx.amount) {
          throw new BadRequestException(
            'Tranzaksiyani bekor qilib bo‘lmaydi, talaba coinlarni ishlatib yuborgan.',
          );
        }
        await tx.wallet.update({
          where: { id: trx.walletId },
          data: { balance: { decrement: trx.amount } },
        });
      } else {
        await tx.wallet.update({
          where: { id: trx.walletId },
          data: { balance: { increment: trx.amount } },
        });
      }

      // Soft delete tranzaksiya
      await tx.coinTransaction.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
      });

      return {
        message:
          'Tranzaksiya muvaffaqiyatli bekor qilindi va balans qayta hisoblandi',
      };
    });
  }

  // 6. TALABA HAMYONINI OLISH
  async getStudentWallet(userId: string, tenantId: string) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { userId, user: { tenantId } },
    });
    if (!wallet) throw new NotFoundException('Hamyon topilmadi');
    return wallet;
  }

  // 6b. TALABANING O'Z TRANZAKSIYA TARIXI (Shaxsiy profil uchun, filtrlar bilan)
  async getMyHistory(
    studentId: string,
    tenantId: string,
    query: QueryMyCoinHistoryDto,
  ) {
    const { page = 1, limit = 20, direction, sourceType, from, to } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CoinTransactionWhereInput = {
      studentId,
      isDeleted: false,
      student: { tenantId },
    };

    if (direction) where.direction = direction;
    if (sourceType) where.sourceType = sourceType;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.coinTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          direction: true,
          sourceType: true,
          note: true,
          createdAt: true,
          teacher: { select: { id: true, fullName: true } },
          group: { select: { id: true, name: true } },
        },
      }),
      this.prisma.coinTransaction.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // 6c. TALABANING TANGA STATISTIKASI (Chart uchun — earn/deduct trend)
  async getMyStats(
    studentId: string,
    tenantId: string,
    query: QueryCoinStatsDto,
  ) {
    const { period = 'week', count = 7 } = query;
    const bucketDays = period === 'month' ? 7 : 1; // month → haftalik bucket, week → kunlik bucket
    const totalDays = bucketDays * count;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - totalDays + 1);

    const transactions = await this.prisma.coinTransaction.findMany({
      where: {
        studentId,
        isDeleted: false,
        student: { tenantId },
        createdAt: { gte: start },
      },
      select: { amount: true, direction: true, createdAt: true },
    });

    const buckets: {
      from: string;
      to: string;
      earned: number;
      deducted: number;
    }[] = [];

    for (let i = 0; i < count; i++) {
      const bucketStart = new Date(start);
      bucketStart.setDate(start.getDate() + i * bucketDays);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketStart.getDate() + bucketDays);

      let earned = 0;
      let deducted = 0;
      for (const t of transactions) {
        if (t.createdAt >= bucketStart && t.createdAt < bucketEnd) {
          if (t.direction === CoinDirection.earn) earned += t.amount;
          else deducted += t.amount;
        }
      }

      buckets.push({
        from: bucketStart.toISOString().split('T')[0],
        to: new Date(bucketEnd.getTime() - 1).toISOString().split('T')[0],
        earned,
        deducted,
      });
    }

    return {
      period,
      buckets,
      totalEarned: buckets.reduce((s, b) => s + b.earned, 0),
      totalDeducted: buckets.reduce((s, b) => s + b.deducted, 0),
    };
  }

  // 7. LEADERBOARD (REYTING)
  async getLeaderboard(tenantId: string, limit: number) {
    return this.prisma.wallet.findMany({
      where: { user: { tenantId, isDeleted: false, isActive: true } },
      take: limit,
      orderBy: { balance: 'desc' },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
  }
}
