import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CoinDirection, SourceType } from 'src/generated/prisma/enums';
import { PrismaService } from 'src/prisma/prisma.service';
import { CoinTransactionsService } from './coin-transaction.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';

// Hamyon va tranzaksiyalar uchun xotiradagi soxta tx: balans o'zgarishlari va yaratilgan
// yozuvlar kuzatiladi (yakka — wallet.update + create, ommaviy — raw UPDATE + createMany).
// DB'ga murojaat yo'q.
function makeTx(initial: {
  balance: number;
  active?: Record<string, unknown>[];
  existingReversal?: boolean;
}) {
  const state = { balance: initial.balance, minBalance: initial.balance };
  const created: Record<string, unknown>[] = [];
  const balanceSteps: number[] = [];

  const applyDelta = (delta: number) => {
    state.balance += delta;
    state.minBalance = Math.min(state.minBalance, state.balance);
    balanceSteps.push(state.balance);
  };

  const tx = {
    // INSERT ... ON CONFLICT (hamyon ochish) yoki ommaviy balans UPDATE (unnest(walletIds, deltas))
    $executeRaw: jest
      .fn()
      .mockImplementation(
        (strings: TemplateStringsArray, ...values: unknown[]) => {
          if (strings.join('').includes('UPDATE wallets')) {
            (values[1] as number[]).forEach(applyDelta);
          }
          return Promise.resolve(1);
        },
      ),
    // SELECT ... FOR UPDATE
    $queryRaw: jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve([
          { id: 'wallet-1', user_id: 'student-1', balance: state.balance },
        ]),
      ),
    coinTransaction: {
      findMany: jest.fn().mockResolvedValue(initial.active ?? []),
      findUnique: jest
        .fn()
        .mockResolvedValue(initial.existingReversal ? { id: 'rev' } : null),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return Promise.resolve({ id: `new-${created.length}`, ...data });
        }),
      createMany: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown>[] }) => {
          created.push(...data);
          return Promise.resolve({ count: data.length });
        }),
    },
    // Audit yozuvi amal bilan bitta tx'da
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    wallet: {
      update: jest
        .fn()
        .mockImplementation(
          ({
            data,
          }: {
            data: { balance: { increment?: number; decrement?: number } };
          }) => {
            const b = data.balance;
            applyDelta(b.increment ?? -(b.decrement ?? 0));
            return Promise.resolve({ balance: state.balance });
          },
        ),
    },
  };
  return { tx, state, created, balanceSteps };
}

function makeService(
  tx: unknown,
  findFirst?: jest.Mock,
): CoinTransactionsService {
  const prisma = {
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    coinTransaction: { findFirst: findFirst ?? jest.fn() },
  } as unknown as PrismaService;
  const audit = {
    data: jest.fn((entry: Record<string, unknown>) => entry),
    recordSafe: jest.fn(),
  } as unknown as AuditLogService;
  return new CoinTransactionsService(prisma, audit);
}

const trx = (over: Record<string, unknown> = {}) => ({
  id: 'trx-1',
  tenantId: 'tenant-1',
  walletId: 'wallet-1',
  studentId: 'student-1',
  amount: 5,
  direction: CoinDirection.earn,
  sourceType: SourceType.attendance,
  teacherId: 'teacher-1',
  ruleId: null,
  groupId: 'g1',
  sessionId: 'session-1',
  purchaseId: null,
  reversalOfId: null,
  isDeleted: false,
  ...over,
});

const earnItem = (sourceType: SourceType, amount: number) => ({
  amount,
  direction: CoinDirection.earn as CoinDirection,
  sourceType,
  teacherId: 'teacher-1',
  groupId: 'g1',
  sessionId: 'session-1',
});

const replace = (
  service: CoinTransactionsService,
  tx: unknown,
  items: ReturnType<typeof earnItem>[],
) =>
  service.replaceSessionTransactions(tx as never, {
    tenantId: 'tenant-1',
    sessionId: 'session-1',
    studentId: 'student-1',
    sourceTypes: [SourceType.attendance, SourceType.homework],
    items,
    actorId: 'teacher-1',
  });

describe('CoinTransactionsService.replaceSessionTransactions', () => {
  it('birinchi saqlash — coinlar yoziladi, balans oshadi', async () => {
    const { tx, state, created } = makeTx({ balance: 0 });
    const result = await replace(makeService(tx), tx, [
      earnItem(SourceType.attendance, 5),
      earnItem(SourceType.homework, 10),
    ]);

    expect(result).toMatchObject({ skipped: false, reversed: 0, created: 2 });
    expect(state.balance).toBe(15);
    expect(created.every((c) => c.tenantId === 'tenant-1')).toBe(true);
  });

  it("o'zgarmagan qayta saqlash — hech narsa yozilmaydi (tarixda ortiqcha juftlik yo'q)", async () => {
    const { tx, state, created } = makeTx({
      balance: 5,
      active: [trx({ amount: 5 })],
    });
    const result = await replace(makeService(tx), tx, [
      earnItem(SourceType.attendance, 5),
    ]);

    expect(result).toMatchObject({ skipped: false, reversed: 0, created: 0 });
    expect(created).toHaveLength(0);
    expect(state.balance).toBe(5);
  });

  it("o'zgargan qayta saqlash — eski yozuv o'chirilmaydi, teskari yozuv qo'shiladi (dublikat yo'q)", async () => {
    const { tx, state, created } = makeTx({
      balance: 5,
      active: [trx({ amount: 5 })],
    });
    const result = await replace(makeService(tx), tx, [
      earnItem(SourceType.attendance, 8),
    ]);

    expect(result).toMatchObject({ reversed: 1, created: 1 });
    expect(state.balance).toBe(8); // -5 (teskari) + 8
    expect(created[0]).toMatchObject({
      direction: CoinDirection.deduct,
      amount: 5,
      reversalOfId: 'trx-1',
      sessionId: 'session-1',
      teacherId: 'teacher-1',
    });
    expect(created[1]).toMatchObject({
      direction: CoinDirection.earn,
      amount: 8,
      walletId: 'wallet-1',
    });
    expect(created[1].reversalOfId).toBeUndefined();
  });

  it("coin sarflangan bo'lsa — hech narsa o'zgarmaydi (COINS_ALREADY_SPENT)", async () => {
    const { tx, state, created } = makeTx({
      balance: 3,
      active: [trx({ amount: 10 })],
    });
    const result = await replace(makeService(tx), tx, []);

    expect(result).toMatchObject({
      skipped: true,
      code: 'COINS_ALREADY_SPENT',
    });
    expect(created).toHaveLength(0);
    expect(state.balance).toBe(3);
  });

  it("jarimaga balans yetmasa — faqat jarima o'tkazib yuboriladi", async () => {
    const { tx, state } = makeTx({ balance: 1 });
    const penalty = {
      ...earnItem(SourceType.attendance, 3),
      direction: CoinDirection.deduct,
    };
    const result = await replace(makeService(tx), tx, [
      penalty,
      earnItem(SourceType.homework, 10),
    ]);

    expect(result.skippedItems).toEqual([
      expect.objectContaining({ code: 'INSUFFICIENT_BALANCE_FOR_PENALTY' }),
    ]);
    expect(result.created).toBe(1);
    expect(state.balance).toBe(11);
  });

  it('bekor qilishda balans manfiyga tushmaydi (sof o`zgarish bitta UPDATE bilan)', async () => {
    // balans 2: avval +5 berilgan, -3 jarima; hammasini bekor qilish oxirida 0 bo'ladi
    const { tx, state, created } = makeTx({
      balance: 2,
      active: [
        trx({ id: 'earn', amount: 5 }),
        trx({ id: 'deduct', amount: 3, direction: CoinDirection.deduct }),
      ],
    });
    await replace(makeService(tx), tx, []);

    expect(state.balance).toBe(0);
    expect(state.minBalance).toBeGreaterThanOrEqual(0);
    expect(created.map((c) => c.reversalOfId)).toEqual(['earn', 'deduct']);
  });
});

describe('CoinTransactionsService.cancelTransaction', () => {
  const run = (
    found: Record<string, unknown> | null,
    txState: Parameters<typeof makeTx>[0] = { balance: 100 },
  ) => {
    const made = makeTx(txState);
    const findFirst = jest.fn().mockResolvedValue(found);
    const service = makeService(made.tx, findFirst);
    return {
      made,
      promise: service.cancelTransaction('trx-1', 'tenant-1', 'admin-1'),
    };
  };

  const manual = (over: Record<string, unknown> = {}) =>
    trx({
      sourceType: SourceType.manual,
      sessionId: null,
      reversal: null,
      ...over,
    });

  it('topilmasa — 404', async () => {
    const { promise } = run(null);
    await expect(promise).rejects.toBeInstanceOf(NotFoundException);
  });

  it("teskari yozuvning o'zini bekor qilib bo'lmaydi — 400", async () => {
    const { promise } = run(manual({ reversalOfId: 'orig' }));
    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allaqachon bekor qilingan — 409', async () => {
    const { promise } = run(manual({ reversal: { id: 'rev' } }));
    await expect(promise).rejects.toBeInstanceOf(ConflictException);
  });

  it("xarid coinini bu yerdan qaytarib bo'lmaydi — 400", async () => {
    const { promise } = run(manual({ sourceType: SourceType.purchase }));
    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
  });

  it("sessiya tekshiruvi coinini bu yerdan qaytarib bo'lmaydi — 400", async () => {
    const { promise } = run(
      manual({ sourceType: SourceType.attendance, sessionId: 'session-1' }),
    );
    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
  });

  it("parallel so'rov allaqachon bekor qilgan (qulf ostida) — 409", async () => {
    const { promise } = run(manual(), {
      balance: 100,
      existingReversal: true,
    });
    await expect(promise).rejects.toBeInstanceOf(ConflictException);
  });

  it("berilgan coin sarflangan bo'lsa — 400", async () => {
    const { promise } = run(manual({ amount: 50 }), { balance: 10 });
    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
  });

  it("muvaffaqiyat — qarama-qarshi yo'nalishdagi teskari yozuv yaratiladi", async () => {
    const { made, promise } = run(manual({ amount: 20 }), {
      balance: 100,
    });
    await expect(promise).resolves.toMatchObject({
      reversalTransactionId: 'new-1',
      newBalance: 80,
    });
    expect(made.created[0]).toMatchObject({
      direction: CoinDirection.deduct,
      amount: 20,
      reversalOfId: 'trx-1',
      tenantId: 'tenant-1',
      teacherId: 'admin-1',
    });
    // Bekor qilish audit izi shu tx ichida yoziladi
    expect(made.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'coin_transaction',
        entityId: 'trx-1',
        actorId: 'admin-1',
      }) as unknown,
    });
  });

  it('ayirishni bekor qilish — coin qaytariladi (balans yetishi shart emas)', async () => {
    const { made, promise } = run(
      manual({ amount: 30, direction: CoinDirection.deduct }),
      { balance: 0 },
    );
    await expect(promise).resolves.toMatchObject({ newBalance: 30 });
    expect(made.created[0]).toMatchObject({ direction: CoinDirection.earn });
  });
});
