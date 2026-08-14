import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { QuerySessionDto } from './dto/query-session.dto';
import { BulkAttendanceDto } from './dto/record-attendance.dto';
import {
  CoinDirection,
  SourceType,
  TriggerType,
} from 'src/generated/prisma/enums';
import { CoinTransactionsService } from 'src/coin-transaction/coin-transaction.service';
import { AttendanceRecord, Prisma } from 'src/generated/prisma/client';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coinTrxService: CoinTransactionsService,
  ) {}

  // 1. DARS YARATISH
  async create(tenantId: string, dto: CreateSessionDto) {
    const existingSession = await this.prisma.session.findFirst({
      where: {
        sessionDate: dto.sessionDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        sessionType: dto.sessionType,
        groupId: dto.groupId,
        teacherId: dto.teacherId,
        tenantId,
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
        topic: dto.topic || null,
        groupId: dto.groupId,
        roomId: dto.roomId,
        teacherId: dto.teacherId,
        tenantId,
      },
    });
  }

  // 2. DARSNI TAHRIRLASH
  async update(id: string, tenantId: string, dto: UpdateSessionDto) {
    const session = await this.prisma.session.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!session) throw new NotFoundException('Dars topilmadi');
    if (session.isLocked) {
      throw new ForbiddenException(
        'Dars qulflangan -- tahrirlash mumkin emas. Avval qulfni oching.',
      );
    }
    return this.prisma.session.update({
      where: { id },
      data: dto,
      include: {
        group: { select: { name: true } },
        room: { select: { name: true } },
        teacher: { select: { fullName: true } },
      },
    });
  }

  // 3. DARSNI QULFLASH / QULFDAN CHIQARISH
  async lock(id: string, tenantId: string, requesterId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!session) throw new NotFoundException('Dars topilmadi');
    if (session.isLocked)
      throw new BadRequestException('Dars allaqachon qulflangan');

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
      throw new BadRequestException('Dars qulflangan emas');

    return this.prisma.session.update({
      where: { id },
      data: { isLocked: false, lockedAt: null, lockedById: null },
      select: { id: true, isLocked: true },
    });
  }

  // 4. DARSLAR RO'YXATINI OLISH
  async findAll(query: QuerySessionDto, tenantId: string) {
    const {
      page = 1,
      limit = 10,
      groupId,
      teacherId,
      sessionType,
      date,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SessionWhereInput = { tenantId, isDeleted: false };

    if (groupId) where.groupId = groupId;
    if (teacherId) where.teacherId = teacherId;
    if (sessionType) where.sessionType = sessionType;
    if (date) where.sessionDate = new Date(date);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.session.findMany({
        where,
        skip,
        take: limit,
        orderBy: { sessionDate: 'desc' },
        include: {
          group: { select: { name: true } },
          room: { select: { name: true } },
          teacher: { select: { fullName: true } },
        },
      }),
      this.prisma.session.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // 5. BITTA DARS TAFSILOTI
  async findOne(id: string, tenantId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id, tenantId, isDeleted: false },
      include: {
        group: { select: { name: true } },
        room: { select: { name: true } },
        teacher: { select: { fullName: true } },
      },
    });
    if (!session) throw new NotFoundException('Dars mashguloti topilmadi');
    return session;
  }

  // 6. YO'QLAMANI SAQLASH VA TANGALARNI AVTOMATIK HISOBLASH
  async saveAttendanceAndProcessCoins(
    sessionId: string,
    tenantId: string,
    recordedById: string,
    dto: BulkAttendanceDto,
  ) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, tenantId, isDeleted: false },
    });

    if (!session) throw new NotFoundException('Dars topilmadi');
    if (session.isLocked) {
      throw new BadRequestException(
        'Ushbu dars faoliyati qulflangan. Yoqlamani ozgartirib bolmaydi.',
      );
    }

    const coinRules = await this.prisma.coinRule.findMany({
      where: {
        tenantId,
        triggerType: TriggerType.auto,
        isDeleted: false,
        isActive: true,
      },
    });

    // sourceType bo'yicha qoida topish — xavfsiz va aniq usul
    const attendanceRule = coinRules.find(
      (r) =>
        r.sourceType === SourceType.attendance &&
        r.direction === CoinDirection.earn,
    );
    const homeworkRule = coinRules.find(
      (r) =>
        r.sourceType === SourceType.homework &&
        r.direction === CoinDirection.earn,
    );
    const absenceRule = coinRules.find(
      (r) =>
        r.sourceType === SourceType.attendance &&
        r.direction === CoinDirection.deduct,
    );

    const coinRewardForAttendance = attendanceRule
      ? attendanceRule.coinAmount
      : 5;
    const coinRewardForHomework = homeworkRule ? homeworkRule.coinAmount : 10;

    const results: AttendanceRecord[] = [];

    for (const record of dto.records) {
      const attendanceRecord = await this.prisma.attendanceRecord.upsert({
        where: {
          sessionId_studentId: { sessionId, studentId: record.studentId },
        },
        update: {
          isPresent: record.isPresent,
          homeworkDone: record.homeworkDone,
          recordedById,
        },
        create: {
          sessionId,
          studentId: record.studentId,
          isPresent: record.isPresent,
          homeworkDone: record.homeworkDone,
          recordedById,
        },
      });

      if (record.isPresent) {
        await this.coinTrxService.createInternalTransaction(tenantId, {
          studentId: record.studentId,
          amount: coinRewardForAttendance,
          direction: CoinDirection.earn,
          sourceType: SourceType.attendance,
          note: `Darsda qatnashgani uchun avtomatik bonus. Dars ID: ${sessionId}`,
          teacherId: recordedById,
          ruleId: attendanceRule?.id,
          groupId: session.groupId,
          sessionId: session.id,
        });
      }

      if (record.homeworkDone) {
        await this.coinTrxService.createInternalTransaction(tenantId, {
          studentId: record.studentId,
          amount: coinRewardForHomework,
          direction: CoinDirection.earn,
          sourceType: SourceType.homework,
          note: `Uy vazifasini bajargani uchun bonus. Dars ID: ${sessionId}`,
          teacherId: recordedById,
          ruleId: homeworkRule?.id,
          groupId: session.groupId,
          sessionId: session.id,
        });
      }

      // Kelmaganlarga jarima (faqat absenceRule mavjud bolsa)
      if (!record.isPresent && absenceRule) {
        await this.coinTrxService.createInternalTransaction(tenantId, {
          studentId: record.studentId,
          amount: absenceRule.coinAmount,
          direction: CoinDirection.deduct,
          sourceType: SourceType.attendance,
          note: `Darsga sababsiz kelmagani uchun jarima. Dars ID: ${sessionId}`,
          teacherId: recordedById,
          ruleId: absenceRule.id,
          groupId: session.groupId,
          sessionId: session.id,
        });
      }

      if (attendanceRecord) {
        results.push(attendanceRecord);
      }
    }

    return {
      success: true,
      message: 'Yoqlama muvaffaqiyatli saqlandi va tangalar hisoblandi.',
      processedRecordsCount: results.length,
    };
  }

  // 7. YO'QLAMA RO'YXATINI OLISH
  async getAttendanceBySession(sessionId: string, tenantId: string) {
    await this.findOne(sessionId, tenantId);

    return this.prisma.attendanceRecord.findMany({
      where: { sessionId, isDeleted: false },
      include: {
        student: { select: { id: true, fullName: true, phone: true } },
      },
    });
  }

  // 8. DARSNI O'CHIRISH
  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.session.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }
}
