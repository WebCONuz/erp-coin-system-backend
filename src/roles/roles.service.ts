import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryRoleDto } from './dto/query-role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  // faqat isDeleted: true bo'lganlarni emas, balki hamma rollarni qaytaradi
  async findAll(tenantId: string, query: QueryRoleDto) {
    const { search, scope, isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      isDeleted: false,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { displayName: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
      ...(scope !== undefined && { scope }),
      ...(isActive !== undefined && { isActive }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        skip,
        take: limit,
        orderBy: { level: 'asc' },
        select: {
          id: true,
          name: true,
          displayName: true,
          level: true,
          scope: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          tenantId: true,
        },
      }),
      this.prisma.role.count({ where }),
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

  async findOne(tenantId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId, isDeleted: false },
      include: {
        permissions: true,
        _count: { select: { users: true } },
      },
    });

    if (!role) throw new NotFoundException('Rol topilmadi');
    return role;
  }
}
