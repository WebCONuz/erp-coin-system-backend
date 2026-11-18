import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { archivedName } from '../common/utils/soft-delete-unique';

const CATEGORY_NAME_MAX = 100;
import { CreateRewardCategoryDto } from './dto/create-reward-category.dto';
import { UpdateRewardCategoryDto } from './dto/update-reward-category.dto';
import { QueryRewardCategoryDto } from './dto/query-reward-category.dto';

@Injectable()
export class RewardCategoryService {
  constructor(private prisma: PrismaService) {}

  async create(
    tenantId: string,
    createdById: string,
    dto: CreateRewardCategoryDto,
  ) {
    await this.assertNameFree(tenantId, dto.name);

    return this.prisma.rewardCategory.create({
      data: { ...dto, tenantId, createdById },
    });
  }

  async findAll(query: QueryRewardCategoryDto, tenantId: string) {
    const { isActive } = query;
    const where = {
      tenantId,
      isDeleted: false,
      isActive: isActive === false ? false : true,
    };

    return this.prisma.rewardCategory.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { rewards: { where: { isDeleted: false } } } },
      },
    });
  }

  async findOne(id: string, tenantId: string) {
    const category = await this.prisma.rewardCategory.findFirst({
      where: { id, tenantId, isDeleted: false },
      include: {
        _count: { select: { rewards: { where: { isDeleted: false } } } },
      },
    });
    if (!category) throw new NotFoundException('Kategoriya topilmadi');
    return category;
  }

  async update(id: string, tenantId: string, dto: UpdateRewardCategoryDto) {
    await this.findOne(id, tenantId);

    if (dto.name) await this.assertNameFree(tenantId, dto.name, id);

    return this.prisma.rewardCategory.update({ where: { id }, data: dto });
  }

  async remove(id: string, tenantId: string) {
    const category = await this.findOne(id, tenantId);

    if (category._count.rewards > 0) {
      throw new ConflictException(
        `Bu kategoriyaga ${category._count.rewards} ta reward bog'liq. Avval ularni o'chiring.`,
      );
    }

    // Real DELETE emas — soft delete (loyiha qoidasi). Nom yangi kategoriya uchun bo'shatiladi
    return this.prisma.rewardCategory.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false,
        deletedAt: new Date(),
        name: archivedName(category.name, id, CATEGORY_NAME_MAX),
      },
    });
  }

  // Faol kategoriya shu nomni band qilsa — 409; o'chirilgan bo'lsa — nomi bo'shatiladi
  private async assertNameFree(
    tenantId: string,
    name: string,
    excludeId?: string,
  ) {
    const existing = await this.prisma.rewardCategory.findUnique({
      where: { tenantId_name: { tenantId, name } },
      select: { id: true, isDeleted: true },
    });
    if (!existing || existing.id === excludeId) return;
    if (!existing.isDeleted) {
      throw new ConflictException('Bu nomli kategoriya allaqachon mavjud');
    }
    await this.prisma.rewardCategory.update({
      where: { id: existing.id },
      data: { name: archivedName(name, existing.id, CATEGORY_NAME_MAX) },
    });
  }
}
