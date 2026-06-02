import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRewardCategoryDto } from './dto/create-reward-category.dto';
import { UpdateRewardCategoryDto } from './dto/update-reward-category.dto';

@Injectable()
export class RewardCategoryService {
  constructor(private prisma: PrismaService) {}

  async create(
    tenantId: string,
    createdById: string,
    dto: CreateRewardCategoryDto,
  ) {
    const existing = await this.prisma.rewardCategory.findUnique({
      where: { tenantId_name: { tenantId, name: dto.name } },
    });
    if (existing)
      throw new ConflictException('Bu kategoriya allaqachon mavjud');

    return this.prisma.rewardCategory.create({
      data: { ...dto, tenantId, createdById },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.rewardCategory.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { rewards: true } },
      },
    });
  }

  async findOne(id: string, tenantId: string) {
    const category = await this.prisma.rewardCategory.findFirst({
      where: { id, tenantId },
      include: {
        _count: { select: { rewards: true } },
      },
    });
    if (!category) throw new NotFoundException('Kategoriya topilmadi');
    return category;
  }

  async update(id: string, tenantId: string, dto: UpdateRewardCategoryDto) {
    await this.findOne(id, tenantId);

    if (dto.name) {
      const existing = await this.prisma.rewardCategory.findUnique({
        where: { tenantId_name: { tenantId, name: dto.name } },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Bu nom allaqachon mavjud');
      }
    }

    return this.prisma.rewardCategory.update({ where: { id }, data: dto });
  }

  async remove(id: string, tenantId: string) {
    const category = await this.findOne(id, tenantId);

    if (category._count.rewards > 0) {
      throw new ConflictException(
        `Bu kategoriyaga ${category._count.rewards} ta reward bog'liq. Avval ularni o'chiring.`,
      );
    }

    return this.prisma.rewardCategory.delete({ where: { id } });
  }
}
