import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { QueryCourseDto } from './dto/query-course.dto';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, createdById: string, dto: CreateCourseDto) {
    return this.prisma.course.create({
      data: {
        title: dto.title,
        description: dto?.description ?? '',
        tenantId,
        createdById,
      },
      include: { tenant: true, groups: true },
    });
  }

  async findAll(query: QueryCourseDto, tenantId: string) {
    const { page = 1, limit = 10, search } = query;
    const skip = (page - 1) * limit;

    // 🔍 where builder
    const where: any = { tenantId, isActive: true };
    if (search) {
      where.AND = [
        {
          title: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          id: 'desc',
        },
      }),
      this.prisma.course.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOne(id: string, tenantId: string) {
    const course = await this.prisma.course.findUnique({
      where: { tenantId, id },
    });

    if (!course) {
      throw new NotFoundException('Kurs topilmadi');
    }

    return course;
  }

  async update(id: string, dto: UpdateCourseDto, tenantId: string) {
    if (!Object.keys(dto).length) {
      throw new BadRequestException(
        'Yangilash uchun hech qanday maydon berilmagan',
      );
    }

    await this.findOne(id, tenantId);

    return await this.prisma.course.update({
      where: { id, tenantId },
      data: dto,
    });
  }

  async remove(id: string, tenantId: string, archiverId: string) {
    await this.findOne(id, tenantId);

    const deleted = await this.prisma.course.update({
      where: { id, tenantId },
      data: {
        isActive: false,
        archivedAt: new Date(),
        archivedById: archiverId,
      },
    });

    return {
      message: 'Kurs muvaffaqiyatli o‘chirildi',
      data: deleted,
    };
  }
}
