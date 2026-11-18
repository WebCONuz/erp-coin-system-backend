import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from 'src/generated/prisma/client';
import { CreateHolidayDto, QueryHolidayDto } from './dto/holiday.dto';
import { ScheduleService } from './schedule.service';

// Tenant bo'yicha dam olish kunlari: shu sanada jadval shablonlaridan dars yaratilmaydi,
// allaqachon yaratilgan kelajakdagi tekshirilmagan darslar o'chiriladi (o'chirilsa — qaytariladi)
@Injectable()
export class HolidaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleService: ScheduleService,
  ) {}

  async findAll(tenantId: string, query: QueryHolidayDto) {
    const where: Prisma.HolidayWhereInput = { tenantId, isDeleted: false };
    if (query.from || query.to) {
      where.date = {
        ...(query.from ? { gte: new Date(query.from.slice(0, 10)) } : {}),
        ...(query.to ? { lte: new Date(query.to.slice(0, 10)) } : {}),
      };
    }
    const data = await this.prisma.holiday.findMany({
      where,
      orderBy: { date: 'asc' },
      select: { id: true, date: true, name: true, createdAt: true },
    });
    return { data };
  }

  async create(tenantId: string, createdById: string, dto: CreateHolidayDto) {
    const date = new Date(dto.date.slice(0, 10));

    // (tenantId, date) unique — o'chirilgan yozuv bo'lsa qayta tiklanadi
    const existing = await this.prisma.holiday.findUnique({
      where: { tenantId_date: { tenantId, date } },
    });
    if (existing && !existing.isDeleted) {
      throw new ConflictException('Bu sana allaqachon dam olish kuni');
    }

    const holiday = existing
      ? await this.prisma.holiday.update({
          where: { id: existing.id },
          data: {
            name: dto.name,
            createdById,
            isDeleted: false,
            deletedAt: null,
          },
        })
      : await this.prisma.holiday.create({
          data: { tenantId, date, name: dto.name, createdById },
        });

    const [sessionSync, manualSessions] = await Promise.all([
      this.scheduleService.syncAllTemplateSessions(tenantId),
      this.countManualSessions(tenantId, date),
    ]);

    return { ...holiday, sessionSync, manualSessionsOnDate: manualSessions };
  }

  async remove(id: string, tenantId: string) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!holiday) throw new NotFoundException('Dam olish kuni topilmadi');

    await this.prisma.holiday.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    const sessionSync =
      await this.scheduleService.syncAllTemplateSessions(tenantId);
    return { message: "Dam olish kuni o'chirildi", sessionSync };
  }

  // Qo'lda yaratilgan (shablonsiz) darslar avtomatik o'chirilmaydi — admin ko'rib chiqadi
  private countManualSessions(tenantId: string, date: Date) {
    return this.prisma.session.count({
      where: {
        tenantId,
        sessionDate: date,
        isDeleted: false,
        templateId: null,
      },
    });
  }
}
