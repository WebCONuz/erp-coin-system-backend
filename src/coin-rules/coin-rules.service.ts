import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCoinRuleDto } from './dto/create-coin-rule.dto';
import { QueryCoinRuleDto } from './dto/query-coin-rule.dto';
import { UpdateCoinRuleDto } from './dto/update-coin-rule.dto';
import { Prisma } from 'src/generated/prisma/client';

@Injectable()
export class CoinRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, createdById: string, dto: CreateCoinRuleDto) {
    return this.prisma.coinRule.create({
      data: {
        name: dto.name,
        description: dto.description || null,
        coinAmount: dto.coinAmount,
        direction: dto.direction,
        triggerType: dto.triggerType,
        groupId: dto.groupId || null,
        tenantId,
        createdById,
      },
    });
  }

  async findAll(query: QueryCoinRuleDto, tenantId: string) {
    const {
      page = 1,
      limit = 10,
      search,
      triggerType,
      direction,
      groupId,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CoinRuleWhereInput = {
      tenantId,
      isDeleted: false,
      isActive: true,
    };

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    if (triggerType) {
      where.triggerType = triggerType;
    }

    if (direction) {
      where.direction = direction;
    }

    if (groupId) {
      where.groupId = groupId;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.coinRule.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          coinAmount: true,
          direction: true,
          triggerType: true,
          group: { select: { name: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.coinRule.count({ where }),
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
    const coinRule = await this.prisma.coinRule.findFirst({
      where: { id, tenantId, isDeleted: false },
      select: {
        id: true,
        name: true,
        description: true,
        coinAmount: true,
        direction: true,
        triggerType: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        group: { select: { name: true } },
        createdBy: { select: { fullName: true } },
      },
    });

    if (!coinRule) {
      throw new NotFoundException('Tanga qoidasi topilmadi');
    }
    return coinRule;
  }

  async update(id: string, dto: UpdateCoinRuleDto, tenantId: string) {
    await this.findOne(id, tenantId);

    return this.prisma.coinRule.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        name: true,
        description: true,
        coinAmount: true,
        direction: true,
        triggerType: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        group: { select: { name: true } },
        createdBy: { select: { fullName: true } },
      },
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);

    return this.prisma.coinRule.update({
      where: { id },
      data: { isDeleted: true, isActive: false, deletedAt: new Date() },
    });
  }
}
