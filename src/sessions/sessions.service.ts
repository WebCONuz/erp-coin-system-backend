import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
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

  // 2. DARSLAR RO‘YXATINI OLISH
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

  // 3. BITTA DARS TAFSILOTI
  async findOne(id: string, tenantId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id, tenantId, isDeleted: false },
      include: {
        group: { select: { name: true } },
        room: { select: { name: true } },
        teacher: { select: { fullName: true } },
      },
    });
    if (!session) throw new NotFoundException('Dars mashg‘uloti topilmadi');
    return session;
  }

  // 4. YO‘QLAMANI SAQLASH VA TANGALARNI AVTOMATIK HISOBLASH (ENG MUHIM BIZNES LOGIKA)
  async saveAttendanceAndProcessCoins(
    sessionId: string,
    tenantId: string,
    recordedById: string,
    dto: BulkAttendanceDto,
  ) {
    // A. Dars borligi va qulflanmaganligini (isLocked) tekshiramiz
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, tenantId, isDeleted: false },
    });

    if (!session) throw new NotFoundException('Dars topilmadi');
    if (session.isLocked) {
      throw new BadRequestException(
        'Ushbu dars faoliyati qulflangan (arxivlangan). Yo‘qlamani o‘zgartirib bo‘lmaydi.',
      );
    }

    // B. Tizimdagi shu tenant uchun avtomatik ("auto") triggerli Tanga Qoidalarini (`CoinRule`) qidiramiz
    const coinRules = await this.prisma.coinRule.findMany({
      where: {
        tenantId,
        triggerType: TriggerType.auto,
        isDeleted: false,
        isActive: true,
      },
    });

    // Ssenariy uchun standart qoidalar (Agar bazada maxsus yaratilmagan bo'lsa, xato bermasligi uchun default miqdorlar)
    const attendanceRule = coinRules.find(
      (r) =>
        r.name.toLowerCase().includes('dars') ||
        r.name.toLowerCase().includes('kelgan'),
    );
    const homeworkRule = coinRules.find(
      (r) =>
        r.name.toLowerCase().includes('vazifa') ||
        r.name.toLowerCase().includes('vazifasini'),
    );

    const coinRewardForAttendance = attendanceRule
      ? attendanceRule.coinAmount
      : 5; // default 5 tanga
    const coinRewardForHomework = homeworkRule ? homeworkRule.coinAmount : 10; // default 10 tanga

    // C. Har bir o‘quvchi bo‘yicha sikl aylanib, tranzaksiyaviy yo‘qlama kiritamiz
    const results: AttendanceRecord[] = [];

    for (const record of dto.records) {
      // Yo‘qlama yozuvini yaratamiz yoki eskisini yangilaymiz (Upsert)
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

      // ---- Tanga hisoblash triggerlari boshlanadi ----

      // Ssenariy 1: Darsda qatnashgani uchun coin berish
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

      // Ssenariy 2: Uy vazifasini bajargani uchun qo‘shimcha coin berish
      if (record.homeworkDone) {
        await this.coinTrxService.createInternalTransaction(tenantId, {
          studentId: record.studentId,
          amount: coinRewardForHomework,
          direction: CoinDirection.earn,
          sourceType: SourceType.homework,
          note: `Uy vazifasini muvaffaqiyatli bajargani uchun bonus. Dars ID: ${sessionId}`,
          teacherId: recordedById,
          ruleId: homeworkRule?.id,
          groupId: session.groupId,
          sessionId: session.id,
        });
      }

      // Ssenariy 3: Darsga KELMAGANI uchun jazo sifatida coin ayirish (hozircha commetda)

      //   if (!record.isPresent) {
      //     const absenceRule = coinRules.find(
      //       (r) =>
      //         r.name.toLowerCase().includes('kelmadi') ||
      //         r.name.toLowerCase().includes('kelmaslik'),
      //     );
      //     const coinDeductForAbsence = absenceRule ? absenceRule.coinAmount : 3; // topilmasa default 3 coin ayiramiz

      //     await this.coinTrxService.createInternalTransaction(tenantId, {
      //       studentId: record.studentId,
      //       amount: coinDeductForAbsence,
      //       direction: CoinDirection.deduct, // 🔴 AYIRISH (DEDUCT)
      //       sourceType: SourceType.manual, // yoki sizda boshqa enum turi bo'lsa (masalan penalty)
      //       note: `Darsda qatnashmagani (Sababsiz) uchun avtomatik jarima. Dars ID: ${sessionId}`,
      //       teacherId: recordedById,
      //       ruleId: absenceRule?.id,
      //       groupId: session.groupId,
      //       sessionId: session.id,
      //     });
      //   }

      if (attendanceRecord) {
        results.push(attendanceRecord);
      }
    }

    return {
      success: true,
      message:
        'Yo‘qlama muvaffaqiyatli saqlandi va o‘quvchilarning hamyonlariga bonus tangalar hisoblandi.',
      processedRecordsCount: results.length,
    };
  }

  // 5. YO‘QLAMA RO‘YXATINI OLISH
  async getAttendanceBySession(sessionId: string, tenantId: string) {
    // Oldin darsni tekshiramiz
    await this.findOne(sessionId, tenantId);

    return this.prisma.attendanceRecord.findMany({
      where: { sessionId, isDeleted: false },
      include: {
        student: { select: { id: true, fullName: true, phone: true } },
      },
    });
  }

  // 6. DARSNI O‘CHIRISH
  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.session.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }
}
