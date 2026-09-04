import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTenantDto) {
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) throw new ConflictException('Bu slug allaqachon mavjud');

    const data = await this.prisma.tenant.create({ data: dto });
    return {
      status: 'success',
      message: 'Successfully created',
      data,
    };
  }

  async findAll() {
    const data = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        type: true,
        isActive: true,
        createdAt: true,
        _count: { select: { users: true, groups: true } },
      },
      where: {
        NOT: { OR: [{ name: 'Asosiy tashkilot' }, { name: 'System Tenant' }] },
      },
    });

    return {
      status: 'success',
      data,
    };
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, groups: true, courses: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant topilmadi');

    return {
      status: 'success',
      data: tenant,
    };
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.findOne(id); // mavjudligini tekshirish

    if (dto.slug) {
      const existing = await this.prisma.tenant.findUnique({
        where: { slug: dto.slug },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Bu slug allaqachon mavjud');
      }
    }
    const data = await this.prisma.tenant.update({ where: { id }, data: dto });

    return {
      status: 'success',
      message: 'Successfully updated',
      data,
    };
  }

  async remove(id: string) {
    const tenant = await this.findOne(id);
    await this.prisma.tenant.delete({ where: { id } });

    return {
      status: 'success',
      message: 'Successfully deleted',
      data: tenant.data,
    };
  }

  async toggleActive(id: string) {
    const tenant = await this.findOne(id);
    await this.prisma.tenant.update({
      where: { id },
      data: { isActive: !tenant.data.isActive },
    });

    return {
      status: 'success',
      message: `Successfully ${!tenant.data.isActive ? 'archivated' : 'activated'}`,
      data: {
        ...tenant,
        isActive: !tenant.data.isActive,
      },
    };
  }
}
