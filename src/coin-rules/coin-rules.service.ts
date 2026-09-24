import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCoinRuleDto } from './dto/create-coin-rule.dto';
import { QueryCoinRuleDto } from './dto/query-coin-rule.dto';
import { UpdateCoinRuleDto } from './dto/update-coin-rule.dto';
import { Prisma } from 'src/generated/prisma/client';
import {
  CoinDirection,
  SourceType,
  TriggerType,
} from 'src/generated/prisma/enums';
import { BUILT_IN_LOCKED_FIELDS } from './constants';

@Injectable()
export class CoinRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, createdById: string, dto: CreateCoinRuleDto) {
    await this.assertNoDuplicateTenantWideAutoRule(tenantId, {
      triggerType: dto.triggerType,
      sourceType: dto.sourceType ?? null,
      direction: dto.direction,
      groupId: dto.groupId || null,
    });

    return this.prisma.coinRule.create({
      data: {
        name: dto.name,
        description: dto.description || null,
        coinAmount: dto.coinAmount,
        direction: dto.direction,
        triggerType: dto.triggerType,
        sourceType: dto.sourceType || null,
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
      isActive,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CoinRuleWhereInput = {
      tenantId,
      isDeleted: false,
    };

    if (isActive !== undefined) {
      where.isActive = isActive;
    } else {
      where.isActive = true;
    }

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
        orderBy: [{ isBuiltIn: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          name: true,
          description: true,
          coinAmount: true,
          direction: true,
          isActive: true,
          triggerType: true,
          sourceType: true,
          isBuiltIn: true,
          group: { select: { name: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.coinRule.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
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
        sourceType: true,
        isBuiltIn: true,
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
    const rule = await this.findRawOrFail(id, tenantId);

    // Asosiy qoidada yo'qlama logikasi tayanadigan maydonlar o'zgarmaydi.
    // Frontend butun formani yuborishi mumkin — shuning uchun faqat qiymati
    // haqiqatan o'zgargan maydonlar rad etiladi.
    if (rule.isBuiltIn) {
      const changed = BUILT_IN_LOCKED_FIELDS.filter(
        (field) =>
          dto[field] !== undefined && (dto[field] || null) !== rule[field],
      );
      if (changed.length > 0) {
        throw new ConflictException(
          `Asosiy qoidada quyidagi maydonlarni o'zgartirib bo'lmaydi: ${changed.join(', ')}`,
        );
      }
    }

    await this.assertNoDuplicateTenantWideAutoRule(
      tenantId,
      {
        triggerType: dto.triggerType ?? rule.triggerType,
        sourceType:
          dto.sourceType !== undefined
            ? dto.sourceType || null
            : rule.sourceType,
        direction: dto.direction ?? rule.direction,
        groupId: dto.groupId !== undefined ? dto.groupId || null : rule.groupId,
      },
      id,
    );

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
        sourceType: true,
        isBuiltIn: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        group: { select: { name: true } },
        createdBy: { select: { fullName: true } },
      },
    });
  }

  async remove(id: string, tenantId: string) {
    const rule = await this.findRawOrFail(id, tenantId);

    if (rule.isBuiltIn) {
      throw new ConflictException(
        "Asosiy qoidani o'chirib bo'lmaydi — faqat coin miqdorini o'zgartirish mumkin",
      );
    }

    return this.prisma.coinRule.update({
      where: { id },
      data: { isDeleted: true, isActive: false, deletedAt: new Date() },
    });
  }

  private async findRawOrFail(id: string, tenantId: string) {
    const rule = await this.prisma.coinRule.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!rule) throw new NotFoundException('Tanga qoidasi topilmadi');
    return rule;
  }

  // Yo'qlamada tenant-wide (groupId: null) auto qoida sourceType + direction bo'yicha
  // tanlanadi — bir xil kombinatsiyadan ikkitasi bo'lsa, qaysi biri ishlashi tasodifiy.
  // Shuning uchun har bir kombinatsiya uchun bittadan ortiq ruxsat berilmaydi.
  // Guruhga xos qoidalar (groupId bilan) bu cheklovga kirmaydi.
  private async assertNoDuplicateTenantWideAutoRule(
    tenantId: string,
    rule: {
      triggerType: TriggerType;
      sourceType: SourceType | null;
      direction: CoinDirection;
      groupId: string | null;
    },
    excludeId?: string,
  ) {
    if (
      rule.triggerType !== TriggerType.auto ||
      rule.groupId !== null ||
      rule.sourceType === null
    ) {
      return;
    }

    const duplicate = await this.prisma.coinRule.findFirst({
      where: {
        tenantId,
        isDeleted: false,
        triggerType: TriggerType.auto,
        groupId: null,
        sourceType: rule.sourceType,
        direction: rule.direction,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true, name: true },
    });

    if (duplicate) {
      throw new ConflictException(
        `Bu tenantda "${rule.sourceType}/${rule.direction}" uchun umumiy avtomatik qoida allaqachon mavjud ("${duplicate.name}"). ` +
          "Uni tahrirlang yoki yangi qoidani ma'lum bir guruhga (groupId) bog'lang",
      );
    }
  }
}
