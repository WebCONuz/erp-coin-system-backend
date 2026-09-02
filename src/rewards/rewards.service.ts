import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRewardDto } from './dto/create-reward.dto';
import { QueryRewardDto } from './dto/query-reward.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';
import {
  CoinDirection,
  PurchaseStatus,
  SourceType,
} from 'src/generated/prisma/enums';
import { Prisma } from 'src/generated/prisma/client';

@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, createdById: string, dto: CreateRewardDto) {
    return this.prisma.reward.create({
      data: {
        title: dto.title,
        description: dto.description || '',
        coinPrice: dto.coinPrice,
        stock: dto.stock || 0,
        rewardType: dto.rewardType,
        imageUrl: dto.imageUrl || '',
        categoryId: dto.categoryId,
        tenantId,
        createdById,
      },
    });
  }

  async findAll(query: QueryRewardDto, tenantId: string) {
    const {
      page = 1,
      limit = 10,
      search,
      onlyInStock,
      isActive,
      categoryId,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.RewardWhereInput = {
      tenantId,
      isDeleted: false,
      isActive: isActive !== undefined ? isActive : true,
    };

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (onlyInStock) {
      where.stock = { gt: 0 }; // noldan katta bo'lganlar
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.reward.findMany({
        where,
        skip,
        take: limit,
        orderBy: { coinPrice: 'asc' },
      }),
      this.prisma.reward.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, tenantId: string) {
    const reward = await this.prisma.reward.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!reward) throw new NotFoundException('Sovg‘a topilmadi');
    return reward;
  }

  async update(id: string, dto: UpdateRewardDto, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.reward.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.reward.update({
      where: { id },
      data: { isDeleted: true, isActive: false },
    });
  }

  // 🛒 SOVG‘ANI SOTIB OLISH (Purchase Logic)
  async purchase(rewardId: string, studentId: string, tenantId: string) {
    // 1. Sovg'ani tekshiramiz (Sxemada narx maydoni `coinPrice` deb nomlangan)
    const reward = await this.prisma.reward.findFirst({
      where: { id: rewardId, tenantId, isDeleted: false, isActive: true },
    });

    if (!reward) {
      throw new NotFoundException('Sovg‘a topilmadi yoki faol emas');
    }

    // `stock: -1` cheksiz miqdordagi sovg'alar uchun ishlashi mumkinligini inobatga olamiz
    if (reward.stock !== -1 && reward.stock <= 0) {
      throw new BadRequestException('Afsuski, ushbu sovg‘a omborda qolmagan.');
    }

    // 2. Talaba va uning hamyonini (Wallet) tekshiramiz
    const studentWithWallet = await this.prisma.user.findFirst({
      where: { id: studentId, tenantId, isDeleted: false },
      include: { wallet: true },
    });

    if (!studentWithWallet) {
      throw new NotFoundException('Talaba topilmadi');
    }

    if (!studentWithWallet.wallet) {
      throw new BadRequestException(
        'Talabaning hamyoni (Wallet) faollashtirilmagan.',
      );
    }

    const wallet = studentWithWallet.wallet;

    if (wallet.balance < reward.coinPrice) {
      throw new BadRequestException(
        `Tangalaringiz yetarli emas. Sovg‘a narxi: ${reward.coinPrice} tanga, sizda esa ${wallet.balance} tanga bor.`,
      );
    }

    // 3. Kompleks Tranzaksiya boshlanadi
    return this.prisma.$transaction(async (tx) => {
      // A. Talabaning hamyonidan (Wallet) tangalarni AYIRAMIZ
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: reward.coinPrice },
        },
      });

      // B. Sovg'a zaxirasini (stock) 1 taga kamaytirish (Agar cheksiz bo'lmasa, ya'ni -1 ga teng bo'lmasa)
      if (reward.stock !== -1) {
        await tx.reward.update({
          where: { id: rewardId },
          data: {
            stock: { decrement: 1 },
          },
        });
      }

      // C. Xarid tarixiga (`Purchase` jadvali) yangi yozuv qo'shamiz
      const purchaseRecord = await tx.purchase.create({
        data: {
          studentId,
          rewardId,
          coinSpent: reward.coinPrice,
          status: PurchaseStatus.pending, // Dastlab tasdiqlash kutish rejimida bo'ladi
        },
        include: {
          reward: { select: { title: true } },
        },
      });

      // D. Tangalar harakati tarixiga (`CoinTransaction`) chiqim logini yozamiz
      await tx.coinTransaction.create({
        data: {
          walletId: wallet.id,
          studentId,
          amount: reward.coinPrice,
          direction: CoinDirection.deduct, // Chiqim (ayirish)
          sourceType: SourceType.purchase, // Xarid sababli
          note: `"${reward.title}" sovg'asi sotib olindi. Xarid ID: ${purchaseRecord.id}`,
        },
      });

      return {
        message:
          'Xarid so‘rovi muvaffaqiyatli yuborildi! Sovg‘a admin tomonidan tasdiqlanishini kuting.',
        purchaseId: purchaseRecord.id,
        remainingCoins: updatedWallet.balance,
      };
    });
  }
}
