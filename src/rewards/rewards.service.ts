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
      // Sotuvda bor: noldan katta yoki cheksiz (-1)
      where.OR = [{ stock: { gt: 0 } }, { stock: -1 }];
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
      data: await this.withReservedCounts(data),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, tenantId: string) {
    const reward = await this.findOneOrFail(id, tenantId);
    const [withCount] = await this.withReservedCounts([reward]);
    return withCount;
  }

  async update(id: string, dto: UpdateRewardDto, tenantId: string) {
    const reward = await this.findOneOrFail(id, tenantId);
    const { stockDelta, ...data } = dto;

    if (stockDelta !== undefined && data.stock !== undefined) {
      throw new BadRequestException(
        '`stock` va `stockDelta` birga yuborilmaydi — bittasini tanlang',
      );
    }
    if (stockDelta !== undefined && reward.stock === -1) {
      throw new BadRequestException(
        'Cheksiz (-1) sovg‘a zaxirasini stockDelta bilan o‘zgartirib bo‘lmaydi. Aniq son uchun `stock` yuboring',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.reward.update({ where: { id }, data });
      }

      if (stockDelta !== undefined) {
        // Nisbiy o'zgartirish: shu orada sotilgan donalar yo'qolmaydi (increment),
        // shart esa zaxira manfiyga tushmasligini va sovg'a cheksiz bo'lmasligini ta'minlaydi.
        const { count } = await tx.reward.updateMany({
          where: {
            id,
            stock: { gte: stockDelta < 0 ? -stockDelta : 0 },
          },
          data: { stock: { increment: stockDelta } },
        });

        if (count === 0) {
          const current = await tx.reward.findUnique({
            where: { id },
            select: { stock: true },
          });
          throw new BadRequestException(
            current?.stock === -1
              ? 'Sovg‘a cheksiz (-1) — stockDelta qo‘llanmaydi'
              : `Zaxirani ${stockDelta} ga o‘zgartirib bo‘lmaydi: joriy zaxira ${current?.stock ?? 0}`,
          );
        }
      }
    });

    return this.findOne(id, tenantId);
  }

  private async findOneOrFail(id: string, tenantId: string) {
    const reward = await this.prisma.reward.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!reward) throw new NotFoundException('Sovg‘a topilmadi');
    return reward;
  }

  // Har bir sovg'aga `reservedCount` qo'shadi — sotib olingan, lekin hali
  // topshirilmagan (pending + approved) xaridlar soni. Bu donalar `stock` dan
  // allaqachon ayirilgan: omborda jismonan turgan son ≈ stock + reservedCount.
  private async withReservedCounts<T extends { id: string }>(rewards: T[]) {
    if (rewards.length === 0) return [];

    const groups = await this.prisma.purchase.groupBy({
      by: ['rewardId'],
      where: {
        rewardId: { in: rewards.map((r) => r.id) },
        isDeleted: false,
        status: { in: [PurchaseStatus.pending, PurchaseStatus.approved] },
      },
      _count: { _all: true },
    });

    const counts = new Map(groups.map((g) => [g.rewardId, g._count._all]));

    return rewards.map((r) => ({
      ...r,
      reservedCount: counts.get(r.id) ?? 0,
    }));
  }

  async remove(id: string, tenantId: string) {
    await this.findOneOrFail(id, tenantId);
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
      // A. Talabaning hamyonidan (Wallet) tangalarni AYIRAMIZ.
      // Shartli update: parallel xaridlarda balans manfiyga tushmasligi uchun.
      const walletDebit = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: reward.coinPrice } },
        data: {
          balance: { decrement: reward.coinPrice },
        },
      });

      if (walletDebit.count === 0) {
        throw new BadRequestException('Tangalaringiz yetarli emas.');
      }

      // B. Sovg'a zaxirasini (stock) 1 taga kamaytirish (Agar cheksiz bo'lmasa, ya'ni -1 ga teng bo'lmasa).
      // Shartli update: oxirgi dona bir vaqtda ikki kishiga sotilmasligi uchun.
      let stockReserved = false;
      if (reward.stock !== -1) {
        const stockDebit = await tx.reward.updateMany({
          where: { id: rewardId, stock: { gt: 0 } },
          data: {
            stock: { decrement: 1 },
          },
        });

        if (stockDebit.count > 0) {
          stockReserved = true;
        } else {
          // Shu orada admin sovg'ani cheksiz (-1) qilgan bo'lishi mumkin — unda dona ayirilmaydi
          const current = await tx.reward.findUnique({
            where: { id: rewardId },
            select: { stock: true },
          });
          if (current?.stock !== -1) {
            throw new BadRequestException(
              'Afsuski, ushbu sovg‘a omborda qolmagan.',
            );
          }
        }
      }

      const updatedWallet = await tx.wallet.findUniqueOrThrow({
        where: { id: wallet.id },
        select: { balance: true },
      });

      // C. Xarid tarixiga (`Purchase` jadvali) yangi yozuv qo'shamiz
      const purchaseRecord = await tx.purchase.create({
        data: {
          studentId,
          rewardId,
          coinSpent: reward.coinPrice,
          status: PurchaseStatus.pending, // Dastlab tasdiqlash kutish rejimida bo'ladi
          stockReserved,
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
