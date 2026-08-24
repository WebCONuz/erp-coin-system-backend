import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { QueryRoomDto } from './dto/query-room.dto';
import { Prisma } from 'src/generated/prisma/client';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateRoomDto) {
    return this.prisma.room.create({
      data: {
        name: dto.name,
        capacity: dto.capacity,
        description: dto.description || '',
        tenantId,
      },
    });
  }

  async findAll(query: QueryRoomDto, tenantId: string) {
    const { page = 1, limit = 10, search, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.RoomWhereInput = {
      tenantId,
      isDeleted: false, // O'chirilgan xonalarni mutloq ko'rsatmaymiz
    };

    if (isActive !== undefined) {
      where.isActive = isActive;
    } else {
      where.isActive = true; // Default holatda faqat aktiv xonalar
    }

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.room.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' }, // Xonalar alifbo tartibida chiroyli ko'rinadi
      }),
      this.prisma.room.count({ where }),
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
    // Prisma xavfsizligi: faqat berilgan tenant va o'chirilmagan xonani qidiramiz
    const room = await this.prisma.room.findFirst({
      where: { id, tenantId, isDeleted: false },
    });

    if (!room) {
      throw new NotFoundException(
        'Xona topilmadi yoki ushbu Tenantga tegishli emas',
      );
    }

    return room;
  }

  async update(id: string, dto: UpdateRoomDto, tenantId: string) {
    if (!dto || !Object.keys(dto).length) {
      throw new BadRequestException(
        'Yangilash uchun hech qanday ma’lumot berilmagan',
      );
    }

    // Xona mavjudligini tekshirish
    await this.findOne(id, tenantId);

    return this.prisma.room.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);

    // Xonani o'chirishdan oldin unda dars jadvali bor-yo'qligini tekshirish foydali (Biznes logika)
    const activeSchedules = await this.prisma.scheduleTemplate.count({
      where: { roomId: id, isDeleted: false },
    });

    if (activeSchedules > 0) {
      throw new BadRequestException(
        'Ushbu xonani o‘chira olmaysiz, chunki unga biriktirilgan dars jadvallari mavjud!',
      );
    }

    // Soft-Delete amali
    const deletedRoom = await this.prisma.room.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false,
        deletedAt: new Date(),
      },
    });

    return {
      message: 'Xona muvaffaqiyatli arxivlandi',
      id: deletedRoom.id,
    };
  }
}
