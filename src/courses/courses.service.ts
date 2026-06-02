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
        description: dto.description || '',
        tenantId,
        createdById,
      },
    });
  }

  async findAll(query: QueryCourseDto, tenantId: string) {
    const { page = 1, limit = 10, search, isActive } = query;
    const skip = (page - 1) * limit;

    // Toza Where Builder shakllantiramiz
    const where: any = {
      tenantId,
      isDeleted: false, // O'chirilganlarni mutloq ko'rsatmaymiz
    };

    // Agar isActive parametri berilgan bo'lsa (true/false), filtrlaymiz.
    // Berilmagan bo'lsa faqat faollarni ko'rsatamiz
    if (isActive !== undefined) {
      where.isActive = isActive;
    } else {
      where.isActive = true;
    }

    if (search) {
      where.title = {
        contains: search,
        mode: 'insensitive',
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }, // ID bo'yicha emas, vaqt bo'yicha tartiblash yaxshiroq indexlanadi
      }),
      this.prisma.course.count({ where }),
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
    // findUnique o'rniga findFirst ishlatildi,
    // chunki [id, tenantId] uchrashuvchi UNIQUE KEY emas.
    const course = await this.prisma.course.findFirst({
      where: { id, tenantId, isDeleted: false },
    });

    if (!course) {
      throw new NotFoundException('Kurs topilmadi yoki sizga tegishli emas');
    }

    return course;
  }

  async update(id: string, dto: UpdateCourseDto, tenantId: string) {
    if (!dto || !Object.keys(dto).length) {
      throw new BadRequestException(
        'Yangilash uchun hech qanday maydon berilmagan',
      );
    }

    // Avval kurs mavjudligi va tenantga tegishli ekanligini tekshiramiz
    await this.findOne(id, tenantId);

    return await this.prisma.course.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, tenantId: string, archiverId: string) {
    await this.findOne(id, tenantId);

    // Haqiqiy Soft-Delete prinsiplari
    const deleted = await this.prisma.course.update({
      where: { id },
      data: {
        isDeleted: true, // Sxemangizdagi asosiy flag
        isActive: false, // Guruhlar bog'lana olmasligi uchun nofaol qilamiz
        deletedAt: new Date(),
        archivedAt: new Date(),
        archivedById: archiverId,
      },
    });

    return {
      message: 'Kurs muvaffaqiyatli o‘chirildi',
      id: deleted.id,
    };
  }
}
