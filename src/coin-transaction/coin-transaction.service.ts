import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCoinTransactionDto } from './dto/create-coin-transaction.dto';
import { QueryCoinTransactionDto } from './dto/query-coin-transaction.dto';
import { CoinDirection } from 'src/generated/prisma/enums';
import { ExecuteCoinProcessData } from 'src/common/types';
import { Prisma } from 'src/generated/prisma/client';

@Injectable()
export class CoinTransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. MANUALLY (QO'LDA) TRANZAKSIYA YARATISH (Controller ishlatadi)
  async createManualTransaction(
    tenantId: string,
    teacherId: string,
    dto: CreateCoinTransactionDto,
  ) {
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

    // Talaba va uning hamyonini tekshiramiz
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, tenantId, isDeleted: false },
      include: { wallet: true },
    });

    if (!student) throw new NotFoundException('O‘quvchi topilmadi');

    let wallet = student.wallet;

    // Agar hamyoni yo'q bo'lsa (User yaratilganda ochilmay qolgan bo'lsa), shu yerda avtomatik ochib ketamiz
    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: { userId: studentId, balance: 0 },
      });
    }

    // Agar tanga ayirilayotgan bo'lsa, balans yetarliligini tekshiramiz
    if (direction === CoinDirection.deduct && wallet.balance < amount) {
      throw new BadRequestException(
        `Talabaning balansi yetarli emas. Joriy balans: ${wallet.balance}, ayirilmoqchi: ${amount}`,
      );
    }

    // Tranzaksiyani xavfsiz ishga tushiramiz
    return this.prisma.$transaction(async (tx) => {
      // A. Hamyon balansini yangilash
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance:
            direction === CoinDirection.earn
              ? { increment: amount }
              : { decrement: amount },
        },
      });

      // B. Tranzaksiyalar jadvaliga log yozish
      const transactionRecord = await tx.coinTransaction.create({
        data: {
          amount,
          direction,
          sourceType,
          note: note || null,
          ruleId: ruleId || null,
          walletId: wallet.id,
          studentId,
          teacherId: teacherId || null,
          sessionId: sessionId || null,
          groupId: groupId || null,
        },
      });

      return {
        success: true,
        transactionId: transactionRecord.id,
        newBalance: updatedWallet.balance,
      };
    });
  }

  // 4. TRANZAKSIYALAR TARIXINI OLISH
  async findAll(query: QueryCoinTransactionDto, tenantId: string) {
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
