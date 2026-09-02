import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, Weekday } from 'src/generated/prisma/client';
import { SessionType } from 'src/generated/prisma/enums';
import { CreateScheduleTemplateDto } from './dto/create-schedule-template.dto';
import { UpdateScheduleTemplateDto } from './dto/update-schedule-template.dto';
import { CreateScheduleExceptionDto } from './dto/create-schedule-exception.dto';
import { GenerateSessionsDto } from './dto/generate-sessions.dto';
import { QueryScheduleDto } from './dto/query-schedule.dto';

// HH:MM solishtirish uchun yordamchi — '09:00' < '11:00' → true
const timeLt = (a: string, b: string) => a < b;
const timeOverlap = (s1: string, e1: string, s2: string, e2: string) =>
  timeLt(s1, e2) && timeLt(s2, e1);

const WEEKDAY_ORDER: Record<Weekday, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 0,
};

@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── ScheduleTemplate CRUD ─────────────────────────────────────

  async createTemplate(
    dto: CreateScheduleTemplateDto,
    resolvedTenantId: string,
    createdById: string,
  ) {
    if (!timeLt(dto.startTime, dto.endTime)) {
      throw new BadRequestException(
        "endTime startTime dan katta bo'lishi kerak",
      );
    }

    await this.checkRoomConflict(
      dto.roomId,
      dto.weekday,
      dto.startTime,
      dto.endTime,
      resolvedTenantId,
    );
    await this.checkGroupConflict(
      dto.groupId,
      dto.weekday,
      dto.startTime,
      dto.endTime,
      resolvedTenantId,
    );

    return this.prisma.scheduleTemplate.create({
      data: {
        weekday: dto.weekday,
        startTime: dto.startTime,
        endTime: dto.endTime,
        groupId: dto.groupId,
        roomId: dto.roomId,
        teacherId: dto.teacherId ?? null,
        tenantId: resolvedTenantId,
        createdById,
      },
      include: {
        group: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
      },
    });
  }

  async findAllTemplates(query: QueryScheduleDto, tenantId: string) {
    const { groupId, roomId, weekday, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ScheduleTemplateWhereInput = {
      isDeleted: false,
      tenantId,
    };
    if (groupId) where.groupId = groupId;
    if (roomId) where.roomId = roomId;
    if (weekday) where.weekday = weekday;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.scheduleTemplate.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
        select: {
          id: true,
          weekday: true,
          startTime: true,
          endTime: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          group: { select: { id: true, name: true } },
          room: { select: { id: true, name: true } },
          _count: { select: { exceptions: { where: { isDeleted: false } } } },
        },
      }),
      this.prisma.scheduleTemplate.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneTemplate(id: string, tenantId: string) {
    const template = await this.prisma.scheduleTemplate.findFirst({
      where: { id, tenantId, isDeleted: false },
      include: {
        group: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
        exceptions: {
          where: { isDeleted: false },
          orderBy: { exceptionDate: 'asc' },
        },
      },
    });
    if (!template) throw new NotFoundException('Dars jadvali topilmadi');
    return template;
  }

  async updateTemplate(
    id: string,
    tenantId: string,
    dto: UpdateScheduleTemplateDto,
  ) {
    const existing = await this.prisma.scheduleTemplate.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('Dars jadvali topilmadi');

    const newWeekday = dto.weekday ?? existing.weekday;
    const newStart = dto.startTime ?? existing.startTime;
    const newEnd = dto.endTime ?? existing.endTime;
    const newRoom = dto.roomId ?? existing.roomId;
    const newTeacher =
      'teacherId' in dto
        ? (dto.teacherId ?? null)
        : (existing.teacherId ?? null);

    if (!timeLt(newStart, newEnd)) {
      throw new BadRequestException(
        "endTime startTime dan katta bo'lishi kerak",
      );
    }

    if (dto.weekday || dto.startTime || dto.endTime || dto.roomId) {
      await this.checkRoomConflict(
        newRoom,
        newWeekday,
        newStart,
        newEnd,
        tenantId,
        id,
      );
      await this.checkGroupConflict(
        existing.groupId,
        newWeekday,
        newStart,
        newEnd,
        tenantId,
        id,
      );
    }

    return this.prisma.scheduleTemplate.update({
      where: { id },
      data: {
        weekday: newWeekday,
        startTime: newStart,
        endTime: newEnd,
        roomId: newRoom,
        teacherId: newTeacher,
      },
      include: {
        group: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
      },
    });
  }

  async removeTemplate(id: string, tenantId: string) {
    const existing = await this.prisma.scheduleTemplate.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('Dars jadvali topilmadi');

    await this.prisma.scheduleTemplate.update({
      where: { id },
      data: { isDeleted: true, isActive: false, deletedAt: new Date() },
    });
    return { message: "Dars jadvali o'chirildi" };
  }

  // ─── ScheduleException CRUD ────────────────────────────────────

  async createException(
    templateId: string,
    tenantId: string,
    dto: CreateScheduleExceptionDto,
    createdById: string,
  ) {
    const template = await this.prisma.scheduleTemplate.findFirst({
      where: { id: templateId, tenantId, isDeleted: false },
    });
    if (!template) throw new NotFoundException('Dars jadvali topilmadi');

    const existing = await this.prisma.scheduleException.findFirst({
      where: {
        templateId,
        exceptionDate: new Date(dto.exceptionDate),
        isDeleted: false,
      },
    });
    if (existing) {
      throw new ConflictException("Bu sanaga allaqachon istisno qo'yilgan");
    }

    return this.prisma.scheduleException.create({
      data: {
        templateId,
        exceptionDate: new Date(dto.exceptionDate),
        isCancelled: dto.isCancelled,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        note: dto.note ?? null,
        createdById,
      },
    });
  }

  async findExceptions(templateId: string, tenantId: string) {
    const template = await this.prisma.scheduleTemplate.findFirst({
      where: { id: templateId, tenantId, isDeleted: false },
    });
    if (!template) throw new NotFoundException('Dars jadvali topilmadi');

    return this.prisma.scheduleException.findMany({
      where: { templateId, isDeleted: false },
      orderBy: { exceptionDate: 'asc' },
    });
  }

  async updateException(
    id: string,
    tenantId: string,
    dto: Partial<CreateScheduleExceptionDto>,
  ) {
    const exc = await this.prisma.scheduleException.findFirst({
      where: { id, isDeleted: false, template: { tenantId } },
    });
    if (!exc) throw new NotFoundException('Istisno topilmadi');

    return this.prisma.scheduleException.update({
      where: { id },
      data: {
        isCancelled: dto.isCancelled ?? exc.isCancelled,
        startTime: dto.startTime ?? exc.startTime,
        endTime: dto.endTime ?? exc.endTime,
        note: dto.note ?? exc.note,
      },
    });
  }

  async removeException(id: string, tenantId: string) {
    const exc = await this.prisma.scheduleException.findFirst({
      where: { id, isDeleted: false, template: { tenantId } },
    });
    if (!exc) throw new NotFoundException('Istisno topilmadi');

    await this.prisma.scheduleException.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    return { message: "Istisno o'chirildi" };
  }

  // ─── Calendar (oylik ko'rinish) ────────────────────────────────

  async getCalendar(
    groupId: string,
    year: number,
    month: number,
    tenantId: string,
  ) {
    // O'sha oyning barcha kunlari (UTC asosida — timezone shift oldini olish uchun)
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));

    const templates = await this.prisma.scheduleTemplate.findMany({
      where: { groupId, tenantId, isDeleted: false, isActive: true },
      include: { room: { select: { id: true, name: true } } },
    });

    if (!templates.length) return {};

    const templateIds = templates.map((t) => t.id);

    const [exceptions, sessions] = await this.prisma.$transaction([
      this.prisma.scheduleException.findMany({
        where: {
          templateId: { in: templateIds },
          isDeleted: false,
          exceptionDate: { gte: start, lte: end },
        },
      }),
      this.prisma.session.findMany({
        where: {
          groupId,
          tenantId,
          isDeleted: false,
          sessionDate: { gte: start, lte: end },
        },
        select: {
          id: true,
          sessionDate: true,
          startTime: true,
          endTime: true,
          isLocked: true,
          sessionType: true,
          topic: true,
        },
      }),
    ]);

    const exceptionMap = new Map(
      exceptions.map((e) => [
        `${e.templateId}_${e.exceptionDate.toISOString().split('T')[0]}`,
        e,
      ]),
    );

    const sessionMap = new Map<string, (typeof sessions)[0][]>();
    for (const s of sessions) {
      const key = s.sessionDate.toISOString().split('T')[0];
      if (!sessionMap.has(key)) sessionMap.set(key, []);
      sessionMap.get(key)!.push(s);
    }

    const calendar: Record<string, unknown> = {};

    // Oydagi har bir kunga aylanish (UTC metodlari — getDay/getDate local time xatosini oldini oladi)
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const jsDay = d.getUTCDay(); // 0=Sunday, 1=Monday...
      const weekday = Object.entries(WEEKDAY_ORDER).find(
        ([, v]) => v === jsDay,
      )?.[0] as Weekday | undefined;

      if (!weekday) continue;

      const dayTemplates = templates.filter((t) => t.weekday === weekday);
      if (!dayTemplates.length) continue;

      calendar[dateStr] = dayTemplates.map((template) => {
        const exc = exceptionMap.get(`${template.id}_${dateStr}`) ?? null;
        // Exception vaqt o'zgartirgan bo'lsa shu startTime, aks holda template vaqti
        const effectiveStartTime = exc?.startTime ?? template.startTime;
        const matchedSession = (sessionMap.get(dateStr) ?? []).find(
          (s) => s.startTime === effectiveStartTime,
        );
        return {
          template: {
            id: template.id,
            weekday: template.weekday,
            startTime: template.startTime,
            endTime: template.endTime,
            room: template.room,
          },
          exception: exc
            ? {
                id: exc.id,
                isCancelled: exc.isCancelled,
                startTime: exc.startTime,
                endTime: exc.endTime,
                note: exc.note,
              }
            : null,
          session: matchedSession ?? null,
        };
      });
    }

    return calendar;
  }

  // ─── Talabaning o'z kalendari (barcha faol guruhlari birlashtirilgan) ──
  async getMyCalendar(
    studentId: string,
    year: number,
    month: number,
    tenantId: string,
  ) {
    const memberships = await this.prisma.groupStudent.findMany({
      where: {
        studentId,
        isDeleted: false,
        group: { tenantId, isDeleted: false },
      },
      select: { groupId: true, group: { select: { name: true } } },
    });

    if (!memberships.length) return {};

    const merged: Record<
      string,
      Array<Record<string, unknown> & { group: { id: string; name: string } }>
    > = {};

    for (const m of memberships) {
      const groupCalendar = await this.getCalendar(
        m.groupId,
        year,
        month,
        tenantId,
      );

      for (const [dateStr, entries] of Object.entries(groupCalendar)) {
        if (!merged[dateStr]) merged[dateStr] = [];
        for (const entry of entries as Record<string, unknown>[]) {
          merged[dateStr].push({
            ...entry,
            group: { id: m.groupId, name: m.group.name },
          });
        }
      }
    }

    return merged;
  }

  // ─── Sessiyalarni generatsiya qilish ──────────────────────────

  async generateSessions(
    dto: GenerateSessionsDto,
    tenantId: string,
    _createdById: string,
  ) {
    const from = new Date(dto.fromDate);
    const to = new Date(dto.toDate);

    if (from > to) {
      throw new BadRequestException("fromDate toDate dan oldin bo'lishi kerak");
    }

    const group = await this.prisma.group.findFirst({
      where: { id: dto.groupId, tenantId, isDeleted: false },
      select: { id: true, teacherId: true },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    const templates = await this.prisma.scheduleTemplate.findMany({
      where: {
        groupId: dto.groupId,
        tenantId,
        isDeleted: false,
        isActive: true,
      },
    });

    if (!templates.length) {
      throw new NotFoundException('Bu guruh uchun faol dars jadvali topilmadi');
    }

    const templateIds = templates.map((t) => t.id);

    const exceptions = await this.prisma.scheduleException.findMany({
      where: {
        templateId: { in: templateIds },
        isDeleted: false,
        exceptionDate: { gte: from, lte: to },
      },
    });

    // (templateId, date) → exception map
    const exceptionMap = new Map(
      exceptions.map((e) => [
        `${e.templateId}_${e.exceptionDate.toISOString().split('T')[0]}`,
        e,
      ]),
    );

    // Mavjud sessiyalarni olish (duplikat yaratmaslik uchun)
    const existingSessions = await this.prisma.session.findMany({
      where: {
        groupId: dto.groupId,
        tenantId,
        isDeleted: false,
        sessionDate: { gte: from, lte: to },
      },
      select: { sessionDate: true, startTime: true },
    });

    const existingSet = new Set(
      existingSessions.map(
        (s) => `${s.sessionDate.toISOString().split('T')[0]}_${s.startTime}`,
      ),
    );

    const toCreate: Prisma.SessionCreateManyInput[] = [];
    let cancelledCount = 0;

    for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const jsDay = d.getUTCDay();
      const weekday = Object.entries(WEEKDAY_ORDER).find(
        ([, v]) => v === jsDay,
      )?.[0] as Weekday | undefined;

      if (!weekday) continue;

      const dayTemplates = templates.filter((t) => t.weekday === weekday);

      for (const template of dayTemplates) {
        const exc = exceptionMap.get(`${template.id}_${dateStr}`);

        if (exc?.isCancelled) {
          cancelledCount++;
          continue;
        }

        const startTime = exc?.startTime ?? template.startTime;
        const endTime = exc?.endTime ?? template.endTime;

        if (existingSet.has(`${dateStr}_${startTime}`)) continue;

        toCreate.push({
          sessionDate: new Date(dateStr),
          startTime,
          endTime,
          sessionType: SessionType.lesson,
          groupId: dto.groupId,
          roomId: template.roomId,
          // template da o'qituvchi biriktirilgan bo'lsa shu, aks holda guruh o'qituvchisi
          teacherId: template.teacherId ?? group.teacherId,
          tenantId,
        });
      }
    }

    let created = 0;
    if (toCreate.length > 0) {
      const result = await this.prisma.session.createMany({ data: toCreate });
      created = result.count;
    }

    return {
      message: 'Sessiyalar muvaffaqiyatli yaratildi',
      created,
      skipped: existingSessions.length,
      cancelled: cancelledCount,
    };
  }

  // ─── Private: Conflict detection ──────────────────────────────

  private async checkRoomConflict(
    roomId: string,
    weekday: Weekday,
    startTime: string,
    endTime: string,
    tenantId: string,
    excludeId?: string,
  ) {
    const conflicts = await this.prisma.scheduleTemplate.findMany({
      where: {
        roomId,
        weekday,
        tenantId,
        isDeleted: false,
        isActive: true,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        group: { select: { name: true } },
      },
    });

    for (const c of conflicts) {
      if (timeOverlap(startTime, endTime, c.startTime, c.endTime)) {
        throw new ConflictException(
          `Bu xona ${weekday} kuni ${c.startTime}–${c.endTime} orasida "${c.group.name}" guruhiga band`,
        );
      }
    }
  }

  private async checkGroupConflict(
    groupId: string,
    weekday: Weekday,
    startTime: string,
    endTime: string,
    tenantId: string,
    excludeId?: string,
  ) {
    const conflicts = await this.prisma.scheduleTemplate.findMany({
      where: {
        groupId,
        weekday,
        tenantId,
        isDeleted: false,
        isActive: true,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true, startTime: true, endTime: true },
    });

    for (const c of conflicts) {
      if (timeOverlap(startTime, endTime, c.startTime, c.endTime)) {
        throw new ConflictException(
          `Bu guruhning ${weekday} kuni ${c.startTime}–${c.endTime} da dars vaqti bilan to'qnashmoqda`,
        );
      }
    }
  }
}
