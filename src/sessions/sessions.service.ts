import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { QuerySessionDto } from './dto/query-session.dto';
import { BulkAttendanceDto } from './dto/record-attendance.dto';
import { BulkResultsDto } from './dto/record-results.dto';
import { QueryMyAttendanceDto } from './dto/query-my-attendance.dto';
import {
  AttendanceStatus,
  CoinDirection,
  EvaluationMode,
  SourceType,
  TriggerType,
} from 'src/generated/prisma/enums';
import { CoinTransactionsService } from 'src/coin-transaction/coin-transaction.service';
import { assertTeacherCoinLimit } from 'src/common/utils/teacher-coin-limit';
import { ACTIVE_TEACHING_USER_WHERE } from 'src/common/utils/user-role-checks';
import { EFFECTIVE_COIN_TX_WHERE } from 'src/coin-transaction/constants/effective-transaction';
import { AuditActionType, Prisma } from 'src/generated/prisma/client';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { AUDIT_ENTITY } from 'src/audit-log/utils/audit-entry';
import { SessionCoinItem } from 'src/common/types';
import {
  addDays,
  getTenantTimezone,
  nowInTimeZone,
  toDateString,
} from 'src/common/utils/tenant-time';
import {
  AttendanceRules,
  buildAttendanceCoinItems,
  isAttendedStatus,
  pickAutoRule,
  resolveAttendanceStatus,
} from './utils/attendance-coins';
import {
  assertNoSessionConflict,
  lockTenantSchedule,
} from './utils/session-conflicts';
import { recordChanged } from './utils/attendance-record';
import {
  ALL_SESSION_MANAGED_SOURCE_TYPES,
  ATTENDANCE_EDIT_WINDOW_DAYS,
  TEACHER_BACKDATE_DAYS,
  SESSION_ERROR_CODES,
  SESSION_MANAGED_SOURCE_TYPES,
  SESSION_TYPE_CONFIG,
  resolveEvaluationMode,
} from './constants/session-types';

// Frontend i18n uchun `code` maydoni bor xato javobi
function codedError(
  status: HttpStatus,
  message: string,
  code: string,
  extra: Record<string, unknown> = {},
) {
  return new HttpException(
    { statusCode: status, message, code, ...extra },
    status,
  );
}

export interface CoinSkippedItem {
  studentId: string;
  code: string;
  reason: string;
  sourceType?: SourceType;
  direction?: CoinDirection;
  amount?: number;
}

// Bitta o'quvchi bo'yicha saqlanadigan tekshiruv: yozuv maydonlari va beriladigan coinlar
interface CheckPlanItem {
  studentId: string;
  fields: {
    isPresent: boolean;
    status: AttendanceStatus;
    homeworkDone: boolean;
    score?: number | null;
    note?: string | null;
  };
  items: SessionCoinItem[];
}

// Butun guruh tekshiruvi bitta tranzaksiyada — Prisma standart 5 soniyalik limiti katta
// guruhlar (300 tagacha o'quvchi) uchun yetmasligi mumkin
const CHECK_TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;

type CheckableSession = Prisma.SessionGetPayload<{
  include: {
    subject: { select: { name: true } };
    group: { select: { name: true } };
  };
}>;

const SESSION_SELECT = {
  id: true,
  sessionDate: true,
  startTime: true,
  endTime: true,
  sessionType: true,
  evaluationMode: true,
  maxScore: true,
  topic: true,
  isLocked: true,
  isChecked: true,
  checkedAt: true,
  templateId: true,
  isDeleted: true,
  lockedAt: true,
  deletedAt: true,
  tenantId: true,
  group: { select: { id: true, name: true } },
  room: { select: { id: true, name: true } },
  teacher: { select: { id: true, fullName: true } },
  subject: { select: { id: true, name: true } },
} satisfies Prisma.SessionSelect;

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coinTrxService: CoinTransactionsService,
    private readonly audit: AuditLogService,
  ) {}

  // 0. SESSIYA TURLARI VA ULARNING TEKSHIRISH REJIMLARI (frontend formasi uchun)
  getTypes() {
    return Object.entries(SESSION_TYPE_CONFIG).map(([type, config]) => ({
      type,
      defaultMode: config.defaultMode,
      allowedModes: config.allowedModes,
      scoredSourceType: config.scoredSourceType,
    }));
  }

  // Boshqa jadvaldan kelgan ID'lar shu tenantga tegishliligini tekshirish
  private async assertRefsInTenant(
    tenantId: string,
    refs: {
      groupId?: string;
      roomId?: string;
      teacherId?: string;
      subjectId?: string | null;
    },
  ) {
    const [group, room, teacher, subject] = await Promise.all([
      refs.groupId
        ? this.prisma.group.findFirst({
            where: { id: refs.groupId, tenantId, isDeleted: false },
            select: { id: true },
          })
        : true,
      refs.roomId
        ? this.prisma.room.findFirst({
            where: { id: refs.roomId, tenantId, isDeleted: false },
            select: { id: true },
          })
        : true,
      refs.teacherId
        ? this.prisma.user.findFirst({
            // Darsni faqat o'qituvchi (yoki dars beruvchi admin) o'tadi — student emas
            where: {
              id: refs.teacherId,
              tenantId,
              ...ACTIVE_TEACHING_USER_WHERE,
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
  }

  // 1. DARS YARATISH
  async create(
    tenantId: string,
    dto: CreateSessionDto,
    requesterRole?: string,
    requesterId?: string,
  ) {
    let teacherId = dto.teacherId;

    // Teacher faqat o'zi dars beradigan guruhga sessiya qo'sha oladi
    if (requesterRole === 'teacher') {
      const group = await this.prisma.group.findFirst({
        where: { id: dto.groupId, tenantId, isDeleted: false },
        select: { teacherId: true },
      });
      if (!group) throw new NotFoundException('Guruh topilmadi');
      if (group.teacherId !== requesterId) {
        throw new ForbiddenException(
          "Siz faqat o'zingiz dars beradigan guruhga sessiya qo'sha olasiz",
        );
      }
      teacherId = requesterId; // client yuborgan teacherId e'tiborsiz qoldiriladi

      // Teacher o'tgan sanaga faqat TEACHER_BACKDATE_DAYS kun ichida sessiya qo'sha oladi —
      // eski sanalarga ko'plab dars yaratib coin "ishlab chiqarish"ning oldini olish
      const tz = await getTenantTimezone(this.prisma, tenantId);
      const earliest = addDays(nowInTimeZone(tz).date, -TEACHER_BACKDATE_DAYS);
      if (dto.sessionDate < earliest) {
        throw codedError(
          HttpStatus.FORBIDDEN,
          `O'qituvchi ${TEACHER_BACKDATE_DAYS} kundan eski sanaga dars qo'sha olmaydi (eng erta: ${earliest}). Administratorga murojaat qiling`,
          SESSION_ERROR_CODES.SESSION_DATE_TOO_OLD,
          { earliestDate: earliest },
        );
      }
    }

    this.assertTimeRange(dto.startTime, dto.endTime);

    await this.assertRefsInTenant(tenantId, {
      groupId: dto.groupId,
      roomId: dto.roomId,
      teacherId,
      subjectId: dto.subjectId,
    });

    const evaluationMode = resolveEvaluationMode(
      dto.sessionType,
      dto.evaluationMode,
    );
    if (!evaluationMode) {
      throw codedError(
        HttpStatus.BAD_REQUEST,
        `"${dto.sessionType}" turi uchun "${dto.evaluationMode}" tekshirish rejimi ruxsat etilmagan`,
        SESSION_ERROR_CODES.INVALID_EVALUATION_MODE,
        { allowedModes: SESSION_TYPE_CONFIG[dto.sessionType].allowedModes },
      );
    }

    // DTO sanani 'YYYY-MM-DD' ga keltiradi (IsDateOnly) — tekshiruv va saqlash bir xil sanada
    const sessionDate = new Date(dto.sessionDate);

    return this.prisma.$transaction(async (tx) => {
      // Qulf ostida: parallel so'rovlar bir xil slotga ikkita dars yarata olmaydi
      await lockTenantSchedule(tx, tenantId);

      const duplicate = await tx.session.findFirst({
        where: {
          tenantId,
          groupId: dto.groupId,
          sessionDate,
          startTime: dto.startTime,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (duplicate) {
        throw codedError(
          HttpStatus.CONFLICT,
          "Bu guruh uchun ko'rsatilgan sana va vaqtda dars allaqachon mavjud",
          SESSION_ERROR_CODES.SESSION_DUPLICATE,
          { sessionId: duplicate.id },
        );
      }

      // Guruh, xona yoki o'qituvchi shu vaqtda band bo'lmasligi kerak
      await assertNoSessionConflict(tx, {
        tenantId,
        sessionDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        groupId: dto.groupId,
        roomId: dto.roomId,
        teacherId,
      });

      return tx.session.create({
        data: {
          sessionDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
          sessionType: dto.sessionType,
          evaluationMode,
          // maxScore faqat ball rejimida ma'noga ega
          maxScore:
            evaluationMode === EvaluationMode.scored
              ? (dto.maxScore ?? null)
              : null,
          topic: dto.topic || null,
          groupId: dto.groupId,
          roomId: dto.roomId,
          teacherId,
          subjectId: dto.subjectId ?? null,
          tenantId,
        },
      });
    });
  }

  // startTime < endTime (HH:MM matn sifatida solishtiriladi — format DTO'da qat'iy)
  private assertTimeRange(startTime: string, endTime: string) {
    if (!(startTime < endTime)) {
      throw codedError(
        HttpStatus.BAD_REQUEST,
        "Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak",
        SESSION_ERROR_CODES.INVALID_TIME_RANGE,
      );
    }
  }

  // 2. DARSNI TAHRIRLASH
  async update(
    id: string,
    tenantId: string,
    dto: UpdateSessionDto,
    requesterRole?: string,
    requesterId?: string,
  ) {
    const session = await this.prisma.session.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!session) throw new NotFoundException('Dars topilmadi');

    if (requesterRole === 'teacher' && session.teacherId !== requesterId) {
      throw new ForbiddenException(
        "Siz faqat o'z darsingizni tahrirlay olasiz",
      );
    }

    // Teacher darsni boshqa o'qituvchiga o'tkaza olmaydi (keyin unga kira olmay qolardi)
    if (
      requesterRole === 'teacher' &&
      dto.teacherId &&
      dto.teacherId !== session.teacherId
    ) {
      throw new ForbiddenException(
        "O'qituvchini faqat administrator almashtira oladi",
      );
    }

    if (session.isLocked) {
      // Qulflangan sessionda ham yo'qlama/coinga ta'sir qilmaydigan
      // metama'lumotlarni (mavzu, fan) tahrirlashga ruxsat beramiz —
      // faqat vaqt/xona/o'qituvchi/tur/rejim kabi struktura maydonlari bloklanadi.
      const structuralFields: (keyof UpdateSessionDto)[] = [
        'startTime',
        'endTime',
        'roomId',
        'teacherId',
        'sessionType',
        'evaluationMode',
        'maxScore',
      ];
      // DTO obyektida yuborilmagan maydonlar ham `undefined` bo'lib mavjud (ES2022+ class fields),
      // shuning uchun `in` emas — qiymat bo'yicha tekshiriladi
      const hasStructuralChange = structuralFields.some(
        (f) => dto[f] !== undefined,
      );
      if (hasStructuralChange) {
        throw codedError(
          HttpStatus.FORBIDDEN,
          "Dars qulflangan -- vaqt/xona/o'qituvchi/tur/rejim maydonlarini o'zgartirib bo'lmaydi. Avval qulfni oching.",
          SESSION_ERROR_CODES.SESSION_LOCKED,
        );
      }
    }

    await this.assertRefsInTenant(tenantId, {
      roomId: dto.roomId,
      teacherId: dto.teacherId,
      subjectId: dto.subjectId,
    });

    // Tur yoki rejim o'zgarsa — yangi rejim qayta aniqlanadi. Tur o'zgarib
    // rejim berilmasa: joriy rejim yangi turda ruxsat etilgan bo'lsa saqlanadi,
    // aks holda yangi turning default rejimi olinadi.
    const nextType = dto.sessionType ?? session.sessionType;
    let nextMode = session.evaluationMode;
    if (dto.sessionType || dto.evaluationMode) {
      const requested =
        dto.evaluationMode ??
        (SESSION_TYPE_CONFIG[nextType].allowedModes.includes(
          session.evaluationMode,
        )
          ? session.evaluationMode
          : undefined);
      const resolved = resolveEvaluationMode(nextType, requested);
      if (!resolved) {
        throw codedError(
          HttpStatus.BAD_REQUEST,
          `"${nextType}" turi uchun "${dto.evaluationMode}" tekshirish rejimi ruxsat etilmagan`,
          SESSION_ERROR_CODES.INVALID_EVALUATION_MODE,
          { allowedModes: SESSION_TYPE_CONFIG[nextType].allowedModes },
        );
      }
      nextMode = resolved;
    }

    if (nextMode !== session.evaluationMode && session.isChecked) {
      throw codedError(
        HttpStatus.CONFLICT,
        "Sessiya allaqachon tekshirilgan -- tekshirish rejimini o'zgartirib bo'lmaydi",
        SESSION_ERROR_CODES.SESSION_ALREADY_CHECKED,
      );
    }

    let nextMaxScore =
      dto.maxScore !== undefined ? dto.maxScore : session.maxScore;
    if (nextMode !== EvaluationMode.scored) nextMaxScore = null;

    if (nextMaxScore !== null && nextMaxScore !== session.maxScore) {
      const top = await this.prisma.attendanceRecord.aggregate({
        where: { sessionId: id, isDeleted: false },
        _max: { score: true },
      });
      if (top._max.score !== null && top._max.score > nextMaxScore) {
        throw codedError(
          HttpStatus.BAD_REQUEST,
          `Maksimal ball kiritilgan eng yuqori balldan (${top._max.score}) kichik bo'lishi mumkin emas`,
          SESSION_ERROR_CODES.MAX_SCORE_BELOW_EXISTING,
          { highestScore: top._max.score },
        );
      }
    }

    const nextStart = dto.startTime ?? session.startTime;
    const nextEnd = dto.endTime ?? session.endTime;
    const nextRoom = dto.roomId ?? session.roomId;
    const nextTeacher = dto.teacherId ?? session.teacherId;
    const slotChanged =
      nextStart !== session.startTime ||
      nextEnd !== session.endTime ||
      nextRoom !== session.roomId ||
      nextTeacher !== session.teacherId;

    if (nextStart && nextEnd) this.assertTimeRange(nextStart, nextEnd);

    return this.prisma.$transaction(async (tx) => {
      if (slotChanged && nextStart && nextEnd) {
        await lockTenantSchedule(tx, tenantId);

        if (nextStart !== session.startTime) {
          const duplicate = await tx.session.findFirst({
            where: {
              tenantId,
              groupId: session.groupId,
              sessionDate: session.sessionDate,
              startTime: nextStart,
              isDeleted: false,
              id: { not: id },
            },
            select: { id: true },
          });
          if (duplicate) {
            throw codedError(
              HttpStatus.CONFLICT,
              'Bu guruh uchun shu sana va vaqtda boshqa dars mavjud',
              SESSION_ERROR_CODES.SESSION_DUPLICATE,
              { sessionId: duplicate.id },
            );
          }
        }

        await assertNoSessionConflict(tx, {
          tenantId,
          sessionDate: session.sessionDate,
          startTime: nextStart,
          endTime: nextEnd,
          groupId: session.groupId,
          roomId: nextRoom,
          teacherId: nextTeacher,
          excludeSessionId: id,
        });
      }

      return tx.session.update({
        where: { id },
        data: {
          startTime: dto.startTime,
          endTime: dto.endTime,
          sessionType: dto.sessionType,
          topic: dto.topic,
          roomId: dto.roomId,
          teacherId: dto.teacherId,
          subjectId: dto.subjectId,
          evaluationMode: nextMode,
          maxScore: nextMaxScore,
        },
        include: {
          group: { select: { name: true } },
          room: { select: { name: true } },
          teacher: { select: { fullName: true } },
          subject: { select: { id: true, name: true } },
        },
      });
    });
  }

  // 3. DARSNI QULFLASH / QULFDAN CHIQARISH
  async lock(
    id: string,
    tenantId: string,
    requesterId: string,
    requesterRole?: string,
  ) {
    const session = await this.prisma.session.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!session) throw new NotFoundException('Dars topilmadi');

    if (requesterRole === 'teacher' && session.teacherId !== requesterId) {
      throw new ForbiddenException("Siz faqat o'z darsingizni qulflay olasiz");
    }

    if (session.isLocked)
      throw codedError(
        HttpStatus.BAD_REQUEST,
        'Dars allaqachon qulflangan',
        SESSION_ERROR_CODES.SESSION_LOCKED,
      );

    const [locked] = await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id },
        data: { isLocked: true, lockedAt: new Date(), lockedById: requesterId },
        select: { id: true, isLocked: true, lockedAt: true },
      }),
      this.sessionAudit(tenantId, requesterId, id, { isLocked: true }),
    ]);
    return locked;
  }

  // Qulflash/qulfdan chiqarish/o'chirish — yo'qlama va coin tahririga ta'sir qiladi
  private sessionAudit(
    tenantId: string,
    actorId: string,
    sessionId: string,
    changes: Prisma.InputJsonValue,
    action: AuditActionType = AuditActionType.update,
  ) {
    return this.prisma.auditLog.create({
      data: this.audit.data({
        tenantId,
        actorId,
        action,
        entityType: AUDIT_ENTITY.session,
        entityId: sessionId,
        changes,
      }),
    });
  }

  async unlock(id: string, tenantId: string, actorId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!session) throw new NotFoundException('Dars topilmadi');
    if (!session.isLocked)
      throw codedError(
        HttpStatus.BAD_REQUEST,
        'Dars qulflangan emas',
        'SESSION_NOT_LOCKED',
      );

    const [unlocked] = await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id },
        data: { isLocked: false, lockedAt: null, lockedById: null },
        select: { id: true, isLocked: true },
      }),
      this.sessionAudit(tenantId, actorId, id, { isLocked: false }),
    ]);
    return unlocked;
  }

  // 4. DARSLAR RO'YXATINI OLISH
  async findAll(
    query: QuerySessionDto,
    tenantId: string,
    requesterRole?: string,
    requesterId?: string,
  ) {
    const {
      page = 1,
      limit = 10,
      groupId,
      teacherId,
      sessionType,
      evaluationMode,
      date,
      isChecked,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SessionWhereInput = { tenantId, isDeleted: false };

    if (groupId) where.groupId = groupId;
    if (teacherId) where.teacherId = teacherId;
    if (sessionType) where.sessionType = sessionType;
    if (evaluationMode) where.evaluationMode = evaluationMode;
    if (date) where.sessionDate = new Date(date);

    // Teacher faqat o'zi dars beradigan sessiyalarni ko'radi
    if (requesterRole === 'teacher') {
      where.teacherId = requesterId;
    }

    if (isChecked !== undefined) {
      where.isChecked = isChecked;

      if (!isChecked) {
        // "Tekshirilmagan" faqat vaqti (endTime) allaqachon o'tgan sessiyalarni
        // bildiradi — hali vaqti kelmagan (kelajakdagi) sessiyalar bu yerga kirmaydi.
        // "Hozir" tenant timezone'i bo'yicha olinadi: sessionDate "lokal kalendar sana,
        // UTC-yarim tun sifatida kodlangan", startTime/endTime — lokal soat.
        const tz = await getTenantTimezone(this.prisma, tenantId);
        const now = nowInTimeZone(tz);
        const todayAsUtcMidnight = new Date(now.date);
        const nowTimeStr = now.time;

        where.OR = [
          { sessionDate: { lt: todayAsUtcMidnight } },
          { sessionDate: todayAsUtcMidnight, endTime: { lte: nowTimeStr } },
        ];
      }
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.session.findMany({
        where,
        skip,
        take: limit,
        orderBy: { sessionDate: 'desc' },
        select: SESSION_SELECT,
      }),
      this.prisma.session.count({ where }),
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

  // 5. BITTA DARS TAFSILOTI
  async findOne(
    id: string,
    tenantId: string,
    requesterRole?: string,
    requesterId?: string,
  ) {
    const session = await this.prisma.session.findFirst({
      where: { id, tenantId, isDeleted: false },
      select: { ...SESSION_SELECT, groupId: true },
    });
    if (!session) throw new NotFoundException('Dars mashguloti topilmadi');

    if (requesterRole === 'student') {
      const isMember = await this.prisma.groupStudent.findFirst({
        where: {
          groupId: session.groupId,
          studentId: requesterId,
          isDeleted: false,
        },
      });
      if (!isMember) {
        throw new ForbiddenException("Siz bu darsni ko'ra olmaysiz");
      }
    }

    if (requesterRole === 'teacher' && session.teacher.id !== requesterId) {
      throw new ForbiddenException("Siz bu darsni ko'ra olmaysiz");
    }

    return session;
  }

  // 5b. TALABANING O'Z DAVOMAT TARIXI (Shaxsiy profil uchun)
  async getMyAttendance(
    studentId: string,
    tenantId: string,
    query: QueryMyAttendanceDto,
  ) {
    const { page = 1, limit = 20, groupId, from, to } = query;
    const skip = (page - 1) * limit;

    const sessionFilter: Prisma.SessionWhereInput = { isDeleted: false };

    if (groupId) sessionFilter.groupId = groupId;

    if (from || to) {
      sessionFilter.sessionDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    // Tenant filtri yozuvning o'z tenantId'si bo'yicha (session join orqali emas)
    const where: Prisma.AttendanceRecordWhereInput = {
      studentId,
      tenantId,
      isDeleted: false,
      session: sessionFilter,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendanceRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { session: { sessionDate: 'desc' } },
        select: {
          id: true,
          isPresent: true,
          status: true,
          homeworkDone: true,
          score: true,
          note: true,
          recordedAt: true,
          session: {
            select: {
              id: true,
              sessionDate: true,
              sessionType: true,
              evaluationMode: true,
              maxScore: true,
              topic: true,
              group: { select: { id: true, name: true } },
              subject: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.attendanceRecord.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // Yo'qlama/natija saqlashdan oldingi umumiy tekshiruvlar
  private async getCheckableSession(
    sessionId: string,
    tenantId: string,
    recordedById: string,
    expectedMode: EvaluationMode,
    requesterRole?: string,
  ): Promise<CheckableSession> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, tenantId, isDeleted: false },
      include: {
        subject: { select: { name: true } },
        group: { select: { name: true } },
      },
    });

    if (!session) throw new NotFoundException('Dars topilmadi');

    if (requesterRole === 'teacher' && session.teacherId !== recordedById) {
      throw new ForbiddenException("Siz faqat o'z darsingizni tekshira olasiz");
    }

    if (session.isLocked) {
      throw codedError(
        HttpStatus.BAD_REQUEST,
        "Ushbu dars faoliyati qulflangan. Natijalarni o'zgartirib bo'lmaydi.",
        SESSION_ERROR_CODES.SESSION_LOCKED,
      );
    }

    if (session.evaluationMode !== expectedMode) {
      const endpoint =
        session.evaluationMode === EvaluationMode.scored
          ? 'results'
          : 'attendance';
      throw codedError(
        HttpStatus.BAD_REQUEST,
        `Bu sessiya "${session.evaluationMode}" rejimida tekshiriladi -- POST /sessions/:id/${endpoint} dan foydalaning`,
        SESSION_ERROR_CODES.WRONG_EVALUATION_MODE,
        { evaluationMode: session.evaluationMode },
      );
    }

    await this.assertCheckWindow(session, tenantId, requesterRole);

    return session;
  }

  // Yo'qlama/natija faqat dars boshlangandan keyin qo'yiladi. Avval saqlangan bo'lsa,
  // teacher birinchi saqlashdan keyin ATTENDANCE_EDIT_WINDOW_DAYS kun ichida tahrirlay oladi.
  // Hali saqlanmagan yo'qlama uchun muddat yo'q.
  private async assertCheckWindow(
    session: {
      sessionDate: Date;
      startTime: string | null;
      checkedAt: Date | null;
    },
    tenantId: string,
    requesterRole?: string,
  ) {
    const tz = await getTenantTimezone(this.prisma, tenantId);
    const now = nowInTimeZone(tz);
    const date = toDateString(session.sessionDate);
    const start = session.startTime ?? '00:00';

    if (date > now.date || (date === now.date && start > now.time)) {
      throw codedError(
        HttpStatus.BAD_REQUEST,
        `Dars hali boshlanmagan (${date} ${start}) — yo'qlamani dars boshlangandan keyin qo'ying`,
        SESSION_ERROR_CODES.SESSION_NOT_STARTED,
        { startsAt: { date, time: start } },
      );
    }

    if (requesterRole === 'teacher' && session.checkedAt) {
      const editableUntil = new Date(
        session.checkedAt.getTime() + ATTENDANCE_EDIT_WINDOW_DAYS * 86_400_000,
      );
      if (Date.now() > editableUntil.getTime()) {
        throw codedError(
          HttpStatus.FORBIDDEN,
          `Saqlangan yo'qlamani ${ATTENDANCE_EDIT_WINDOW_DAYS} kun ichida tahrirlash mumkin edi. O'zgartirish uchun administratorga murojaat qiling`,
          SESSION_ERROR_CODES.ATTENDANCE_EDIT_WINDOW_EXPIRED,
          { checkedAt: session.checkedAt, editableUntil },
        );
      }
    }
  }

  // O'quvchilar takrorlanmasligi va **dars sanasida** shu guruh a'zosi bo'lganini tekshirish.
  // Shu sessiyada allaqachon yozuvi bor o'quvchini qayta saqlashga ruxsat beriladi.
  private async assertStudentsBelongToSession(
    session: {
      id: string;
      groupId: string;
      tenantId: string;
      sessionDate: Date;
    },
    studentIds: string[],
  ) {
    const unique = new Set(studentIds);
    if (unique.size !== studentIds.length) {
      const duplicates = studentIds.filter(
        (id, idx) => studentIds.indexOf(id) !== idx,
      );
      throw codedError(
        HttpStatus.BAD_REQUEST,
        "Ro'yxatda bir o'quvchi bir necha marta berilgan",
        SESSION_ERROR_CODES.DUPLICATE_STUDENTS,
        { studentIds: [...new Set(duplicates)] },
      );
    }

    const [members, existing] = await Promise.all([
      this.membersAtSessionDate(session, studentIds),
      this.prisma.attendanceRecord.findMany({
        where: {
          sessionId: session.id,
          tenantId: session.tenantId,
          studentId: { in: studentIds },
          student: { tenantId: session.tenantId },
        },
        select: { studentId: true },
      }),
    ]);

    const allowed = new Set([
      ...members.map((m) => m.studentId),
      ...existing.map((e) => e.studentId),
    ]);
    const invalid = studentIds.filter((id) => !allowed.has(id));

    if (invalid.length) {
      throw codedError(
        HttpStatus.BAD_REQUEST,
        "Ayrim o'quvchilar bu sessiya guruhiga tegishli emas",
        SESSION_ERROR_CODES.STUDENTS_NOT_IN_GROUP,
        { studentIds: invalid },
      );
    }
  }

  /**
   * Dars sanasida guruh a'zosi bo'lgan o'quvchilar: shu sanaga qadar qo'shilgan (joinedAt) va
   * hali chiqarilmagan yoki shu sanadan keyin chiqarilgan (leftAt). Sanalar tenant timezone'ida.
   * Cheklov: guruhga qayta qo'shilgan o'quvchida joinedAt yangilanadi — undan oldingi
   * a'zolik davri saqlanmaydi.
   */
  private async membersAtSessionDate(
    session: { groupId: string; tenantId: string; sessionDate: Date },
    studentIds?: string[],
  ) {
    const tz = await getTenantTimezone(this.prisma, session.tenantId);
    const date = toDateString(session.sessionDate);
    const rows = await this.prisma.groupStudent.findMany({
      where: {
        groupId: session.groupId,
        ...(studentIds ? { studentId: { in: studentIds } } : {}),
        // Ikki tomonlama himoya: a'zo shu tenantdagi student bo'lishi shart — guruhga
        // noto'g'ri qo'shilgan begona user yo'qlamaga va coinga tushmaydi
        student: {
          tenantId: session.tenantId,
          isDeleted: false,
          role: { name: 'student' },
        },
        OR: [{ isDeleted: false }, { leftAt: { not: null } }],
      },
      select: {
        studentId: true,
        joinedAt: true,
        leftAt: true,
        isDeleted: true,
        student: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
    return rows.filter(
      (m) =>
        nowInTimeZone(tz, m.joinedAt).date <= date &&
        (!m.isDeleted ||
          (m.leftAt !== null && nowInTimeZone(tz, m.leftAt).date >= date)),
    );
  }

  // 6. YO'QLAMANI SAQLASH VA TANGALARNI AVTOMATIK HISOBLASH (attendance rejimi)
  async saveAttendanceAndProcessCoins(
    sessionId: string,
    tenantId: string,
    recordedById: string,
    dto: BulkAttendanceDto,
    requesterRole?: string,
  ) {
    const session = await this.getCheckableSession(
      sessionId,
      tenantId,
      recordedById,
      EvaluationMode.attendance,
      requesterRole,
    );

    await this.assertStudentsBelongToSession(
      session,
      dto.records.map((r) => r.studentId),
    );

    // Foydalanuvchiga tushunarli bo'lishi uchun: fan nomi bo'lsa shu, aks holda guruh nomi
    // (xom sessionId endi matnda ko'rsatilmaydi — u allaqachon CoinTransaction.sessionId'da saqlanadi)
    const sessionLabel = session.subject?.name ?? session.group.name;

    const coinRules = await this.prisma.coinRule.findMany({
      where: {
        tenantId,
        triggerType: TriggerType.auto,
        isDeleted: false,
        isActive: true,
      },
    });

    const pick = (sourceType: SourceType, direction: CoinDirection) =>
      pickAutoRule(coinRules, session.groupId, sourceType, direction);
    const rules: AttendanceRules = {
      attendance: pick(SourceType.attendance, CoinDirection.earn),
      homework: pick(SourceType.homework, CoinDirection.earn),
      absence: pick(SourceType.attendance, CoinDirection.deduct),
      // Kechikkan uchun alohida qoida (ixtiyoriy). Bo'lmasa — oddiy davomat coini beriladi
      late: pick(SourceType.late, CoinDirection.earn),
    };

    const common = {
      teacherId: recordedById,
      groupId: session.groupId,
      sessionId: session.id,
    };

    const plan: CheckPlanItem[] = [];

    // Holatlar avval tekshiriladi — nomuvofiqlik bo'lsa hech kim saqlanmaydi
    const statuses = new Map(
      dto.records.map((r) => [r.studentId, resolveAttendanceStatus(r)]),
    );

    for (const record of dto.records) {
      const status = statuses.get(record.studentId)!;
      const isPresent = isAttendedStatus(status);
      const items = buildAttendanceCoinItems({
        status,
        homeworkDone: record.homeworkDone,
        rules,
        common,
        sessionLabel,
      });

      plan.push({
        studentId: record.studentId,
        fields: {
          isPresent,
          status,
          homeworkDone: record.homeworkDone,
        },
        items,
      });
    }

    const coinsSkippedFor = await this.persistCheck(
      sessionId,
      tenantId,
      recordedById,
      EvaluationMode.attendance,
      plan,
    );

    return {
      success: true,
      message: 'Yoqlama muvaffaqiyatli saqlandi va tangalar hisoblandi.',
      processedRecordsCount: plan.length,
      coinsSkippedFor,
    };
  }

  // 6b. IMTIHON/MUSOBAQA NATIJALARINI SAQLASH (scored rejimi) — har bir
  // o'quvchiga ball va coin alohida kiritiladi
  async saveResultsAndProcessCoins(
    sessionId: string,
    tenantId: string,
    recordedById: string,
    dto: BulkResultsDto,
    requesterRole?: string,
  ) {
    const session = await this.getCheckableSession(
      sessionId,
      tenantId,
      recordedById,
      EvaluationMode.scored,
      requesterRole,
    );

    await this.assertStudentsBelongToSession(
      session,
      dto.records.map((r) => r.studentId),
    );

    if (session.maxScore !== null) {
      const maxScore = session.maxScore;
      const exceeded = dto.records.filter(
        (r) => r.isPresent && r.score != null && r.score > maxScore,
      );
      if (exceeded.length) {
        throw codedError(
          HttpStatus.BAD_REQUEST,
          `Ball maksimal balldan (${maxScore}) oshmasligi kerak`,
          SESSION_ERROR_CODES.SCORE_EXCEEDS_MAX,
          { maxScore, studentIds: exceeded.map((r) => r.studentId) },
        );
      }
    }

    // Natijadagi coin miqdorini teacher o'zi kiritadi — tenant limiti qo'llanadi
    await assertTeacherCoinLimit(
      this.prisma,
      tenantId,
      requesterRole,
      dto.records.filter((r) => r.isPresent).map((r) => r.coinAmount),
    );

    const sessionLabel = session.subject?.name ?? session.group.name;
    const sourceType =
      SESSION_TYPE_CONFIG[session.sessionType].scoredSourceType;

    const plan: CheckPlanItem[] = [];

    for (const record of dto.records) {
      // Qatnashmagan o'quvchiga ball va coin yozilmaydi
      const score = record.isPresent ? (record.score ?? null) : null;
      const coinAmount = record.isPresent ? record.coinAmount : 0;

      const items: SessionCoinItem[] =
        coinAmount > 0
          ? [
              {
                amount: coinAmount,
                direction: CoinDirection.earn,
                sourceType,
                note:
                  score !== null
                    ? `${sessionLabel} natijasi uchun (ball: ${score})`
                    : `${sessionLabel} natijasi uchun`,
                teacherId: recordedById,
                groupId: session.groupId,
                sessionId: session.id,
              },
            ]
          : [];

      plan.push({
        studentId: record.studentId,
        fields: {
          isPresent: record.isPresent,
          status: record.isPresent
            ? AttendanceStatus.present
            : AttendanceStatus.absent,
          homeworkDone: false,
          score,
          note: record.note ?? null,
        },
        items,
      });
    }

    const coinsSkippedFor = await this.persistCheck(
      sessionId,
      tenantId,
      recordedById,
      EvaluationMode.scored,
      plan,
    );

    return {
      success: true,
      message: 'Natijalar muvaffaqiyatli saqlandi va tangalar hisoblandi.',
      processedRecordsCount: plan.length,
      coinsSkippedFor,
    };
  }

  // Sessiya qatorini tx oxirigacha qulflaydi (SELECT ... FOR UPDATE) va qulf ostida
  // hali tekshirish mumkinligini qayta tekshiradi. Parallel saqlash/o'chirish/qulflash
  // so'rovlari shu qator bo'yicha navbatga turadi. Qulflash tartibi: avval sessiya, keyin hamyon.
  private async lockCheckableSession(
    tx: Prisma.TransactionClient,
    sessionId: string,
    expectedMode: EvaluationMode,
  ) {
    const [row] = await tx.$queryRaw<
      { is_deleted: boolean; is_locked: boolean; evaluation_mode: string }[]
    >`
      SELECT is_deleted, is_locked, evaluation_mode::text AS evaluation_mode
      FROM sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;

    if (!row || row.is_deleted) throw new NotFoundException('Dars topilmadi');

    if (row.is_locked) {
      throw codedError(
        HttpStatus.BAD_REQUEST,
        "Ushbu dars faoliyati qulflangan. Natijalarni o'zgartirib bo'lmaydi.",
        SESSION_ERROR_CODES.SESSION_LOCKED,
      );
    }

    if (row.evaluation_mode !== expectedMode) {
      throw codedError(
        HttpStatus.BAD_REQUEST,
        `Bu sessiya "${row.evaluation_mode}" rejimida tekshiriladi`,
        SESSION_ERROR_CODES.WRONG_EVALUATION_MODE,
        { evaluationMode: row.evaluation_mode },
      );
    }
  }

  /**
   * Tekshiruvni (yo'qlama yoki natija) **bitta tranzaksiyada** saqlaydi: sessiya bir marta
   * qulflanadi, har bir o'quvchi uchun yozuv upsert qilinadi va coinlari almashtiriladi,
   * oxirida sessiya tekshirilgan deb belgilanadi. Hammasi yoki hech narsa — yarmi saqlanib
   * qolmaydi. Coin o'tkazib yuborilishi (balans yetmasligi) xato emas, `coinsSkippedFor` da qaytadi.
   * O'quvchilar studentId tartibida — parallel tranzaksiyalar hamyonlarni bir xil tartibda
   * qulflaydi (deadlock bo'lmaydi).
   */
  private async persistCheck(
    sessionId: string,
    tenantId: string,
    recordedById: string,
    mode: EvaluationMode,
    plan: CheckPlanItem[],
  ): Promise<CoinSkippedItem[]> {
    const ordered = [...plan].sort((a, b) =>
      a.studentId < b.studentId ? -1 : a.studentId > b.studentId ? 1 : 0,
    );

    return this.prisma.$transaction(async (tx) => {
      await this.lockCheckableSession(tx, sessionId, mode);

      await this.saveRecords(tx, sessionId, tenantId, recordedById, ordered);

      // Butun guruh coinlari bitta to'plamda (so'rovlar soni o'quvchilar soniga bog'liq emas)
      const results = await this.coinTrxService.replaceSessionTransactionsBulk(
        tx,
        {
          tenantId,
          sessionId,
          sourceTypes: SESSION_MANAGED_SOURCE_TYPES[mode],
          students: ordered.map((p) => ({
            studentId: p.studentId,
            items: p.items,
          })),
          actorId: recordedById,
        },
      );

      const coinsSkippedFor: CoinSkippedItem[] = [];
      for (const item of ordered) {
        this.collectSkipped(
          item.studentId,
          results.get(item.studentId)!,
          coinsSkippedFor,
        );
      }

      await this.markChecked(tx, sessionId);
      return coinsSkippedFor;
    }, CHECK_TX_OPTIONS);
  }

  /**
   * Yo'qlama/natija yozuvlarini saqlaydi: yangilari — bitta createMany, mavjudlari — faqat
   * qiymati o'zgarganlari yangilanadi (qayta saqlashda o'zgarmagan o'quvchilarga so'rov yo'q).
   * Sessiya qatori qulflangan — parallel saqlash bu yerga navbat bilan keladi.
   */
  private async saveRecords(
    tx: Prisma.TransactionClient,
    sessionId: string,
    tenantId: string,
    recordedById: string,
    plan: CheckPlanItem[],
  ) {
    const existing = await tx.attendanceRecord.findMany({
      where: { sessionId, studentId: { in: plan.map((p) => p.studentId) } },
      select: {
        id: true,
        studentId: true,
        isPresent: true,
        status: true,
        homeworkDone: true,
        score: true,
        note: true,
        isDeleted: true,
      },
    });
    const byStudent = new Map(existing.map((r) => [r.studentId, r]));

    const toCreate: Prisma.AttendanceRecordCreateManyInput[] = [];
    for (const item of plan) {
      const current = byStudent.get(item.studentId);
      if (!current) {
        toCreate.push({
          ...item.fields,
          sessionId,
          tenantId,
          studentId: item.studentId,
          recordedById,
        });
        continue;
      }
      if (!current.isDeleted && !recordChanged(current, item.fields)) continue;

      await tx.attendanceRecord.update({
        where: { id: current.id },
        data: { ...item.fields, recordedById, isDeleted: false },
      });
    }

    if (toCreate.length) {
      await tx.attendanceRecord.createMany({ data: toCreate });
    }
  }

  // isChecked + birinchi saqlash vaqti (checkedAt faqat birinchi marta yoziladi)
  private async markChecked(tx: Prisma.TransactionClient, sessionId: string) {
    await tx.session.update({
      where: { id: sessionId },
      data: { isChecked: true },
    });
    await tx.session.updateMany({
      where: { id: sessionId, checkedAt: null },
      data: { checkedAt: new Date() },
    });
  }

  private collectSkipped(
    studentId: string,
    result: Awaited<
      ReturnType<CoinTransactionsService['replaceSessionTransactions']>
    >,
    target: CoinSkippedItem[],
  ) {
    if (result.skipped) {
      target.push({
        studentId,
        code: result.code ?? 'COINS_NOT_UPDATED',
        reason:
          result.reason ?? "Avvalgi coinlarni avtomatik yangilab bo'lmadi",
      });
      return;
    }
    for (const item of result.skippedItems) {
      target.push({ studentId, ...item });
    }
  }

  // 7a. YO'QLAMA FORMASI UCHUN O'QUVCHILAR RO'YXATI — dars sanasida guruhda bo'lganlar
  // (keyin qo'shilganlar kirmaydi, keyin chiqarilganlar kiradi) + allaqachon yozuvi borlar
  async getRoster(
    sessionId: string,
    tenantId: string,
    requesterRole?: string,
    requesterId?: string,
  ) {
    // Sessiya bir marta o'qiladi (ruxsat tekshiruvi bilan) — a'zolar va yozuvlar shundan
    const session = await this.findOne(
      sessionId,
      tenantId,
      requesterRole,
      requesterId,
    );

    const [members, records] = await Promise.all([
      this.membersAtSessionDate(session),
      this.recordsWithCoins(session.id, session.evaluationMode),
    ]);
    const recordByStudent = new Map(records.map((r) => [r.studentId, r]));

    const students: {
      student: { id: string; fullName: string; avatarUrl: string | null };
      joinedAt: Date | null;
      leftAt: Date | null;
      record: {
        status: AttendanceStatus;
        isPresent: boolean;
        homeworkDone: boolean;
        score: number | null;
        note: string | null;
      } | null;
      coinAwarded: number;
    }[] = members.map((m) => {
      const r = recordByStudent.get(m.studentId);
      recordByStudent.delete(m.studentId);
      return {
        student: m.student,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
        record: r
          ? {
              status: r.status,
              isPresent: r.isPresent,
              homeworkDone: r.homeworkDone,
              score: r.score,
              note: r.note,
            }
          : null,
        coinAwarded: r?.coinAwarded ?? 0,
      };
    });

    // Yozuvi bor, lekin a'zolik ma'lumoti topilmagan (masalan qayta qo'shilgan) o'quvchilar
    for (const r of recordByStudent.values()) {
      students.push({
        student: {
          id: r.studentId,
          fullName: r.student.fullName,
          avatarUrl: null,
        },
        joinedAt: null,
        leftAt: null,
        record: {
          status: r.status,
          isPresent: r.isPresent,
          homeworkDone: r.homeworkDone,
          score: r.score,
          note: r.note,
        },
        coinAwarded: r.coinAwarded,
      });
    }

    students.sort((a, b) =>
      a.student.fullName.localeCompare(b.student.fullName),
    );

    return {
      session: {
        id: session.id,
        sessionDate: session.sessionDate,
        evaluationMode: session.evaluationMode,
      },
      students,
    };
  }

  // 7. YO'QLAMA / NATIJALAR RO'YXATINI OLISH
  async getAttendanceBySession(
    sessionId: string,
    tenantId: string,
    requesterRole?: string,
    requesterId?: string,
  ) {
    const session = await this.findOne(
      sessionId,
      tenantId,
      requesterRole,
      requesterId,
    );
    return this.recordsWithCoins(session.id, session.evaluationMode);
  }

  // Sessiya yozuvlari + shu tekshiruv orqali har bir o'quvchiga berilgan sof coin
  private async recordsWithCoins(
    sessionId: string,
    evaluationMode: EvaluationMode,
  ) {
    const [records, transactions] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { sessionId, isDeleted: false },
        include: {
          student: { select: { id: true, fullName: true, phone: true } },
        },
      }),
      this.prisma.coinTransaction.findMany({
        where: {
          sessionId,
          ...EFFECTIVE_COIN_TX_WHERE,
          sourceType: {
            in: SESSION_MANAGED_SOURCE_TYPES[evaluationMode],
          },
        },
        select: { studentId: true, amount: true, direction: true },
      }),
    ]);

    // Shu sessiya tekshiruvi orqali o'quvchiga berilgan sof coin (earn - deduct)
    const coinByStudent = new Map<string, number>();
    for (const t of transactions) {
      const delta = t.direction === CoinDirection.earn ? t.amount : -t.amount;
      coinByStudent.set(
        t.studentId,
        (coinByStudent.get(t.studentId) ?? 0) + delta,
      );
    }

    return records.map((r) => ({
      ...r,
      coinAwarded: coinByStudent.get(r.studentId) ?? 0,
    }));
  }

  // 8. DARSNI O'CHIRISH — shu sessiya tekshiruvi orqali berilgan coinlar ham
  // qaytariladi (keepCoins=true bo'lsa qaytarilmaydi)
  async remove(
    id: string,
    tenantId: string,
    keepCoins = false,
    actorId?: string,
  ) {
    await this.findOne(id, tenantId);

    return this.prisma.$transaction(async (tx) => {
      // Sessiya qulflanadi — shu payt parallel yo'qlama saqlanib, o'chirilayotgan sessiyaga coin yozilmasin
      const [locked] = await tx.$queryRaw<{ is_deleted: boolean }[]>`
        SELECT is_deleted FROM sessions WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked || locked.is_deleted) {
        throw new NotFoundException('Dars topilmadi');
      }

      let reversedTransactions = 0;

      if (!keepCoins) {
        const reversal = await this.coinTrxService.reverseSessionTransactions(
          tx,
          id,
          ALL_SESSION_MANAGED_SOURCE_TYPES,
          actorId,
        );
        if (reversal.blockedStudentIds.length) {
          throw codedError(
            HttpStatus.CONFLICT,
            "Ayrim o'quvchilar bu sessiyadan olgan coinlarini sarflab bo'lgan -- coinlarni qaytarib bo'lmaydi. keepCoins=true bilan o'chirish mumkin",
            SESSION_ERROR_CODES.SESSION_COINS_SPENT,
            { studentIds: reversal.blockedStudentIds },
          );
        }
        reversedTransactions = reversal.reversed;
      }

      const deleted = await tx.session.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
      });

      if (actorId) {
        await tx.auditLog.create({
          data: this.audit.data({
            tenantId,
            actorId,
            action: AuditActionType.delete,
            entityType: AUDIT_ENTITY.session,
            entityId: id,
            changes: {
              keepCoins,
              reversedTransactions,
              sessionDate: toDateString(deleted.sessionDate),
              groupId: deleted.groupId,
            },
          }),
        });
      }

      return { ...deleted, reversedTransactions };
    });
  }
}
