import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { QueryRoleDto } from './dto/query-role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateRoleDto) {
    const exists = await this.prisma.role.findUnique({
      where: { tenantId_name: { tenantId, name: dto.name } },
    });

    if (exists && !exists.isDeleted) {
      throw new ConflictException(`"${dto.name}" nomli rol allaqachon mavjud`);
    }

    return this.prisma.role.create({
      data: {
        ...dto,
        tenantId,
      },
    });
  }

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
        include: { _count: { select: { users: true } } },
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

  async update(tenantId: string, id: string, dto: UpdateRoleDto) {
    const role = await this.findOne(tenantId, id);

    if (role.name === 'creator') {
      throw new ForbiddenException("Creator roleni o'zgartirib bo'lmaydi");
    }

    if (role.isSystem) {
      throw new ConflictException("System rollar o'zgartirib bo'lmaydi");
    }

    if (dto.name && dto.name !== role.name) {
      const exists = await this.prisma.role.findUnique({
        where: { tenantId_name: { tenantId, name: dto.name } },
      });
      if (exists && !exists.isDeleted) {
        throw new ConflictException(
          `"${dto.name}" nomli rol allaqachon mavjud`,
        );
      }
    }

    return this.prisma.role.update({
      where: { id },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string) {
    const role = await this.findOne(tenantId, id);

    if (role.name === 'creator') {
      throw new ForbiddenException("Creator roleni o'zgartirib bo'lmaydi");
    }

    if (role.isSystem) {
      throw new ConflictException("System rollar o'zgartirib bo'lmaydi");
    }

    if (!role.canDelete) {
      throw new ConflictException("Bu rol o'chirib bo'lmaydi");
    }

    const usersCount = await this.prisma.user.count({
      where: { roleId: id, isDeleted: false },
    });

    if (usersCount > 0) {
      throw new ConflictException(
        `Cannot delete role: ${usersCount} user(s) are assigned to it`,
      );
    }

    return this.prisma.role.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }
}
