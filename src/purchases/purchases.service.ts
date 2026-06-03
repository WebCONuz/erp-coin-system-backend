import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryPurchaseDto } from './dto/query-purchase.dto';
import { UpdatePurchaseStatusDto } from './dto/update-purchase-status.dto';
import {
  CoinDirection,
  PurchaseStatus,
  SourceType,
} from 'src/generated/prisma/enums';
import { Prisma } from 'src/generated/prisma/client';

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. XARIDLAR RO‘YXATINI OLISH (PAGINATION VA FILTR BILAN)
  async findAll(query: QueryPurchaseDto, tenantId: string) {
    const { page = 1, limit = 10, studentId, rewardId, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseWhereInput = { student: { tenantId } };

    if (studentId) where.studentId = studentId;
    if (rewardId) where.rewardId = rewardId;
    if (status) where.status = status;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { purchasedAt: 'desc' },
        include: {
          student: { select: { id: true, fullName: true, phone: true } },
          reward: {
            select: { id: true, title: true, coinPrice: true, imageUrl: true },
          },
        },
      }),
      this.prisma.purchase.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // 2. BITTA XARID TAFSILOTI
  async findOne(id: string, tenantId: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, student: { tenantId } },
      include: {
        student: { select: { id: true, fullName: true, phone: true } },
        reward: {
          select: { id: true, title: true, coinPrice: true, imageUrl: true },
        },
      },
    });

    if (!purchase) throw new NotFoundException('Xarid buyurtmasi topilmadi');
    return purchase;
  }

  // 3. BUYURTMANI TASDIQLASH YOKI RAD ETISH (STATUS UPDATE LOGIC)
  async updateStatus(
    id: string,
    tenantId: string,
    adminId: string,
    dto: UpdatePurchaseStatusDto,
  ) {
    // Avval xarid buyurtmasi borligini tekshiramiz
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, student: { tenantId } },
      include: { reward: true, student: { include: { wallet: true } } },
    });

    if (!purchase) throw new NotFoundException('Xarid buyurtmasi topilmadi');

    // Agar buyurtma allaqachon pending holatidan o'zgargan bo'lsa, uni qayta o'zgartirib bo'lmaydi
    if (purchase.status !== PurchaseStatus.pending) {
      throw new BadRequestException(
        `Ushbu buyurtma allaqachon yakunlangan. Joriy holati: ${purchase.status}`,
      );
    }

    // A. AGAR ADMIN BUYURTMANI TASDIQLASA (APPROVED)
    if (dto.status === PurchaseStatus.approved) {
      return this.prisma.purchase.update({
        where: { id },
        data: {
          status: PurchaseStatus.approved,
          // Agar sxemangizda adminId yoki adminNote bo'lsa yozasiz, bo'lmasa faqat status o'zi yangilanadi
          // adminNote: dto.adminNote || null
        },
      });
    }

    // B. AGAR ADMIN BUYURTMANI RAD ETSA (REJECTED) -> COINLARNI QAYTARISH LOZIM!
    if (dto.status === PurchaseStatus.cancelled) {
      const wallet = purchase.student.wallet;

      if (!wallet) {
        throw new BadRequestException(
          'Foydalanuvchining hamyoni topilmadi. Tanga qaytarishning iloji yo‘q.',
        );
      }

      return this.prisma.$transaction(async (tx) => {
        // 1. Talabaning hamyoniga tangalarini qayta qo‘shib qo‘yamiz (Increment)
        const updatedWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: { increment: purchase.coinSpent },
          },
        });

        // 2. Agar sovg‘aning zaxirasi cheksiz bo‘lmasa (stock !== -1), ombor zaxirasini 1 taga qayta ko‘paytiramiz
        if (purchase.reward.stock !== -1) {
          await tx.reward.update({
            where: { id: purchase.rewardId },
            data: {
              stock: { increment: 1 },
            },
          });
        }

        // 3. Tranzaksiyalar tarixiga tangalar qaytarilganligi haqida KIRIM logini yozamiz
        await tx.coinTransaction.create({
          data: {
            walletId: wallet.id,
            studentId: purchase.studentId,
            teacherId: adminId,
            amount: purchase.coinSpent,
            direction: CoinDirection.earn, // Qaytib kirim bo'ldi
            sourceType: SourceType.bonus, // Tizim tomonidan qaytarilgani uchun bonus yoki mos keluvchi enum
            note: `Xarid rad etildi. Tangalar qaytarildi. Sabab: ${dto.adminNote || 'Izohsiz'}. Xarid ID: ${purchase.id}`,
          },
        });

        // 4. Xarid statusini 'rejected' ga o‘zgartiramiz
        const updatedPurchase = await tx.purchase.update({
          where: { id },
          data: {
            status: PurchaseStatus.cancelled,
          },
        });

        return {
          message:
            'Xarid so‘rovi rad etildi va talabaning tangalari hamyoniga muvaffaqiyatli qaytarildi.',
          purchaseStatus: updatedPurchase.status,
          refundedCoins: purchase.coinSpent,
          currentBalance: updatedWallet.balance,
        };
      });
    }
  }
}
