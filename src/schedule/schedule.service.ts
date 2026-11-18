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
};

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

    const group = await this.assertTemplateRefs(resolvedTenantId, {
      groupId: dto.groupId,
      roomId: dto.roomId,
      teacherId: dto.teacherId,
      subjectId: dto.subjectId,
    });

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
    await this.checkTeacherConflict(
      dto.teacherId ?? group.teacherId,
      dto.weekday,
      dto.startTime,
      dto.endTime,
      resolvedTenantId,
    );

    const created = await this.prisma.scheduleTemplate.create({
      data: {
        weekday: dto.weekday,
        startTime: dto.startTime,
        endTime: dto.endTime,
        groupId: dto.groupId,
        roomId: dto.roomId,
        teacherId: dto.teacherId ?? null,
        subjectId: dto.subjectId ?? null,
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

    const group = await this.assertTemplateRefs(tenantId, {
      groupId: existing.groupId,
      roomId: dto.roomId,
      teacherId: dto.teacherId ?? undefined,
      subjectId: dto.subjectId ?? undefined,
    });

    if (
      dto.weekday ||
      dto.startTime ||
      dto.endTime ||
      dto.roomId ||
      'teacherId' in dto
    ) {
      await this.checkTeacherConflict(
        newTeacher ?? group.teacherId,
        newWeekday,
        newStart,
        newEnd,
        tenantId,
        id,
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

    const updated = await this.prisma.scheduleTemplate.update({
      where: { id },
      data: {
        weekday: newWeekday,
        startTime: newStart,
        endTime: newEnd,
        roomId: newRoom,
        teacherId: newTeacher,
        subjectId: newSubject,
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

    this.assertExceptionTimes(dto.isCancelled, dto.startTime, dto.endTime);

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

  // Bekor qilinmagan istisnoda yangi vaqt majburiy va to'g'ri oraliq bo'lishi kerak
  private assertExceptionTimes(
    isCancelled: boolean,
    startTime?: string | null,
    endTime?: string | null,
  ) {
    if (isCancelled) return;
    if (!startTime || !endTime) {
      throw new BadRequestException(
        'Bekor qilinmagan istisnoda startTime va endTime majburiy',
      );
    }
    if (!timeLt(startTime, endTime)) {
      throw new BadRequestException(
        "endTime startTime dan katta bo'lishi kerak",
      );
    }
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
    this.assertExceptionTimes(isCancelled, startTime, endTime);

    const updated = await this.prisma.scheduleException.update({
      where: { id },
      data: {
        isCancelled,
        startTime,
        endTime,
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
          isChecked: true,
          sessionType: true,
          topic: true,
          subject: { select: { id: true, name: true } },
          teacher: { select: { id: true, fullName: true } },
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
            subject: template.subject,
            teacher: template.teacher ?? group?.teacher ?? null,
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

      const { occurrences, cancelled } = await this.computeOccurrences(
        tx,
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
    templates: TemplateForOccurrence[],
    groupTeacherId: string,
    fromStr: string,
    toStr: string,
  ): Promise<{ occurrences: Occurrence[]; cancelled: number }> {
    const exceptions = await db.scheduleException.findMany({
      where: {
        templateId: { in: templates.map((t) => t.id) },
        isDeleted: false,
        exceptionDate: { gte: new Date(fromStr), lte: new Date(toStr) },
      },
    });
    const exceptionMap = new Map(
      exceptions.map((e) => [
        `${e.templateId}_${toDateString(e.exceptionDate)}`,
        e,
      ]),
    );

    const occurrences: Occurrence[] = [];
    let cancelled = 0;

    for (
      let d = new Date(`${fromStr}T00:00:00.000Z`);
      toDateString(d) <= toStr;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const dateStr = toDateString(d);
      const jsDay = d.getUTCDay();

      for (const template of templates) {
        if (WEEKDAY_ORDER[template.weekday] !== jsDay) continue;

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
          roomId: template.roomId,
          teacherId: template.teacherId ?? groupTeacherId,
          subjectId: template.subjectId ?? null,
        });
      }
    }

    return { occurrences, cancelled };
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
  private async syncTemplateSessions(
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

  // O'qituvchi bir vaqtda ikki joyda dars bera olmaydi. Shablonning haqiqiy o'qituvchisi:
  // shablondagi teacherId, bo'lmasa guruhning asosiy o'qituvchisi
  private async checkTeacherConflict(
    teacherId: string,
    weekday: Weekday,
    startTime: string,
    endTime: string,
    tenantId: string,
    excludeId?: string,
  ) {
    const conflicts = await this.prisma.scheduleTemplate.findMany({
      where: {
        tenantId,
        weekday,
        isDeleted: false,
        isActive: true,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
        OR: [{ teacherId }, { teacherId: null, group: { teacherId } }],
      },
      select: {
        startTime: true,
        endTime: true,
        group: { select: { name: true } },
      },
    });

    for (const c of conflicts) {
      if (timeOverlap(startTime, endTime, c.startTime, c.endTime)) {
        throw new ConflictException({
          statusCode: 409,
          message: `Bu o'qituvchi ${weekday} kuni ${c.startTime}–${c.endTime} da "${c.group.name}" guruhida dars beradi`,
          code: 'SCHEDULE_CONFLICT',
          conflict: { kind: 'teacher', groupName: c.group.name },
        });
      }
    }
  }

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
