import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, Weekday } from 'src/generated/prisma/client';
import { SessionType } from 'src/generated/prisma/enums';
import { CreateScheduleTemplateDto } from './dto/create-schedule-template.dto';
import { UpdateScheduleTemplateDto } from './dto/update-schedule-template.dto';
import { CreateScheduleExceptionDto } from './dto/create-schedule-exception.dto';
import { GenerateSessionsDto } from './dto/generate-sessions.dto';
import { QueryScheduleDto } from './dto/query-schedule.dto';
import {
  canTeacherAccessGroup,
  teacherGroupAccessWhere,
} from 'src/common/utils/teacher-group-access';
import {
  diffDays,
  getTenantTimezone,
  nowInTimeZone,
  toDateString,
} from 'src/common/utils/tenant-time';
import {
  ConflictKind,
  findSessionConflict,
  lockTenantSchedule,
  timeOverlap,
} from 'src/sessions/utils/session-conflicts';

// HH:MM solishtirish uchun yordamchi — '09:00' < '11:00' → true (format DTO'da qat'iy HH:MM)
const timeLt = (a: string, b: string) => a < b;

// Bitta generate-sessions so'rovida ko'pi bilan shuncha kun (≈ bir chorak)
export const MAX_GENERATE_DAYS = 92;

// Shablon + istisno bo'yicha hisoblangan bitta dars
interface Occurrence {
  templateId: string;
  date: string;
  startTime: string;
  endTime: string;
  roomId: string;
  teacherId: string;
  subjectId: string | null;
}

export interface ScheduleSlotConflict {
  date: string;
  startTime: string;
  endTime: string;
  kind: ConflictKind;
  groupName: string;
}

export interface SessionSyncResult {
  updated: number;
  removed: number;
  created: number;
  conflicts: ScheduleSlotConflict[];
}

type TemplateForOccurrence = {
  id: string;
  weekday: Weekday;
  startTime: string;
  endTime: string;
  roomId: string;
  teacherId: string | null;
  subjectId: string | null;
  validFrom: Date | null;
  validTo: Date | null;
};

// 'YYYY-MM-DD' | null | undefined → Date | null | undefined (undefined — o'zgarmaydi)
const toDateOrNull = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : new Date(v.slice(0, 10));

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

  // Teacher shu guruhga kira oladimi (asosiy o'qituvchi / sessiya / jadval orqali)
  private teacherCanAccess(
    groupId: string,
    tenantId: string,
    requesterId?: string,
  ) {
    if (!requesterId) return Promise.resolve(false);
    return canTeacherAccessGroup(this.prisma, groupId, requesterId, tenantId);
  }

  // Shablonda o'z teacheri belgilanmagan bo'lsa, guruh teacheriga tushadi
  // (generate-sessions'dagi bilan bir xil fallback mantiq)
  private withEffectiveTeacher<
    T extends {
      teacher: { id: string; fullName: string } | null;
      group: { teacher: { id: string; fullName: string } };
    },
  >(row: T): T {
    return { ...row, teacher: row.teacher ?? row.group.teacher };
  }

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

    const validFrom = toDateOrNull(dto.validFrom) ?? null;
    const validTo = toDateOrNull(dto.validTo) ?? null;
    this.assertValidity(validFrom, validTo);

    const group = await this.assertTemplateRefs(resolvedTenantId, {
      groupId: dto.groupId,
      roomId: dto.roomId,
      teacherId: dto.teacherId,
      subjectId: dto.subjectId,
    });

    await this.checkTemplateConflicts({
      tenantId: resolvedTenantId,
      weekday: dto.weekday,
      startTime: dto.startTime,
      endTime: dto.endTime,
      groupId: dto.groupId,
      roomId: dto.roomId,
      teacherId: dto.teacherId ?? group.teacherId,
      validFrom,
      validTo,
    });

    const created = await this.prisma.scheduleTemplate.create({
      data: {
        weekday: dto.weekday,
        startTime: dto.startTime,
        endTime: dto.endTime,
        groupId: dto.groupId,
        roomId: dto.roomId,
        teacherId: dto.teacherId ?? null,
        subjectId: dto.subjectId ?? null,
        validFrom,
        validTo,
        tenantId: resolvedTenantId,
        createdById,
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            teacher: { select: { id: true, fullName: true } },
          },
        },
        room: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, fullName: true } },
      },
    });

    return this.withEffectiveTeacher(created);
  }

  async findAllTemplates(
    query: QueryScheduleDto,
    tenantId: string,
    requesterRole?: string,
    requesterId?: string,
  ) {
    const { groupId, roomId, weekday, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ScheduleTemplateWhereInput = {
      isDeleted: false,
      tenantId,
    };
    if (groupId) where.groupId = groupId;
    if (roomId) where.roomId = roomId;
    if (weekday) where.weekday = weekday;

    // Teacher o'zi dars beradigan va unga sessiya/jadval biriktirilgan guruhlar jadvalini ko'radi
    if (requesterRole === 'teacher' && requesterId) {
      where.group = teacherGroupAccessWhere(requesterId);
    }

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
          group: {
            select: {
              id: true,
              name: true,
              teacher: { select: { id: true, fullName: true } },
            },
          },
          room: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          teacher: { select: { id: true, fullName: true } },
          _count: { select: { exceptions: { where: { isDeleted: false } } } },
        },
      }),
      this.prisma.scheduleTemplate.count({ where }),
    ]);

    return {
      data: data.map((t) => this.withEffectiveTeacher(t)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneTemplate(
    id: string,
    tenantId: string,
    requesterRole?: string,
    requesterId?: string,
  ) {
    const template = await this.prisma.scheduleTemplate.findFirst({
      where: { id, tenantId, isDeleted: false },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            teacherId: true,
            teacher: { select: { id: true, fullName: true } },
          },
        },
        room: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, fullName: true } },
        exceptions: {
          where: { isDeleted: false },
          orderBy: { exceptionDate: 'asc' },
        },
      },
    });
    if (!template) throw new NotFoundException('Dars jadvali topilmadi');

    if (
      requesterRole === 'teacher' &&
      !(await this.teacherCanAccess(template.groupId, tenantId, requesterId))
    ) {
      throw new ForbiddenException("Siz bu dars jadvalini ko'ra olmaysiz");
    }

    return this.withEffectiveTeacher(template);
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
    const newSubject =
      'subjectId' in dto
        ? (dto.subjectId ?? null)
        : (existing.subjectId ?? null);

    if (!timeLt(newStart, newEnd)) {
      throw new BadRequestException(
        "endTime startTime dan katta bo'lishi kerak",
      );
    }

    const fromInput = toDateOrNull(dto.validFrom);
    const toInput = toDateOrNull(dto.validTo);
    const newValidFrom =
      fromInput === undefined ? existing.validFrom : fromInput;
    const newValidTo = toInput === undefined ? existing.validTo : toInput;
    this.assertValidity(newValidFrom, newValidTo);

    const group = await this.assertTemplateRefs(tenantId, {
      groupId: existing.groupId,
      roomId: dto.roomId,
      teacherId: dto.teacherId ?? undefined,
      subjectId: dto.subjectId ?? undefined,
    });

    await this.checkTemplateConflicts({
      tenantId,
      weekday: newWeekday,
      startTime: newStart,
      endTime: newEnd,
      groupId: existing.groupId,
      roomId: newRoom,
      teacherId: newTeacher ?? group.teacherId,
      validFrom: newValidFrom,
      validTo: newValidTo,
      excludeId: id,
    });

    const updated = await this.prisma.scheduleTemplate.update({
      where: { id },
      data: {
        weekday: newWeekday,
        startTime: newStart,
        endTime: newEnd,
        roomId: newRoom,
        teacherId: newTeacher,
        subjectId: newSubject,
        validFrom: newValidFrom,
        validTo: newValidTo,
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            teacher: { select: { id: true, fullName: true } },
          },
        },
        room: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, fullName: true } },
      },
    });

    // Kelajakdagi tekshirilmagan sessiyalar yangi jadvalga moslashtiriladi
    const sessionSync = await this.syncTemplateSessions(id, tenantId);

    return { ...this.withEffectiveTeacher(updated), sessionSync };
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

    // Shu shablondan yaratilgan kelajakdagi tekshirilmagan sessiyalar o'chiriladi
    const sessionSync = await this.syncTemplateSessions(id, tenantId);

    return { message: "Dars jadvali o'chirildi", sessionSync };
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

    await this.assertExceptionChange(tenantId, {
      isCancelled: dto.isCancelled,
      startTime: dto.startTime,
      endTime: dto.endTime,
      roomId: dto.roomId,
      teacherId: dto.teacherId,
    });

    const exceptionDate = new Date(dto.exceptionDate.slice(0, 10));

    // DB'da (templateId, exceptionDate) unique — o'chirilgan istisno ham joyni band qiladi,
    // shuning uchun o'chirilgan bo'lsa u qayta tiklanadi (avval 500/409 xato berardi)
    const existing = await this.prisma.scheduleException.findUnique({
      where: { templateId_exceptionDate: { templateId, exceptionDate } },
    });
    if (existing && !existing.isDeleted) {
      throw new ConflictException("Bu sanaga allaqachon istisno qo'yilgan");
    }

    const data = {
      isCancelled: dto.isCancelled,
      startTime: dto.isCancelled ? null : (dto.startTime ?? null),
      endTime: dto.isCancelled ? null : (dto.endTime ?? null),
      roomId: dto.isCancelled ? null : (dto.roomId ?? null),
      teacherId: dto.isCancelled ? null : (dto.teacherId ?? null),
      note: dto.note ?? null,
      createdById,
    };

    const exception = existing
      ? await this.prisma.scheduleException.update({
          where: { id: existing.id },
          data: { ...data, isDeleted: false, deletedAt: null },
        })
      : await this.prisma.scheduleException.create({
          data: { templateId, exceptionDate, ...data },
        });

    const sessionSync = await this.syncTemplateSessions(templateId, tenantId);
    return { ...exception, sessionSync };
  }

  // Bekor qilinmagan istisno nimanidir o'zgartirishi kerak: vaqt (startTime+endTime birga),
  // xona yoki o'qituvchi. Xona/o'qituvchi shu tenantga tegishli bo'lishi shart.
  private async assertExceptionChange(
    tenantId: string,
    change: {
      isCancelled: boolean;
      startTime?: string | null;
      endTime?: string | null;
      roomId?: string | null;
      teacherId?: string | null;
    },
  ) {
    if (change.isCancelled) return;
    const { startTime, endTime, roomId, teacherId } = change;

    if (!!startTime !== !!endTime) {
      throw new BadRequestException(
        "Vaqt o'zgarsa startTime va endTime birga berilishi kerak",
      );
    }
    if (startTime && endTime && !timeLt(startTime, endTime)) {
      throw new BadRequestException(
        "endTime startTime dan katta bo'lishi kerak",
      );
    }
    if (!startTime && !roomId && !teacherId) {
      throw new BadRequestException(
        "Bekor qilinmagan istisnoda yangi vaqt, xona yoki o'qituvchi berilishi kerak",
      );
    }

    const [room, teacher] = await Promise.all([
      roomId
        ? this.prisma.room.findFirst({
            where: { id: roomId, tenantId, isDeleted: false },
            select: { id: true },
          })
        : true,
      teacherId
        ? this.prisma.user.findFirst({
            where: {
              id: teacherId,
              tenantId,
              isDeleted: false,
              isActive: true,
              role: { name: { in: ['teacher', 'admin'] } },
            },
            select: { id: true },
          })
        : true,
    ]);
    if (!room) throw new NotFoundException('Xona topilmadi');
    if (!teacher) throw new NotFoundException("O'qituvchi topilmadi");
  }

  async findExceptions(
    templateId: string,
    tenantId: string,
    requesterRole?: string,
    requesterId?: string,
  ) {
    const template = await this.prisma.scheduleTemplate.findFirst({
      where: { id: templateId, tenantId, isDeleted: false },
      include: { group: { select: { teacherId: true } } },
    });
    if (!template) throw new NotFoundException('Dars jadvali topilmadi');

    if (
      requesterRole === 'teacher' &&
      !(await this.teacherCanAccess(template.groupId, tenantId, requesterId))
    ) {
      throw new ForbiddenException("Siz bu dars jadvalini ko'ra olmaysiz");
    }

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

    const isCancelled = dto.isCancelled ?? exc.isCancelled;
    const startTime = isCancelled ? null : (dto.startTime ?? exc.startTime);
    const endTime = isCancelled ? null : (dto.endTime ?? exc.endTime);
    const roomId = isCancelled
      ? null
      : 'roomId' in dto
        ? (dto.roomId ?? null)
        : exc.roomId;
    const teacherId = isCancelled
      ? null
      : 'teacherId' in dto
        ? (dto.teacherId ?? null)
        : exc.teacherId;
    await this.assertExceptionChange(tenantId, {
      isCancelled,
      startTime,
      endTime,
      roomId,
      teacherId,
    });

    const updated = await this.prisma.scheduleException.update({
      where: { id },
      data: {
        isCancelled,
        startTime,
        endTime,
        roomId,
        teacherId,
        note: dto.note ?? exc.note,
      },
    });

    const sessionSync = await this.syncTemplateSessions(
      exc.templateId,
      tenantId,
    );
    return { ...updated, sessionSync };
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

    const sessionSync = await this.syncTemplateSessions(
      exc.templateId,
      tenantId,
    );
    return { message: "Istisno o'chirildi", sessionSync };
  }

  // ─── Calendar (oylik ko'rinish) ────────────────────────────────

  async getCalendar(
    groupId: string,
    year: number,
    month: number,
    tenantId: string,
    requesterRole?: string,
    requesterId?: string,
  ) {
    // Shablonda o'z teacheri bo'lmagan kunlar uchun fallback sifatida kerak bo'ladi
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, tenantId, isDeleted: false },
      select: {
        teacherId: true,
        teacher: { select: { id: true, fullName: true } },
      },
    });

    if (requesterRole === 'teacher') {
      if (!group) throw new NotFoundException('Guruh topilmadi');
      if (!(await this.teacherCanAccess(groupId, tenantId, requesterId))) {
        throw new ForbiddenException(
          "Siz bu guruhning kalendarini ko'ra olmaysiz",
        );
      }
    }

    // O'sha oyning barcha kunlari (UTC asosida — timezone shift oldini olish uchun)
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));

    const templates = await this.prisma.scheduleTemplate.findMany({
      where: { groupId, tenantId, isDeleted: false, isActive: true },
      include: {
        room: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, fullName: true } },
      },
    });

    if (!templates.length) return {};

    const templateIds = templates.map((t) => t.id);

    const [exceptions, sessions, holidays] = await this.prisma.$transaction([
      this.prisma.scheduleException.findMany({
        where: {
          templateId: { in: templateIds },
          isDeleted: false,
          exceptionDate: { gte: start, lte: end },
        },
        include: {
          room: { select: { id: true, name: true } },
          teacher: { select: { id: true, fullName: true } },
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
          isChecked: true,
          sessionType: true,
          topic: true,
          templateId: true,
          subject: { select: { id: true, name: true } },
          teacher: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.holiday.findMany({
        where: { tenantId, isDeleted: false, date: { gte: start, lte: end } },
        select: { id: true, date: true, name: true },
      }),
    ]);

    const holidayMap = new Map(
      holidays.map((h) => [toDateString(h.date), { id: h.id, name: h.name }]),
    );

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

      // Shablonning amal qilish muddatidagi kunlar
      const dayTemplates = templates.filter(
        (t) =>
          t.weekday === weekday &&
          (!t.validFrom || dateStr >= toDateString(t.validFrom)) &&
          (!t.validTo || dateStr <= toDateString(t.validTo)),
      );
      if (!dayTemplates.length) continue;

      const holiday = holidayMap.get(dateStr) ?? null;

      calendar[dateStr] = dayTemplates.map((template) => {
        const exc = exceptionMap.get(`${template.id}_${dateStr}`) ?? null;
        // Exception vaqt o'zgartirgan bo'lsa shu startTime, aks holda template vaqti
        const effectiveStartTime = exc?.startTime ?? template.startTime;
        const daySessions = sessionMap.get(dateStr) ?? [];
        // Avval shablonga bog'langan sessiya, bo'lmasa (eski/qo'lda yaratilgan) vaqt bo'yicha
        const matchedSession =
          daySessions.find((s) => s.templateId === template.id) ??
          daySessions.find(
            (s) => !s.templateId && s.startTime === effectiveStartTime,
          );
        return {
          // Dam olish kuni — jadval darsi bo'lmaydi (null — oddiy kun)
          holiday,
          template: {
            id: template.id,
            weekday: template.weekday,
            startTime: template.startTime,
            endTime: template.endTime,
            validFrom: template.validFrom,
            validTo: template.validTo,
            room: template.room,
            subject: template.subject,
            teacher: template.teacher ?? group?.teacher ?? null,
          },
          exception: exc
            ? {
                id: exc.id,
                isCancelled: exc.isCancelled,
                startTime: exc.startTime,
                endTime: exc.endTime,
                // Shu kun uchun boshqa xona / o'rinbosar o'qituvchi (null — shablondagisi)
                room: exc.room,
                teacher: exc.teacher,
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
    const fromStr = dto.fromDate.slice(0, 10);
    const toStr = dto.toDate.slice(0, 10);

    if (fromStr > toStr) {
      throw new BadRequestException("fromDate toDate dan oldin bo'lishi kerak");
    }
    // Juda katta oraliq (masalan 100 yil) serverni og'ir yuklardi
    if (diffDays(fromStr, toStr) + 1 > MAX_GENERATE_DAYS) {
      throw new BadRequestException(
        `Bir so'rovda ko'pi bilan ${MAX_GENERATE_DAYS} kunlik sessiya yaratish mumkin`,
      );
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

    return this.prisma.$transaction(async (tx) => {
      // Qulf ostida: parallel generatsiya/yaratish bir xil slotga ikkita dars yaratmaydi
      await lockTenantSchedule(tx, tenantId);

      const { occurrences, cancelled, holidays } =
        await this.computeOccurrences(
          tx,
          tenantId,
          templates,
          group.teacherId,
          fromStr,
          toStr,
        );

      // Mavjud sessiyalar: shu guruhdagi har qanday sessiya (qo'lda yaratilgani ham)
      // shu sana+vaqtni band qiladi; shu shablondan shu sanaga allaqachon yaratilgan bo'lsa ham
      const existing = await tx.session.findMany({
        where: {
          groupId: dto.groupId,
          tenantId,
          isDeleted: false,
          sessionDate: { gte: new Date(fromStr), lte: new Date(toStr) },
        },
        select: { sessionDate: true, startTime: true, templateId: true },
      });
      const takenSlots = new Set(
        existing.map((e) => `${toDateString(e.sessionDate)}_${e.startTime}`),
      );
      const takenTemplateDates = new Set(
        existing
          .filter((e) => e.templateId)
          .map((e) => `${e.templateId}_${toDateString(e.sessionDate)}`),
      );

      const toCreate: Prisma.SessionCreateManyInput[] = [];
      const conflicts: ScheduleSlotConflict[] = [];
      let skipped = 0;

      for (const occ of occurrences) {
        if (
          takenSlots.has(`${occ.date}_${occ.startTime}`) ||
          takenTemplateDates.has(`${occ.templateId}_${occ.date}`)
        ) {
          skipped++;
          continue;
        }

        // Xona yoki o'qituvchi shu vaqtda boshqa guruhning (masalan qo'lda qo'shilgan) darsida band
        const conflict = await findSessionConflict(tx, {
          tenantId,
          sessionDate: new Date(occ.date),
          startTime: occ.startTime,
          endTime: occ.endTime,
          groupId: dto.groupId,
          roomId: occ.roomId,
          teacherId: occ.teacherId,
        });
        if (conflict) {
          conflicts.push({
            date: occ.date,
            startTime: occ.startTime,
            endTime: occ.endTime,
            kind: conflict.kind,
            groupName: conflict.groupName,
          });
          continue;
        }

        takenSlots.add(`${occ.date}_${occ.startTime}`);
        toCreate.push(this.occurrenceToSession(occ, dto.groupId, tenantId));
      }

      if (toCreate.length) await tx.session.createMany({ data: toCreate });

      return {
        message: 'Sessiyalar muvaffaqiyatli yaratildi',
        created: toCreate.length,
        skipped,
        cancelled,
        holidays,
        conflicts,
      };
    });
  }

  private occurrenceToSession(
    occ: Occurrence,
    groupId: string,
    tenantId: string,
  ): Prisma.SessionCreateManyInput {
    return {
      sessionDate: new Date(occ.date),
      startTime: occ.startTime,
      endTime: occ.endTime,
      sessionType: SessionType.lesson,
      groupId,
      roomId: occ.roomId,
      // template da o'qituvchi biriktirilgan bo'lsa shu, aks holda guruh o'qituvchisi
      teacherId: occ.teacherId,
      // shablondagi fan sessionga nusxalanadi
      subjectId: occ.subjectId,
      templateId: occ.templateId,
      tenantId,
    };
  }

  // Shablonlar + istisnolar bo'yicha [from, to] oralig'idagi darslarni hisoblaydi
  private async computeOccurrences(
    db: Prisma.TransactionClient,
    tenantId: string,
    templates: TemplateForOccurrence[],
    groupTeacherId: string,
    fromStr: string,
    toStr: string,
  ): Promise<{
    occurrences: Occurrence[];
    cancelled: number;
    holidays: number;
  }> {
    const range = { gte: new Date(fromStr), lte: new Date(toStr) };
    const [exceptions, holidayRows] = await Promise.all([
      db.scheduleException.findMany({
        where: {
          templateId: { in: templates.map((t) => t.id) },
          isDeleted: false,
          exceptionDate: range,
        },
      }),
      db.holiday.findMany({
        where: { tenantId, isDeleted: false, date: range },
        select: { date: true },
      }),
    ]);
    const holidayDates = new Set(holidayRows.map((h) => toDateString(h.date)));
    const exceptionMap = new Map(
      exceptions.map((e) => [
        `${e.templateId}_${toDateString(e.exceptionDate)}`,
        e,
      ]),
    );

    const occurrences: Occurrence[] = [];
    let cancelled = 0;
    let holidays = 0;

    for (
      let d = new Date(`${fromStr}T00:00:00.000Z`);
      toDateString(d) <= toStr;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const dateStr = toDateString(d);
      const jsDay = d.getUTCDay();

      for (const template of templates) {
        if (WEEKDAY_ORDER[template.weekday] !== jsDay) continue;

        // Shablonning amal qilish muddatidan tashqari
        if (template.validFrom && dateStr < toDateString(template.validFrom))
          continue;
        if (template.validTo && dateStr > toDateString(template.validTo))
          continue;

        // Tenant dam olish kuni — shu kuni jadval darslari yo'q
        if (holidayDates.has(dateStr)) {
          holidays++;
          continue;
        }

        const exc = exceptionMap.get(`${template.id}_${dateStr}`);
        if (exc?.isCancelled) {
          cancelled++;
          continue;
        }

        occurrences.push({
          templateId: template.id,
          date: dateStr,
          startTime: exc?.startTime ?? template.startTime,
          endTime: exc?.endTime ?? template.endTime,
          // Istisnoda boshqa xona / o'rinbosar o'qituvchi bo'lishi mumkin
          roomId: exc?.roomId ?? template.roomId,
          teacherId: exc?.teacherId ?? template.teacherId ?? groupTeacherId,
          subjectId: template.subjectId ?? null,
        });
      }
    }

    return { occurrences, cancelled, holidays };
  }

  /**
   * Tenantdagi kelajakdagi sessiyasi bor barcha shablonlarni sinxronlaydi
   * (dam olish kuni qo'shilganda/o'chirilganda).
   */
  async syncAllTemplateSessions(tenantId: string): Promise<SessionSyncResult> {
    const tz = await getTenantTimezone(this.prisma, tenantId);
    const today = nowInTimeZone(tz).date;
    const rows = await this.prisma.session.findMany({
      where: {
        tenantId,
        isDeleted: false,
        templateId: { not: null },
        sessionDate: { gte: new Date(today) },
      },
      distinct: ['templateId'],
      select: { templateId: true },
    });

    const total: SessionSyncResult = {
      updated: 0,
      removed: 0,
      created: 0,
      conflicts: [],
    };
    for (const { templateId } of rows) {
      const r = await this.syncTemplateSessions(templateId!, tenantId);
      total.updated += r.updated;
      total.removed += r.removed;
      total.created += r.created;
      total.conflicts.push(...r.conflicts);
    }
    return total;
  }

  /**
   * Shablon yoki uning istisnosi o'zgarganda shu shablondan yaratilgan **kelajakdagi**
   * (bugundan boshlab, tenant timezone'i bo'yicha) sessiyalarni moslashtiradi:
   * - tekshirilgan yoki qulflangan sessiyaga tegilmaydi;
   * - shu sanada dars bo'lishi kerak bo'lsa — vaqt/xona/o'qituvchi/fan yangilanadi (mavzu saqlanadi);
   * - bo'lmasligi kerak bo'lsa (bekor qilindi, hafta kuni o'zgardi, shablon o'chirildi) — o'chiriladi;
   * - yangi hafta kuniga to'g'ri kelgan sanalar uchun yaratiladi (avval generatsiya qilingan
   *   eng oxirgi sanagacha — oraliq kengaytirilmaydi).
   * Boshqa dars bilan to'qnashadigan o'zgarishlar qo'llanmaydi va `conflicts` da qaytariladi.
   */
  async syncTemplateSessions(
    templateId: string,
    tenantId: string,
  ): Promise<SessionSyncResult> {
    const result: SessionSyncResult = {
      updated: 0,
      removed: 0,
      created: 0,
      conflicts: [],
    };
    const tz = await getTenantTimezone(this.prisma, tenantId);
    const today = nowInTimeZone(tz).date;

    return this.prisma.$transaction(async (tx) => {
      await lockTenantSchedule(tx, tenantId);

      const template = await tx.scheduleTemplate.findFirst({
        where: { id: templateId, tenantId },
        include: { group: { select: { teacherId: true } } },
      });
      if (!template) return result;

      const sessions = await tx.session.findMany({
        where: {
          templateId,
          isDeleted: false,
          sessionDate: { gte: new Date(today) },
        },
        orderBy: { sessionDate: 'asc' },
      });
      if (!sessions.length) return result;

      const horizon = toDateString(sessions[sessions.length - 1].sessionDate);
      const desired = new Map<string, Occurrence>();
      if (template.isActive && !template.isDeleted) {
        const { occurrences } = await this.computeOccurrences(
          tx,
          tenantId,
          [template],
          template.group.teacherId,
          today,
          horizon,
        );
        for (const occ of occurrences) desired.set(occ.date, occ);
      }

      for (const session of sessions) {
        const date = toDateString(session.sessionDate);
        const occ = desired.get(date);
        desired.delete(date);

        // Tekshirilgan/qulflangan dars tarix — o'zgartirilmaydi
        if (session.isChecked || session.isLocked) continue;

        if (!occ) {
          await tx.session.update({
            where: { id: session.id },
            data: { isDeleted: true, deletedAt: new Date() },
          });
          result.removed++;
          continue;
        }

        const changed =
          session.startTime !== occ.startTime ||
          session.endTime !== occ.endTime ||
          session.roomId !== occ.roomId ||
          session.teacherId !== occ.teacherId ||
          session.subjectId !== occ.subjectId;
        if (!changed) continue;

        const conflict = await findSessionConflict(tx, {
          tenantId,
          sessionDate: session.sessionDate,
          startTime: occ.startTime,
          endTime: occ.endTime,
          groupId: session.groupId,
          roomId: occ.roomId,
          teacherId: occ.teacherId,
          excludeSessionId: session.id,
        });
        if (conflict) {
          result.conflicts.push({
            date,
            startTime: occ.startTime,
            endTime: occ.endTime,
            kind: conflict.kind,
            groupName: conflict.groupName,
          });
          continue;
        }

        await tx.session.update({
          where: { id: session.id },
          data: {
            startTime: occ.startTime,
            endTime: occ.endTime,
            roomId: occ.roomId,
            teacherId: occ.teacherId,
            subjectId: occ.subjectId,
          },
        });
        result.updated++;
      }

      // Hafta kuni o'zgargan yoki istisno o'chirilgan sanalar — yangi darslar
      for (const occ of desired.values()) {
        const sessionDate = new Date(occ.date);
        const taken = await tx.session.findFirst({
          where: {
            tenantId,
            groupId: template.groupId,
            sessionDate,
            startTime: occ.startTime,
            isDeleted: false,
          },
          select: { id: true },
        });
        if (taken) continue;

        const conflict = await findSessionConflict(tx, {
          tenantId,
          sessionDate,
          startTime: occ.startTime,
          endTime: occ.endTime,
          groupId: template.groupId,
          roomId: occ.roomId,
          teacherId: occ.teacherId,
        });
        if (conflict) {
          result.conflicts.push({
            date: occ.date,
            startTime: occ.startTime,
            endTime: occ.endTime,
            kind: conflict.kind,
            groupName: conflict.groupName,
          });
          continue;
        }

        await tx.session.create({
          data: this.occurrenceToSession(occ, template.groupId, tenantId),
        });
        result.created++;
      }

      return result;
    });
  }

  // ─── Private: Conflict detection ──────────────────────────────

  // Shablondagi ID'lar shu tenantga tegishli; o'qituvchi haqiqatan dars beruvchi rolda.
  // Guruh (o'qituvchi fallback'i uchun) qaytariladi.
  private async assertTemplateRefs(
    tenantId: string,
    refs: {
      groupId: string;
      roomId?: string;
      teacherId?: string;
      subjectId?: string;
    },
  ) {
    const [group, room, teacher, subject] = await Promise.all([
      this.prisma.group.findFirst({
        where: { id: refs.groupId, tenantId, isDeleted: false },
        select: { id: true, teacherId: true },
      }),
      refs.roomId
        ? this.prisma.room.findFirst({
            where: { id: refs.roomId, tenantId, isDeleted: false },
            select: { id: true },
          })
        : true,
      refs.teacherId
        ? this.prisma.user.findFirst({
            where: {
              id: refs.teacherId,
              tenantId,
              isDeleted: false,
              isActive: true,
              role: { name: { in: ['teacher', 'admin'] } },
            },
            select: { id: true },
          })
        : true,
      refs.subjectId
        ? this.prisma.subject.findFirst({
            where: { id: refs.subjectId, tenantId, isDeleted: false },
            select: { id: true },
          })
        : true,
    ]);

    if (!group) throw new NotFoundException('Guruh topilmadi');
    if (!room) throw new NotFoundException('Xona topilmadi');
    if (!teacher) throw new NotFoundException("O'qituvchi topilmadi");
    if (!subject) throw new NotFoundException('Fan topilmadi');
    return group;
  }

  private assertValidity(from: Date | null, to: Date | null) {
    if (from && to && from > to) {
      throw new BadRequestException(
        "validFrom validTo dan keyin bo'lishi mumkin emas",
      );
    }
  }

  /**
   * Shablonlar orasidagi to'qnashuv: shu hafta kuni, vaqti kesishadigan va amal qilish
   * muddati ustma-ust tushadigan boshqa shablonda —
   * shu guruh, shu xona yoki shu o'qituvchi (shablon teacheri, bo'lmasa guruh teacheri) band.
   * Muddatlari kesishmaydigan shablonlar (masalan, 1-chorak va 2-chorak) to'qnashmaydi.
   */
  private async checkTemplateConflicts(slot: {
    tenantId: string;
    weekday: Weekday;
    startTime: string;
    endTime: string;
    groupId: string;
    roomId: string;
    teacherId: string;
    validFrom: Date | null;
    validTo: Date | null;
    excludeId?: string;
  }) {
    const validityOverlap: Prisma.ScheduleTemplateWhereInput[] = [];
    if (slot.validTo) {
      validityOverlap.push({
        OR: [{ validFrom: null }, { validFrom: { lte: slot.validTo } }],
      });
    }
    if (slot.validFrom) {
      validityOverlap.push({
        OR: [{ validTo: null }, { validTo: { gte: slot.validFrom } }],
      });
    }

    const candidates = await this.prisma.scheduleTemplate.findMany({
      where: {
        tenantId: slot.tenantId,
        weekday: slot.weekday,
        isDeleted: false,
        isActive: true,
        ...(slot.excludeId ? { NOT: { id: slot.excludeId } } : {}),
        AND: [
          ...validityOverlap,
          {
            OR: [
              { groupId: slot.groupId },
              { roomId: slot.roomId },
              { teacherId: slot.teacherId },
              { teacherId: null, group: { teacherId: slot.teacherId } },
            ],
          },
        ],
      },
      select: {
        startTime: true,
        endTime: true,
        groupId: true,
        roomId: true,
        teacherId: true,
        group: { select: { name: true, teacherId: true } },
      },
    });

    for (const c of candidates) {
      if (!timeOverlap(slot.startTime, slot.endTime, c.startTime, c.endTime))
        continue;
      const effectiveTeacher = c.teacherId ?? c.group.teacherId;
      const kind: ConflictKind =
        c.groupId === slot.groupId
          ? 'group'
          : c.roomId === slot.roomId
            ? 'room'
            : 'teacher';
      if (kind === 'teacher' && effectiveTeacher !== slot.teacherId) continue;

      const label =
        kind === 'group'
          ? 'Bu guruhning'
          : kind === 'room'
            ? 'Bu xona'
            : "Bu o'qituvchining";
      throw new ConflictException({
        statusCode: 409,
        message: `${label} ${slot.weekday} kuni ${c.startTime}–${c.endTime} da "${c.group.name}" guruhi bilan to'qnashuvi bor`,
        code: 'SCHEDULE_CONFLICT',
        conflict: {
          kind,
          groupName: c.group.name,
          startTime: c.startTime,
          endTime: c.endTime,
        },
      });
    }
  }
}
