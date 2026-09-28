import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryPurchaseDto } from './dto/query-purchase.dto';
import {
  AdminSettablePurchaseStatus,
  UpdatePurchaseStatusDto,
} from './dto/update-purchase-status.dto';
import {
  CoinDirection,
  PurchaseStatus,
  SourceType,
} from 'src/generated/prisma/enums';
import { Prisma } from 'src/generated/prisma/client';

// Xarid holatlari oqimi:
//   pending ──▶ approved ──▶ delivered
//      └──────────┴──────▶ cancelled (coin va zaxira qaytadi)
// delivered va cancelled — yakuniy holatlar.
const ALLOWED_TRANSITIONS: Record<PurchaseStatus, PurchaseStatus[]> = {
  [PurchaseStatus.pending]: [PurchaseStatus.approved, PurchaseStatus.cancelled],
  [PurchaseStatus.approved]: [
    PurchaseStatus.delivered,
    PurchaseStatus.cancelled,
  ],
  [PurchaseStatus.delivered]: [],
  [PurchaseStatus.cancelled]: [],
};

const PURCHASE_INCLUDE = {
  student: { select: { id: true, fullName: true, phone: true } },
  reward: {
    select: { id: true, title: true, coinPrice: true, imageUrl: true },
  },
  approvedBy: { select: { id: true, fullName: true } },
  deliveredBy: { select: { id: true, fullName: true } },
} satisfies Prisma.PurchaseInclude;

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  // Xaridlarni faqat student (o'zinikini) va admin+ ko'radi. RolesGuard level
  // bo'yicha ishlagani uchun teacher'ni @Roles bilan to'sib bo'lmaydi — nom bo'yicha tekshiramiz.
  private assertCanView(requesterRole: string) {
    if (requesterRole === 'teacher') {
      throw new ForbiddenException("O'qituvchi xaridlarni ko'ra olmaydi");
    }
  }

  // 1. XARIDLAR RO‘YXATINI OLISH (PAGINATION VA FILTR BILAN)
  async findAll(
    query: QueryPurchaseDto,
    tenantId: string,
    requesterRole: string,
    requesterId: string,
  ) {
    this.assertCanView(requesterRole);

    const { page = 1, limit = 10, rewardId, status } = query;
    // Student faqat o'z xaridlarini ko'radi
    const studentId =
      requesterRole === 'student' ? requesterId : query.studentId;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseWhereInput = {
      isDeleted: false,
      student: { tenantId },
    };

    if (studentId) where.studentId = studentId;
    if (rewardId) where.rewardId = rewardId;
    if (status) where.status = status;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { purchasedAt: 'desc' },
        include: PURCHASE_INCLUDE,
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
  async findOne(
    id: string,
    tenantId: string,
    requesterRole: string,
    requesterId: string,
  ) {
    this.assertCanView(requesterRole);

    const purchase = await this.prisma.purchase.findFirst({
      where: { id, isDeleted: false, student: { tenantId } },
      include: PURCHASE_INCLUDE,
    });

    if (!purchase) throw new NotFoundException('Xarid buyurtmasi topilmadi');

    if (requesterRole === 'student' && purchase.studentId !== requesterId) {
      throw new ForbiddenException("Siz bu xaridni ko'ra olmaysiz");
    }

    return purchase;
  }

  // 3. XARID HOLATINI O'ZGARTIRISH (faqat admin): approved / delivered / cancelled
  async updateStatus(
    id: string,
    tenantId: string,
    adminId: string,
    dto: UpdatePurchaseStatusDto,
  ) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, isDeleted: false, student: { tenantId } },
      include: { reward: true, student: { include: { wallet: true } } },
    });

    if (!purchase) throw new NotFoundException('Xarid buyurtmasi topilmadi');

    const target = dto.status;
    const allowedNext = ALLOWED_TRANSITIONS[purchase.status];

    if (allowedNext.length === 0) {
      throw new BadRequestException(
        `Ushbu buyurtma allaqachon yakunlangan. Joriy holati: ${purchase.status}`,
      );
    }
    if (!allowedNext.includes(target)) {
      throw new BadRequestException(
        `Buyurtmani "${purchase.status}" holatidan "${target}" holatiga o'tkazib bo'lmaydi. ` +
          `Ruxsat etilgan: ${allowedNext.join(', ')}`,
      );
    }

    // Parallel so'rovlarda (masalan, ikki marta bosilganda) status ikki marta
    // o'zgarib, coin ikki marta qaytmasligi uchun update joriy statusga shartli.
    const fromStatuses = (
      Object.keys(ALLOWED_TRANSITIONS) as PurchaseStatus[]
    ).filter((s) => ALLOWED_TRANSITIONS[s].includes(target));

    const statusData = this.buildStatusData(target, adminId, dto.adminNote);

    if (target !== PurchaseStatus.cancelled) {
      const updated = await this.prisma.$transaction(async (tx) => {
        await this.applyStatusChange(tx, id, fromStatuses, statusData);
        return tx.purchase.findUniqueOrThrow({
          where: { id },
          include: PURCHASE_INCLUDE,
        });
      });

      return {
        message:
          target === PurchaseStatus.approved
            ? 'Xarid tasdiqlandi. Sovg‘ani talabaga topshirishingiz mumkin.'
            : 'Sovg‘a talabaga topshirildi.',
        data: updated,
      };
    }

    // BEKOR QILISH -> coin va zaxira qaytariladi
    const wallet = purchase.student.wallet;

    if (!wallet) {
      throw new BadRequestException(
        'Foydalanuvchining hamyoni topilmadi. Tanga qaytarishning iloji yo‘q.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.applyStatusChange(tx, id, fromStatuses, statusData);

      // 1. Talabaning hamyoniga tangalarini qaytaramiz
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: purchase.coinSpent } },
      });

      // 2. Zaxira cheksiz bo'lmasa (stock !== -1), 1 taga qayta ko'paytiramiz
      if (purchase.reward.stock !== -1) {
        await tx.reward.update({
          where: { id: purchase.rewardId },
          data: { stock: { increment: 1 } },
        });
      }

      // 3. Tranzaksiyalar tarixiga qaytarilgan coin (kirim) yoziladi
      await tx.coinTransaction.create({
        data: {
          walletId: wallet.id,
          studentId: purchase.studentId,
          teacherId: adminId,
          amount: purchase.coinSpent,
          direction: CoinDirection.earn,
          sourceType: SourceType.purchase,
          note: `"${purchase.reward.title}" xaridi bekor qilindi, tangalar qaytarildi. Sabab: ${dto.adminNote || 'Izohsiz'}. Xarid ID: ${purchase.id}`,
        },
      });

      const updated = await tx.purchase.findUniqueOrThrow({
        where: { id },
        include: PURCHASE_INCLUDE,
      });

      return {
        message:
          'Xarid bekor qilindi va talabaning tangalari hamyoniga qaytarildi.',
        data: updated,
        refund: {
          coins: purchase.coinSpent,
          currentBalance: updatedWallet.balance,
        },
      };
    });
  }

  private buildStatusData(
    target: AdminSettablePurchaseStatus,
    adminId: string,
    adminNote?: string,
  ): Prisma.PurchaseUncheckedUpdateManyInput {
    const data: Prisma.PurchaseUncheckedUpdateManyInput = { status: target };

    if (adminNote !== undefined) data.deliveryNote = adminNote;

    if (target === PurchaseStatus.approved) {
      data.approvedById = adminId;
    }
    if (target === PurchaseStatus.delivered) {
      data.deliveredById = adminId;
      data.deliveredAt = new Date();
    }

    return data;
  }

  private async applyStatusChange(
    tx: Prisma.TransactionClient,
    id: string,
    fromStatuses: PurchaseStatus[],
    data: Prisma.PurchaseUncheckedUpdateManyInput,
  ) {
    const { count } = await tx.purchase.updateMany({
      where: { id, isDeleted: false, status: { in: fromStatuses } },
      data,
    });

    if (count === 0) {
      throw new ConflictException(
        'Buyurtma holati boshqa so‘rov tomonidan o‘zgartirildi. Sahifani yangilab, qayta urinib ko‘ring.',
      );
    }
  }
}
