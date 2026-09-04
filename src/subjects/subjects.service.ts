import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { QuerySubjectDto } from './dto/query-subject.dto';
import { Prisma } from 'src/generated/prisma/client';

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, createdById: string, dto: CreateSubjectDto) {
    return this.prisma.subject.create({
      data: {
        name: dto.name,
        description: dto.description || '',
        tenantId,
        createdById,
      },
    });
  }

  async findAll(query: QuerySubjectDto, tenantId: string) {
    const { page = 1, limit = 10, search, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SubjectWhereInput = {
      tenantId,
      isDeleted: false,
    };

    if (isActive !== undefined) {
      where.isActive = isActive;
    } else {
      where.isActive = true;
    }

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.subject.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.subject.count({ where }),
    ]);

    return {
      status: 'success',
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
    const subject = await this.prisma.subject.findFirst({
      where: { id, tenantId, isDeleted: false },
    });

    if (!subject) {
      throw new NotFoundException('Fan topilmadi yoki sizga tegishli emas');
    }

    return subject;
  }

  async update(id: string, dto: UpdateSubjectDto, tenantId: string) {
    if (!dto || !Object.keys(dto).length) {
      throw new BadRequestException(
        'Yangilash uchun hech qanday maydon berilmagan',
      );
    }

    await this.findOne(id, tenantId);

    return await this.prisma.subject.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, tenantId: string, archiverId: string) {
    await this.findOne(id, tenantId);

    const deleted = await this.prisma.subject.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false,
        deletedAt: new Date(),
        archivedAt: new Date(),
        archivedById: archiverId,
      },
    });

    return {
      message: 'Fan muvaffaqiyatli o‘chirildi',
      id: deleted.id,
    };
  }
}
