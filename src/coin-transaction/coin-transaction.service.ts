import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCoinTransactionDto } from './dto/create-coin-transaction.dto';
import { QueryCoinTransactionDto } from './dto/query-coin-transaction.dto';
import { QueryMyCoinHistoryDto } from './dto/query-my-coin-history.dto';
import { QueryCoinStatsDto } from './dto/query-coin-stats.dto';
import { BulkGiveCoinDto } from './dto/bulk-give-coin.dto';
import { ApplyCoinRuleDto } from './dto/apply-coin-rule.dto';
import {
  CoinDirection,
  SourceType,
  TriggerType,
} from 'src/generated/prisma/enums';
import {
  ExecuteCoinProcessData,
  ReplaceSessionCoinsResult,
  SessionCoinItem,
  SkippedSessionCoinItem,
} from 'src/common/types';
import { CoinTransaction, Prisma } from 'src/generated/prisma/client';
import {
  EFFECTIVE_COIN_TX_WHERE,
  VISIBLE_COIN_TX_WHERE,
} from './constants/effective-transaction';
import {
  ALL_SESSION_MANAGED_SOURCE_TYPES,
  COIN_SKIP_CODES,
} from 'src/sessions/constants/session-types';
import {
  canTeacherAccessGroup,
  teacherGroupAccessWhere,
} from 'src/common/utils/teacher-group-access';
import { assertTeacherCoinLimit } from 'src/common/utils/teacher-coin-limit';

export interface BulkCoinResultItem {
  studentId: string;
  success: boolean;
  direction?: CoinDirection;
  transactionId?: string;
  newBalance?: number;
  error?: string;
}

@Injectable()
export class CoinTransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. MANUALLY (QO'LDA) TRANZAKSIYA YARATISH (Controller ishlatadi)
  async createManualTransaction(
    tenantId: string,
    teacherId: string,
    dto: CreateCoinTransactionDto,
    requesterRole?: string,
  ) {
    // Teacher faqat o'zi dars beradigan guruhdagi o'quvchiga coin bera oladi
    if (requesterRole === 'teacher') {
      const isOwnStudent = await this.prisma.groupStudent.findFirst({
        where: {
          studentId: dto.studentId,
          isDeleted: false,
          group: {
            tenantId,
            isDeleted: false,
            ...teacherGroupAccessWhere(teacherId),
          },
        },
      });
      if (!isOwnStudent) {
        throw new ForbiddenException(
          "Siz faqat o'z guruhingizdagi o'quvchiga tanga bera olasiz",
        );
      }
    }

    await this.assertManualRefs(tenantId, teacherId, requesterRole, {
      ruleId: dto.ruleId,
      groupId: dto.groupId,
      sessionId: dto.sessionId,
    });
    await assertTeacherCoinLimit(this.prisma, tenantId, requesterRole, [
      dto.amount,
    ]);

    return this.executeCoinProcess(tenantId, {
      studentId: dto.studentId,
      amount: dto.amount,
      direction: dto.direction,
      sourceType: dto.sourceType,
      note: dto.note,
      teacherId,
      ruleId: dto.ruleId,
      groupId: dto.groupId,
      sessionId: dto.sessionId,
    });
  }

  // 2. TIZIM ICHKI XIZMATLARI UCHUN INTERFEYS (Buni dars yo'qlama moduli chaqiradi)
  async createInternalTransaction(
    tenantId: string,
    data: ExecuteCoinProcessData,
  ) {
    return this.executeCoinProcess(tenantId, data);
  }

  // 2a. Qo'lda coin so'rovidagi havolalar (qoida, guruh, sessiya) shu tenantga tegishli
  // va o'chirilmagan bo'lishi shart; teacher uchun guruh/sessiya unga tegishli bo'lishi kerak.
  // Aks holda boshqa tenantning yoki begona sessiyaning ID'sini tranzaksiyaga yozish mumkin edi.
  private async assertManualRefs(
    tenantId: string,
    requesterId: string,
    requesterRole: string | undefined,
    refs: { ruleId?: string; groupId?: string; sessionId?: string },
  ) {
    const isTeacher = requesterRole === 'teacher';

    if (refs.ruleId) {
      const rule = await this.prisma.coinRule.findFirst({
        where: { id: refs.ruleId, tenantId, isDeleted: false },
        select: { id: true },
      });
      if (!rule) throw new NotFoundException('Tanga qoidasi topilmadi');
    }

    if (refs.groupId) {
      const group = await this.prisma.group.findFirst({
        where: { id: refs.groupId, tenantId, isDeleted: false },
        select: { id: true },
      });
      if (!group) throw new NotFoundException('Guruh topilmadi');
      if (
        isTeacher &&
        !(await canTeacherAccessGroup(
          this.prisma,
          refs.groupId,
          requesterId,
          tenantId,
        ))
      ) {
        throw new ForbiddenException('Siz bu guruhga tanga bera olmaysiz');
      }
    }

    if (refs.sessionId) {
      const session = await this.prisma.session.findFirst({
        where: { id: refs.sessionId, tenantId, isDeleted: false },
        select: { id: true, groupId: true, teacherId: true },
      });
      if (!session) throw new NotFoundException('Dars topilmadi');
      if (refs.groupId && session.groupId !== refs.groupId) {
        throw new BadRequestException(
          'Dars ko‘rsatilgan guruhga tegishli emas',
        );
      }
      if (
        isTeacher &&
        session.teacherId !== requesterId &&
        !(await canTeacherAccessGroup(
          this.prisma,
          session.groupId,
          requesterId,
          tenantId,
        ))
      ) {
        throw new ForbiddenException('Siz bu darsga tanga bera olmaysiz');
      }
    }
  }

  // 3. ASOSIY YORDAMCHI TRANZAKSIYA METODI (CORE LOGIC)
  private async executeCoinProcess(
    tenantId: string,
    data: ExecuteCoinProcessData,
  ) {
    const {
      studentId,
      amount,
      direction,
      sourceType,
      note,
      teacherId,
      ruleId,
      groupId,
      sessionId,
    } = data;

    // Talabani tekshiramiz
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, tenantId, isDeleted: false },
      select: { id: true },
    });

    if (!student) throw new NotFoundException('O‘quvchi topilmadi');

    // Tranzaksiyani xavfsiz ishga tushiramiz
    return this.prisma.$transaction(async (tx) => {
      // Hamyon qulflanadi — parallel ayirishlarda balans manfiyga tushmaydi
      const wallet = await this.lockWallet(tx, studentId);

      // Agar tanga ayirilayotgan bo'lsa, balans yetarliligini tekshiramiz
      if (direction === CoinDirection.deduct && wallet.balance < amount) {
        throw new BadRequestException(
          `Talabaning balansi yetarli emas. Joriy balans: ${wallet.balance}, ayirilmoqchi: ${amount}`,
        );
      }

      const result = await this.applyCoinInTx(tx, wallet.id, tenantId, {
        studentId,
        amount,
        direction,
        sourceType,
        note,
        teacherId,
        ruleId,
        groupId,
        sessionId,
      });

      return { success: true, ...result };
    });
  }

  // 3a. Hamyonni tx oxirigacha qulflaydi (SELECT ... FOR UPDATE) va joriy balansni qaytaradi.
  // Yo'q bo'lsa (user yaratilganda ochilmay qolgan bo'lsa) ochiladi — ON CONFLICT parallel
  // yaratishda unique xatosini oldini oladi. Balansga ta'sir qiladigan har bir tx shu
  // metod orqali hamyonni oladi: bitta o'quvchi bo'yicha o'zgarishlar navbat bilan bajariladi,
  // shuning uchun "tekshirib, keyin ayirish" orasida boshqa tx balansni o'zgartira olmaydi.
  async lockWallet(
    tx: Prisma.TransactionClient,
    studentId: string,
  ): Promise<{ id: string; balance: number }> {
    await tx.$executeRaw`
      INSERT INTO wallets (id, user_id, balance, updated_at)
      VALUES (${randomUUID()}::uuid, ${studentId}::uuid, 0, now())
      ON CONFLICT (user_id) DO NOTHING`;
    const [wallet] = await tx.$queryRaw<{ id: string; balance: number }[]>`
      SELECT id, balance FROM wallets WHERE user_id = ${studentId}::uuid FOR UPDATE`;
    return wallet;
  }

  // Bir nechta hamyonni qulflash — deadlock bo'lmasligi uchun doim id tartibida
  private async lockWalletsByIds(
    tx: Prisma.TransactionClient,
    walletIds: string[],
  ): Promise<Map<string, number>> {
    if (!walletIds.length) return new Map();
    const rows = await tx.$queryRaw<{ id: string; balance: number }[]>`
      SELECT id, balance FROM wallets
      WHERE id = ANY(${walletIds}::uuid[])
      ORDER BY id
      FOR UPDATE`;
    return new Map(rows.map((r) => [r.id, r.balance]));
  }

  // 3a1. Balansni o'zgartirish + tranzaksiya logi (faqat tx ichida chaqiriladi)
  private async applyCoinInTx(
    tx: Prisma.TransactionClient,
    walletId: string,
    tenantId: string,
    data: ExecuteCoinProcessData,
  ) {
    const updatedWallet = await tx.wallet.update({
      where: { id: walletId },
      data: {
        balance:
          data.direction === CoinDirection.earn
            ? { increment: data.amount }
            : { decrement: data.amount },
      },
    });

    const transactionRecord = await tx.coinTransaction.create({
      data: {
        amount: data.amount,
        direction: data.direction,
        sourceType: data.sourceType,
        note: data.note || null,
        ruleId: data.ruleId || null,
        walletId,
        tenantId,
        studentId: data.studentId,
        teacherId: data.teacherId || null,
        sessionId: data.sessionId || null,
        groupId: data.groupId || null,
        purchaseId: data.purchaseId || null,
        reversalOfId: data.reversalOfId || null,
      },
    });

    return {
      transactionId: transactionRecord.id,
      newBalance: updatedWallet.balance,
    };
  }

  // 3a1b. TESKARI YOZUV — tranzaksiyani bekor qilish asl yozuvni o'chirmaydi, unga
  // qarama-qarshi yo'nalishdagi yangi yozuv qo'shadi (reversalOfId). Hamyon oldindan
  // qulflangan bo'lishi kerak. Bitta yozuv faqat bir marta bekor qilinadi (DB unique).
  private reverseInTx(
    tx: Prisma.TransactionClient,
    walletId: string,
    trx: CoinTransaction,
    actorId: string | null,
    note: string,
  ) {
    return this.applyCoinInTx(tx, walletId, trx.tenantId, {
      studentId: trx.studentId,
      amount: trx.amount,
      direction:
        trx.direction === CoinDirection.earn
          ? CoinDirection.deduct
          : CoinDirection.earn,
      sourceType: trx.sourceType,
      note,
      teacherId: actorId,
      ruleId: trx.ruleId,
      groupId: trx.groupId,
      sessionId: trx.sessionId,
      purchaseId: trx.purchaseId,
      reversalOfId: trx.id,
    });
  }

  // Avval ayirishlar (ularning teskarisi — qo'shish), keyin qo'shishlar bekor qilinadi:
  // oraliq balans manfiyga tushmaydi (DB CHECK balance >= 0 har bir so'rovda tekshiriladi)
  private sortForReversal<T extends { direction: CoinDirection }>(rows: T[]) {
    return [...rows].sort(
      (a, b) =>
        (a.direction === CoinDirection.deduct ? 0 : 1) -
        (b.direction === CoinDirection.deduct ? 0 : 1),
    );
  }

  // 3a2. SESSIYA TEKSHIRUVI COINLARINI ALMASHTIRISH — yo'qlama/natija qayta
  // saqlanganda shu session+student bo'yicha avvalgi (sourceTypes dagi)
  // tranzaksiyalar bekor qilinib, `items` yaratiladi. Chaqiruvchining tx'i
  // ichida ishlaydi (AttendanceRecord upsert bilan bitta atomik blok).
  // - Avvalgi coinlarni qaytarib bo'lmasa (talaba sarflab bo'lgan) — hech
  //   narsa o'zgarmaydi, `skipped: true`.
  // - Ayirish (jarima) elementiga balans yetmasa — faqat shu element
  //   o'tkazib yuboriladi, qolganlari beriladi.
  async replaceSessionTransactions(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      sessionId: string;
      studentId: string;
      sourceTypes: SourceType[];
      items: SessionCoinItem[];
      // Kim qayta saqladi — teskari yozuvlarda teacherId sifatida yoziladi
      actorId?: string;
    },
  ): Promise<ReplaceSessionCoinsResult> {
    const { tenantId, sessionId, studentId, sourceTypes, items, actorId } =
      params;

    // Avval hamyon qulflanadi, keyin avvalgi tranzaksiyalar o'qiladi: parallel saqlashda
    // ikkinchi tx qulfni kutadi va birinchisi yozgan tranzaksiyalarni ko'radi (dublikat bo'lmaydi)
    const wallet = await this.lockWallet(tx, studentId);

    const activeTransactions = await tx.coinTransaction.findMany({
      where: {
        ...EFFECTIVE_COIN_TX_WHERE,
        sessionId,
        studentId,
        sourceType: { in: sourceTypes },
      },
    });

    // Bekor qilishdan keyingi balans: berilganlar ayiriladi, ayirilganlar qaytariladi
    const reversalDelta = activeTransactions.reduce(
      (sum, trx) =>
        sum + (trx.direction === CoinDirection.earn ? -trx.amount : trx.amount),
      0,
    );
    let balance = wallet.balance + reversalDelta;

    if (balance < 0) {
      return {
        skipped: true,
        code: COIN_SKIP_CODES.COINS_ALREADY_SPENT,
        reason: `Balans yetarli emas (joriy: ${wallet.balance}, qaytarish uchun kerak: ${-reversalDelta}) — talaba avvalgi coinlarni allaqachon sarflab bo'lgan`,
        reversed: 0,
        created: 0,
        skippedItems: [],
      };
    }

    for (const trx of this.sortForReversal(activeTransactions)) {
      await this.reverseInTx(
        tx,
        wallet.id,
        trx,
        actorId ?? null,
        'Tekshiruv qayta saqlandi — avvalgi yozuv bekor qilindi',
      );
    }

    const skippedItems: SkippedSessionCoinItem[] = [];
    let created = 0;

    for (const item of items) {
      if (item.amount <= 0) continue;

      if (item.direction === CoinDirection.deduct && balance < item.amount) {
        skippedItems.push({
          sourceType: item.sourceType,
          direction: item.direction,
          amount: item.amount,
          code: COIN_SKIP_CODES.INSUFFICIENT_BALANCE_FOR_PENALTY,
          reason: `Jarima uchun balans yetarli emas (joriy: ${balance}, kerak: ${item.amount})`,
        });
        continue;
      }

      const result = await this.applyCoinInTx(tx, wallet.id, tenantId, {
        ...item,
        studentId,
      });
      balance = result.newBalance;
      created++;
    }

    return {
      skipped: false,
      reversed: activeTransactions.length,
      created,
      skippedItems,
    };
  }

  // 3a3. SESSIYA O'CHIRILGANDA — uning tekshiruvi orqali berilgan barcha
  // coinlarni qaytarish (hammasi yoki hech biri). Kimdir coinni sarflab
  // bo'lgan bo'lsa, hech narsa o'zgarmaydi va shu o'quvchilar qaytariladi.
  async reverseSessionTransactions(
    tx: Prisma.TransactionClient,
    sessionId: string,
    sourceTypes: SourceType[],
    actorId?: string,
  ): Promise<{ reversed: number; blockedStudentIds: string[] }> {
    const where: Prisma.CoinTransactionWhereInput = {
      ...EFFECTIVE_COIN_TX_WHERE,
      sessionId,
      sourceType: { in: sourceTypes },
    };

    // Tegishli hamyonlar qulflanadi, so'ng tranzaksiyalar qulf ostida qayta o'qiladi
    const walletRows = await tx.coinTransaction.findMany({
      where,
      distinct: ['walletId'],
      select: { walletId: true },
    });
    const lockedBalances = await this.lockWalletsByIds(
      tx,
      walletRows.map((w) => w.walletId),
    );

    const activeTransactions = await tx.coinTransaction.findMany({ where });

    const perWallet = new Map<
      string,
      { studentId: string; balance: number; delta: number }
    >();
    for (const trx of activeTransactions) {
      const entry = perWallet.get(trx.walletId) ?? {
        studentId: trx.studentId,
        balance: lockedBalances.get(trx.walletId) ?? 0,
        delta: 0,
      };
      entry.delta +=
        trx.direction === CoinDirection.earn ? -trx.amount : trx.amount;
      perWallet.set(trx.walletId, entry);
    }

    const blockedStudentIds = [...perWallet.values()]
      .filter((w) => w.balance + w.delta < 0)
      .map((w) => w.studentId);

    if (blockedStudentIds.length) {
      return { reversed: 0, blockedStudentIds };
    }

    for (const trx of this.sortForReversal(activeTransactions)) {
      await this.reverseInTx(
        tx,
        trx.walletId,
        trx,
        actorId ?? null,
        "Dars o'chirildi — shu dars uchun berilgan coin bekor qilindi",
      );
    }

    return { reversed: activeTransactions.length, blockedStudentIds: [] };
  }

  // 3b. BIR NECHTA O'QUVCHIGA BIRDANIGA BIR XIL MIQDORDA COIN BERISH/AYIRISH
  async giveBulkManual(
    tenantId: string,
    teacherId: string,
    dto: BulkGiveCoinDto,
    requesterRole?: string,
  ) {
    const uniqueStudentIds = Array.from(new Set(dto.studentIds));
    const results: BulkCoinResultItem[] = [];

    // groupId/sessionId butun so'rov uchun bir marta tekshiriladi
    await this.assertManualRefs(tenantId, teacherId, requesterRole, {
      groupId: dto.groupId,
      sessionId: dto.sessionId,
    });
    await assertTeacherCoinLimit(this.prisma, tenantId, requesterRole, [
      dto.amount,
    ]);

    for (const studentId of uniqueStudentIds) {
      try {
        // Teacher faqat o'zi dars beradigan guruhdagi o'quvchiga coin bera oladi
        if (requesterRole === 'teacher') {
          const isOwnStudent = await this.prisma.groupStudent.findFirst({
            where: {
              studentId,
              isDeleted: false,
              group: {
                tenantId,
                isDeleted: false,
                ...teacherGroupAccessWhere(teacherId),
              },
            },
          });
          if (!isOwnStudent) {
            throw new ForbiddenException(
              "Siz faqat o'z guruhingizdagi o'quvchiga tanga bera olasiz",
            );
          }
        }

        const result = await this.executeCoinProcess(tenantId, {
          studentId,
          amount: dto.amount,
          direction: dto.direction,
          sourceType: dto.sourceType,
          note: dto.note,
          teacherId,
          groupId: dto.groupId,
          sessionId: dto.sessionId,
        });

        results.push({
          studentId,
          success: true,
          direction: dto.direction,
          transactionId: result.transactionId,
          newBalance: result.newBalance,
        });
      } catch (err) {
        results.push({
          studentId,
          success: false,
          direction: dto.direction,
          error: err instanceof Error ? err.message : "Noma'lum xatolik",
        });
      }
    }

    return {
      totalRequested: uniqueStudentIds.length,
      successCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success).length,
      results,
    };
  }

  // 3c. MAVJUD COIN QOIDASINI BIR YOKI BIR NECHTA STUDENTGA QO'LLASH
  async applyRuleToStudents(
    tenantId: string,
    teacherId: string,
    dto: ApplyCoinRuleDto,
    requesterRole?: string,
  ) {
    const rule = await this.prisma.coinRule.findFirst({
      where: {
        id: dto.ruleId,
        tenantId,
        isDeleted: false,
        isActive: true,
      },
    });

    if (!rule) {
      throw new NotFoundException('Tanga qoidasi topilmadi yoki nofaol');
    }

    // Avtomatik qoidalar (davomat, uy vazifasi) faqat yo'qlama orqali qo'llanadi —
    // qo'lda qo'llansa, sessiya qayta saqlanganda o'chib ketadi yoki dublikat bo'ladi
    if (rule.triggerType === TriggerType.auto) {
      throw new BadRequestException(
        "Avtomatik qoidani qo'lda qo'llab bo'lmaydi — u yo'qlama saqlanganda o'zi qo'llanadi",
      );
    }

    // Xarid manbasi faqat xarid moduli uchun
    const sourceType =
      rule.sourceType && rule.sourceType !== SourceType.purchase
        ? rule.sourceType
        : SourceType.manual;

    if (
      dto.sessionId &&
      ALL_SESSION_MANAGED_SOURCE_TYPES.includes(sourceType)
    ) {
      throw new BadRequestException(
        "Bu turdagi coin sessiyaga yo'qlama/natija orqali beriladi — qoidani sessionId'siz qo'llang",
      );
    }

    await this.assertManualRefs(tenantId, teacherId, requesterRole, {
      sessionId: dto.sessionId,
    });
    await assertTeacherCoinLimit(this.prisma, tenantId, requesterRole, [
      rule.coinAmount,
    ]);

    const uniqueStudentIds = Array.from(new Set(dto.studentIds));
    const results: BulkCoinResultItem[] = [];
    const note = dto.note || `"${rule.name}" qoidasi asosida`;

    for (const studentId of uniqueStudentIds) {
      try {
        // Agar qoida ma'lum bir guruhga biriktirilgan bo'lsa,
        // faqat shu guruh a'zolariga qo'llash mumkin
        if (rule.groupId) {
          const isMember = await this.prisma.groupStudent.findFirst({
            where: { studentId, groupId: rule.groupId, isDeleted: false },
          });
          if (!isMember) {
            throw new BadRequestException(
              "Bu qoida faqat biriktirilgan guruh a'zolariga qo'llanadi, o'quvchi shu guruhda emas",
            );
          }
        }

        // Teacher faqat o'zi dars beradigan guruhdagi o'quvchiga coin bera oladi
        if (requesterRole === 'teacher') {
          const isOwnStudent = await this.prisma.groupStudent.findFirst({
            where: {
              studentId,
              isDeleted: false,
              group: {
                tenantId,
                isDeleted: false,
                ...teacherGroupAccessWhere(teacherId),
              },
            },
          });
          if (!isOwnStudent) {
            throw new ForbiddenException(
              "Siz faqat o'z guruhingizdagi o'quvchiga tanga bera olasiz",
            );
          }
        }

        const result = await this.executeCoinProcess(tenantId, {
          studentId,
          amount: rule.coinAmount,
          direction: rule.direction,
          sourceType,
          note,
          teacherId,
          ruleId: rule.id,
          groupId: rule.groupId,
          sessionId: dto.sessionId,
        });

        results.push({
          studentId,
          success: true,
          direction: rule.direction,
          transactionId: result.transactionId,
          newBalance: result.newBalance,
        });
      } catch (err) {
        results.push({
          studentId,
          success: false,
          direction: rule.direction,
          error: err instanceof Error ? err.message : "Noma'lum xatolik",
        });
      }
    }

    return {
      rule: {
        id: rule.id,
        name: rule.name,
        coinAmount: rule.coinAmount,
        direction: rule.direction,
      },
      totalRequested: uniqueStudentIds.length,
      successCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success).length,
      results,
    };
  }

  // 4. TRANZAKSIYALAR TARIXINI OLISH
  async findAll(
    query: QueryCoinTransactionDto,
    tenantId: string,
    requesterRole?: string,
    requesterId?: string,
  ) {
    const {
      page = 1,
      limit = 10,
      studentId,
      teacherId,
      direction,
      sourceType,
    } = query;
    const skip = (page - 1) * limit;

    // Tarixda teskari yozuvlar ham ko'rinadi (reversalOfId / reversal orqali bog'langan)
    const where: Prisma.CoinTransactionWhereInput = {
      ...VISIBLE_COIN_TX_WHERE,
      tenantId,
    };

    if (studentId) where.studentId = studentId;
    if (teacherId) where.teacherId = teacherId;
    if (direction) where.direction = direction;
    if (sourceType) where.sourceType = sourceType;

    // Teacher faqat o'zi bergan/qayd etgan tranzaksiyalarni ko'radi
    if (requesterRole === 'teacher') {
      where.teacherId = requesterId;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.coinTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          student: { select: { fullName: true, phone: true } },
          teacher: { select: { fullName: true } },
          rule: { select: { name: true } },
          reversal: { select: { id: true, createdAt: true } },
        },
      }),
      this.prisma.coinTransaction.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // 5. TRANZAKSIYANI BEKOR QILISH — teskari yozuv yaratiladi, asl yozuv tarixda qoladi
  async cancelTransaction(id: string, tenantId: string, actorId: string) {
    const trx = await this.prisma.coinTransaction.findFirst({
      where: { id, ...VISIBLE_COIN_TX_WHERE, tenantId },
      include: { reversal: { select: { id: true } } },
    });

    if (!trx) throw new NotFoundException('Tranzaksiya topilmadi');

    if (trx.reversalOfId) {
      throw new BadRequestException(
        'Bu yozuvning o‘zi bekor qilish (teskari) yozuvi — uni bekor qilib bo‘lmaydi',
      );
    }
    if (trx.reversal) {
      throw new ConflictException('Tranzaksiya allaqachon bekor qilingan');
    }

    // Xarid coinlari faqat xaridni bekor qilish orqali qaytariladi — aks holda
    // o'quvchi ham sovg'ani, ham coinni olib qolishi mumkin edi
    if (trx.sourceType === SourceType.purchase) {
      throw new BadRequestException(
        'Xarid tranzaksiyasini bu yerdan bekor qilib bo‘lmaydi — xaridning o‘zini bekor qiling (PATCH /purchases/:id/status)',
      );
    }

    // Sessiya tekshiruvi (yo'qlama/natija) coinlari yo'qlamani qayta saqlash orqali boshqariladi
    if (
      trx.sessionId &&
      ALL_SESSION_MANAGED_SOURCE_TYPES.includes(trx.sourceType)
    ) {
      throw new BadRequestException(
        'Bu coin sessiya tekshiruvi orqali berilgan — yo‘qlama/natijani o‘zgartiring',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.lockWallet(tx, trx.studentId);

      // Qulf ostida qayta tekshiruv: parallel ikki so'rovda ikkinchisi shu yerda to'xtaydi
      const alreadyReversed = await tx.coinTransaction.findUnique({
        where: { reversalOfId: id },
        select: { id: true },
      });
      if (alreadyReversed) {
        throw new ConflictException('Tranzaksiya allaqachon bekor qilingan');
      }

      // Berilgan coin (earn) qaytarilayotganda balans yetishi kerak
      if (trx.direction === CoinDirection.earn && wallet.balance < trx.amount) {
        throw new BadRequestException(
          'Tranzaksiyani bekor qilib bo‘lmaydi, talaba coinlarni ishlatib yuborgan.',
        );
      }

      const result = await this.reverseInTx(
        tx,
        wallet.id,
        trx,
        actorId,
        'Tranzaksiya bekor qilindi',
      );

      return {
        message:
          'Tranzaksiya muvaffaqiyatli bekor qilindi va balans qayta hisoblandi',
        reversalTransactionId: result.transactionId,
        newBalance: result.newBalance,
      };
    });
  }

  // 6. TALABA HAMYONINI OLISH
  async getStudentWallet(userId: string, tenantId: string) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { userId, user: { tenantId } },
    });
    if (!wallet) throw new NotFoundException('Hamyon topilmadi');
    return wallet;
  }

  // 6b. TALABANING O'Z TRANZAKSIYA TARIXI (Shaxsiy profil uchun, filtrlar bilan)
  async getMyHistory(
    studentId: string,
    tenantId: string,
    query: QueryMyCoinHistoryDto,
  ) {
    const { page = 1, limit = 20, direction, sourceType, from, to } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CoinTransactionWhereInput = {
      studentId,
      ...VISIBLE_COIN_TX_WHERE,
      tenantId,
    };

    if (direction) where.direction = direction;
    if (sourceType) where.sourceType = sourceType;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.coinTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          direction: true,
          sourceType: true,
          note: true,
          createdAt: true,
          reversalOfId: true,
          reversal: { select: { id: true, createdAt: true } },
          teacher: { select: { id: true, fullName: true } },
          group: { select: { id: true, name: true } },
        },
      }),
      this.prisma.coinTransaction.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // 6c. TALABANING TANGA STATISTIKASI (Chart uchun — earn/deduct trend)
  async getMyStats(
    studentId: string,
    tenantId: string,
    query: QueryCoinStatsDto,
  ) {
    const { period = 'week', count = 7 } = query;
    const bucketDays = period === 'month' ? 7 : 1; // month → haftalik bucket, week → kunlik bucket
    const totalDays = bucketDays * count;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - totalDays + 1);

    const transactions = await this.prisma.coinTransaction.findMany({
      where: {
        studentId,
        ...EFFECTIVE_COIN_TX_WHERE,
        tenantId,
        createdAt: { gte: start },
      },
      select: { amount: true, direction: true, createdAt: true },
    });

    const buckets: {
      from: string;
      to: string;
      earned: number;
      deducted: number;
    }[] = [];

    for (let i = 0; i < count; i++) {
      const bucketStart = new Date(start);
      bucketStart.setDate(start.getDate() + i * bucketDays);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketStart.getDate() + bucketDays);

      let earned = 0;
      let deducted = 0;
      for (const t of transactions) {
        if (t.createdAt >= bucketStart && t.createdAt < bucketEnd) {
          if (t.direction === CoinDirection.earn) earned += t.amount;
          else deducted += t.amount;
        }
      }

      buckets.push({
        from: bucketStart.toISOString().split('T')[0],
        to: new Date(bucketEnd.getTime() - 1).toISOString().split('T')[0],
        earned,
        deducted,
      });
    }

    return {
      period,
      buckets,
      totalEarned: buckets.reduce((s, b) => s + b.earned, 0),
      totalDeducted: buckets.reduce((s, b) => s + b.deducted, 0),
    };
  }

  // 7. LEADERBOARD (REYTING)
  async getLeaderboard(tenantId: string, limit: number) {
    return this.prisma.wallet.findMany({
      where: { user: { tenantId, isDeleted: false, isActive: true } },
      take: limit,
      orderBy: { balance: 'desc' },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
  }
}
