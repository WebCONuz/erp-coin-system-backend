import { ConflictException } from '@nestjs/common';
import { Prisma } from 'src/generated/prisma/client';
import {
  assertNoSessionConflict,
  findSessionConflict,
  SessionSlot,
  timeOverlap,
} from './session-conflicts';

describe('timeOverlap', () => {
  it.each([
    ['09:00', '10:30', '10:00', '11:00', true],
    ['09:00', '11:00', '09:30', '10:00', true], // ichida
    ['09:00', '10:00', '10:00', '11:00', false], // chegaralar tegib turadi
    ['13:00', '14:00', '09:00', '10:00', false],
  ])('%s–%s va %s–%s → %s', (s1, e1, s2, e2, expected) => {
    expect(timeOverlap(s1, e1, s2, e2)).toBe(expected);
  });
});

describe('findSessionConflict', () => {
  const slot: SessionSlot = {
    tenantId: 't1',
    sessionDate: new Date('2026-11-20'),
    startTime: '10:00',
    endTime: '11:30',
    groupId: 'g1',
    roomId: 'r1',
    teacherId: 'teacher1',
  };

  const candidate = (over: Partial<Record<string, string>>) => ({
    id: 'other',
    startTime: '10:30',
    endTime: '12:00',
    groupId: 'g2',
    roomId: 'r2',
    teacherId: 'teacher2',
    group: { name: '9-B' },
    ...over,
  });

  const dbWith = (rows: unknown[]) => {
    const findMany = jest.fn().mockResolvedValue(rows);
    return {
      db: { session: { findMany } } as unknown as Prisma.TransactionClient,
      findMany,
    };
  };

  it("vaqti kesishmasa — to'qnashuv yo'q", async () => {
    const { db } = dbWith([
      candidate({ roomId: 'r1', startTime: '11:30', endTime: '13:00' }),
    ]);
    expect(await findSessionConflict(db, slot)).toBeNull();
  });

  it.each([
    ['group', { groupId: 'g1' }],
    ['room', { roomId: 'r1' }],
    ['teacher', { teacherId: 'teacher1' }],
  ])('%s band', async (kind, over) => {
    const { db } = dbWith([candidate(over)]);
    expect(await findSessionConflict(db, slot)).toMatchObject({
      kind,
      groupName: '9-B',
    });
  });

  it("so'rov tenant, sana va o'chirilmaganlar bilan, o'zini chiqarib", async () => {
    const { db, findMany } = dbWith([]);
    await findSessionConflict(db, { ...slot, excludeSessionId: 'self' });
    const [[args]] = findMany.mock.calls as [
      [{ where: Record<string, unknown> }],
    ];
    const where = args.where;
    expect(where).toMatchObject({
      tenantId: 't1',
      sessionDate: slot.sessionDate,
      isDeleted: false,
      id: { not: 'self' },
    });
  });

  it('assertNoSessionConflict — 409 SCHEDULE_CONFLICT', async () => {
    const { db } = dbWith([candidate({ roomId: 'r1' })]);
    await expect(assertNoSessionConflict(db, slot)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(assertNoSessionConflict(db, slot)).rejects.toMatchObject({
      response: { code: 'SCHEDULE_CONFLICT', conflict: { kind: 'room' } },
    });
  });
});
