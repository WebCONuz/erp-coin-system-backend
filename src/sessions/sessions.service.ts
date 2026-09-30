import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
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
  CoinDirection,
  EvaluationMode,
  SourceType,
  TriggerType,
} from 'src/generated/prisma/enums';
import { CoinTransactionsService } from 'src/coin-transaction/coin-transaction.service';
import { Prisma } from 'src/generated/prisma/client';
import { SessionCoinItem } from 'src/common/types';
import {
  ALL_SESSION_MANAGED_SOURCE_TYPES,
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
            where: { id: refs.teacherId, tenantId, isDeleted: false },
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
    }

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

    const existingSession = await this.prisma.session.findFirst({
      where: {
        sessionDate: new Date(dto.sessionDate),
        startTime: dto.startTime,
        endTime: dto.endTime,
        sessionType: dto.sessionType,
        groupId: dto.groupId,
        teacherId,
        tenantId,
        isDeleted: false,
      },
    });

    if (existingSession) {
      throw new ConflictException(
        "Bu guruh uchun ko'rsatilgan sanada dars sessiyasi allaqachon yaratilgan!",
      );
    }

    return this.prisma.session.create({
      data: {
        sessionDate: new Date(dto.sessionDate),
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
      const hasStructuralChange = structuralFields.some((f) => f in dto);
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

    return this.prisma.session.update({
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

    return this.prisma.session.update({
      where: { id },
      data: { isLocked: true, lockedAt: new Date(), lockedById: requesterId },
      select: { id: true, isLocked: true, lockedAt: true },
    });
  }

  async unlock(id: string, tenantId: string) {
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

    return this.prisma.session.update({
      where: { id },
      data: { isLocked: false, lockedAt: null, lockedById: null },
      select: { id: true, isLocked: true },
    });
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
        // Sana/vaqt solishtirish server LOKAL vaqti asosida qilinadi (getFullYear/
        // getMonth/getDate/getHours/getMinutes — getUTC* emas), chunki
        // sessionDate "lokal kalendar sana, UTC-yarim tun sifatida kodlangan"
        // konventsiyasida saqlanadi (generate-sessions/schedule bilan bir xil
        // yondashuv) va startTime/endTime lokal soat sifatida kiritiladi.
        const now = new Date();
        const todayAsUtcMidnight = new Date(
          Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
        );
        const nowTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
          now.getMinutes(),
        ).padStart(2, '0')}`;

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

    const sessionFilter: Prisma.SessionWhereInput = {
      tenantId,
      isDeleted: false,
    };

    if (groupId) sessionFilter.groupId = groupId;

    if (from || to) {
      sessionFilter.sessionDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const where: Prisma.AttendanceRecordWhereInput = {
      studentId,
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

    return session;
  }

  // O'quvchilar takrorlanmasligi va shu guruh a'zosi ekanini tekshirish.
  // Guruhdan chiqib ketgan, lekin shu sessiyada allaqachon yozuvi bor
  // o'quvchini qayta saqlashga ruxsat beriladi.
  private async assertStudentsBelongToSession(
    session: { id: string; groupId: string },
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
      this.prisma.groupStudent.findMany({
        where: {
          groupId: session.groupId,
          studentId: { in: studentIds },
          isDeleted: false,
        },
        select: { studentId: true },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { sessionId: session.id, studentId: { in: studentIds } },
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

    // sourceType + direction bo'yicha qoida topish. Guruhga xos qoida
    // (groupId shu sessiondagi guruhga teng) tenant darajasidagi umumiy
    // qoidadan (groupId: null) ustun turadi — eng aniq mos qoida tanlanadi.
    const findRule = (sourceType: SourceType, direction: CoinDirection) => {
      const candidates = coinRules.filter(
        (r) => r.sourceType === sourceType && r.direction === direction,
      );
      return (
        candidates.find((r) => r.groupId === session.groupId) ??
        candidates.find((r) => r.groupId === null)
      );
    };

    const attendanceRule = findRule(SourceType.attendance, CoinDirection.earn);
    const homeworkRule = findRule(SourceType.homework, CoinDirection.earn);
    const absenceRule = findRule(SourceType.attendance, CoinDirection.deduct);

    const coinRewardForAttendance = attendanceRule
      ? attendanceRule.coinAmount
      : 5;
    const coinRewardForHomework = homeworkRule ? homeworkRule.coinAmount : 10;

    const common = {
      teacherId: recordedById,
      groupId: session.groupId,
      sessionId: session.id,
    };

    let processed = 0;
    const coinsSkippedFor: CoinSkippedItem[] = [];

    for (const record of dto.records) {
      const items: SessionCoinItem[] = [];

      if (record.isPresent) {
        items.push({
          ...common,
          amount: coinRewardForAttendance,
          direction: CoinDirection.earn,
          sourceType: SourceType.attendance,
          note: `Darsda qatnashgani uchun avtomatik bonus (${sessionLabel})`,
          ruleId: attendanceRule?.id,
        });
      }

      if (record.homeworkDone) {
        items.push({
          ...common,
          amount: coinRewardForHomework,
          direction: CoinDirection.earn,
          sourceType: SourceType.homework,
          note: `Uy vazifasini bajargani uchun bonus (${sessionLabel})`,
          ruleId: homeworkRule?.id,
        });
      }

      // Kelmaganlarga jarima (faqat absenceRule mavjud bolsa)
      if (!record.isPresent && absenceRule) {
        items.push({
          ...common,
          amount: absenceRule.coinAmount,
          direction: CoinDirection.deduct,
          sourceType: SourceType.attendance,
          note: `Darsga sababsiz kelmagani uchun jarima (${sessionLabel})`,
          ruleId: absenceRule.id,
        });
      }

      // Yozuv va coinlar bitta tranzaksiyada — biri muvaffaqiyatsiz bo'lsa ikkinchisi ham qaytadi.
      // Yo'qlama qayta saqlanganda avvalgi avtomatik tranzaksiyalar bekor qilinib,
      // joriy holatga mos yangisi yaratiladi — coin dublikat bo'lmaydi.
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.attendanceRecord.upsert({
          where: {
            sessionId_studentId: { sessionId, studentId: record.studentId },
          },
          update: {
            isPresent: record.isPresent,
            homeworkDone: record.homeworkDone,
            recordedById,
            isDeleted: false,
          },
          create: {
            sessionId,
            studentId: record.studentId,
            isPresent: record.isPresent,
            homeworkDone: record.homeworkDone,
            recordedById,
          },
        });

        return this.coinTrxService.replaceSessionTransactions(tx, {
          sessionId,
          studentId: record.studentId,
          sourceTypes: SESSION_MANAGED_SOURCE_TYPES[EvaluationMode.attendance],
          items,
        });
      });

      processed++;
      this.collectSkipped(record.studentId, result, coinsSkippedFor);
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { isChecked: true },
    });

    return {
      success: true,
      message: 'Yoqlama muvaffaqiyatli saqlandi va tangalar hisoblandi.',
      processedRecordsCount: processed,
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

    const sessionLabel = session.subject?.name ?? session.group.name;
    const sourceType =
      SESSION_TYPE_CONFIG[session.sessionType].scoredSourceType;

    let processed = 0;
    const coinsSkippedFor: CoinSkippedItem[] = [];

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

      const result = await this.prisma.$transaction(async (tx) => {
        await tx.attendanceRecord.upsert({
          where: {
            sessionId_studentId: { sessionId, studentId: record.studentId },
          },
          update: {
            isPresent: record.isPresent,
            homeworkDone: false,
            score,
            note: record.note ?? null,
            recordedById,
            isDeleted: false,
          },
          create: {
            sessionId,
            studentId: record.studentId,
            isPresent: record.isPresent,
            homeworkDone: false,
            score,
            note: record.note ?? null,
            recordedById,
          },
        });

        return this.coinTrxService.replaceSessionTransactions(tx, {
          sessionId,
          studentId: record.studentId,
          sourceTypes: SESSION_MANAGED_SOURCE_TYPES[EvaluationMode.scored],
          items,
        });
      });

      processed++;
      this.collectSkipped(record.studentId, result, coinsSkippedFor);
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { isChecked: true },
    });

    return {
      success: true,
      message: 'Natijalar muvaffaqiyatli saqlandi va tangalar hisoblandi.',
      processedRecordsCount: processed,
      coinsSkippedFor,
    };
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
          isDeleted: false,
          sourceType: {
            in: SESSION_MANAGED_SOURCE_TYPES[session.evaluationMode],
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
  async remove(id: string, tenantId: string, keepCoins = false) {
    await this.findOne(id, tenantId);

    return this.prisma.$transaction(async (tx) => {
      let reversedTransactions = 0;

      if (!keepCoins) {
        const reversal = await this.coinTrxService.reverseSessionTransactions(
          tx,
          id,
          ALL_SESSION_MANAGED_SOURCE_TYPES,
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

      return { ...deleted, reversedTransactions };
    });
  }
}
