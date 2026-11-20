import { ConflictException } from '@nestjs/common';
import { Prisma } from 'src/generated/prisma/client';

export const SCHEDULE_CONFLICT_CODE = 'SCHEDULE_CONFLICT';

// HH:MM oraliqlari kesishadimi (chegaralar tegib tursa — kesishmaydi: 09–10 va 10–11)
export const timeOverlap = (s1: string, e1: string, s2: string, e2: string) =>
  s1 < e2 && s2 < e1;

export type ConflictKind = 'group' | 'room' | 'teacher';

export interface SessionSlot {
  tenantId: string;
  sessionDate: Date;
  startTime: string;
  endTime: string;
  groupId: string;
  roomId: string;
  teacherId: string;
  excludeSessionId?: string;
}

export interface SessionConflict {
  kind: ConflictKind;
  sessionId: string;
  groupName: string;
  startTime: string;
  endTime: string;
}

// Bandlik tekshiruvi uchun sessiya (mavjud yoki shu operatsiyada rejalashtirilgan)
export interface BookedSlot {
  id: string;
  startTime: string;
  endTime: string;
  groupId: string;
  roomId: string;
  teacherId: string;
  groupName: string;
}

type SlotTimes = Pick<
  SessionSlot,
  'startTime' | 'endTime' | 'groupId' | 'roomId' | 'teacherId'
>;

/**
 * Sof funksiya: shu sanadagi `candidates` orasidan vaqti kesishadigan birinchi bandlikni
 * topadi — shu guruh (guruhning ikki darsi bir vaqtda bo'lmaydi), shu xona yoki shu o'qituvchi.
 */
export function pickSessionConflict(
  slot: SlotTimes,
  candidates: BookedSlot[],
): SessionConflict | null {
  for (const c of candidates) {
    if (
      c.groupId !== slot.groupId &&
      c.roomId !== slot.roomId &&
      c.teacherId !== slot.teacherId
    ) {
      continue;
    }
    if (!timeOverlap(slot.startTime, slot.endTime, c.startTime, c.endTime))
      continue;
    const kind: ConflictKind =
      c.groupId === slot.groupId
        ? 'group'
        : c.roomId === slot.roomId
          ? 'room'
          : 'teacher';
    return {
      kind,
      sessionId: c.id,
      groupName: c.groupName,
      startTime: c.startTime,
      endTime: c.endTime,
    };
  }
  return null;
}

/**
 * Bir operatsiya davomida (generatsiya, shablon sinxronlash) bandlikni xotirada tekshirish:
 * oraliqdagi sessiyalar bir marta o'qiladi, har bir occurrence uchun DB'ga so'rov yo'q.
 * Operatsiyada yaratilgan/ko'chirilgan/o'chirilgan sessiyalar indeksga ham kiritiladi —
 * bir so'rov ichidagi darslar ham bir-biri bilan to'qnashmaydi.
 */
export class ScheduleIndex {
  private readonly byDate = new Map<string, BookedSlot[]>();

  constructor(rows: (BookedSlot & { date: string })[] = []) {
    for (const { date, ...slot } of rows) this.add(date, slot);
  }

  add(date: string, slot: BookedSlot): void {
    const list = this.byDate.get(date) ?? [];
    list.push(slot);
    this.byDate.set(date, list);
  }

  remove(date: string, id: string): void {
    const list = this.byDate.get(date);
    if (list) {
      this.byDate.set(
        date,
        list.filter((s) => s.id !== id),
      );
    }
  }

  update(date: string, id: string, changes: Partial<BookedSlot>): void {
    const slot = this.byDate.get(date)?.find((s) => s.id === id);
    if (slot) Object.assign(slot, changes);
  }

  // Shu guruhda shu sana va boshlanish vaqtida dars bormi (dublikat)
  hasGroupStart(date: string, groupId: string, startTime: string): boolean {
    return (this.byDate.get(date) ?? []).some(
      (s) => s.groupId === groupId && s.startTime === startTime,
    );
  }

  findConflict(
    date: string,
    slot: SlotTimes & { excludeId?: string },
  ): SessionConflict | null {
    const candidates = (this.byDate.get(date) ?? []).filter(
      (s) => s.id !== slot.excludeId,
    );
    return pickSessionConflict(slot, candidates);
  }
}

/**
 * [from, to] oralig'idagi (o'chirilmagan, vaqti bor) sessiyalardan indeks: faqat berilgan
 * guruh/xona/o'qituvchilarga tegishlilari — to'qnashuv faqat shular bilan bo'lishi mumkin.
 */
export async function loadScheduleIndex(
  db: Prisma.TransactionClient,
  params: {
    tenantId: string;
    from: string;
    to: string;
    groupIds: string[];
    roomIds: string[];
    teacherIds: string[];
  },
): Promise<ScheduleIndex> {
  const rows = await db.session.findMany({
    where: {
      tenantId: params.tenantId,
      isDeleted: false,
      sessionDate: { gte: new Date(params.from), lte: new Date(params.to) },
      startTime: { not: null },
      endTime: { not: null },
      OR: [
        { groupId: { in: params.groupIds } },
        { roomId: { in: params.roomIds } },
        { teacherId: { in: params.teacherIds } },
      ],
    },
    select: {
      id: true,
      sessionDate: true,
      startTime: true,
      endTime: true,
      groupId: true,
      roomId: true,
      teacherId: true,
      group: { select: { name: true } },
    },
  });
  return new ScheduleIndex(
    rows.map((r) => ({
      id: r.id,
      date: r.sessionDate.toISOString().slice(0, 10),
      startTime: r.startTime!,
      endTime: r.endTime!,
      groupId: r.groupId,
      roomId: r.roomId,
      teacherId: r.teacherId,
      groupName: r.group.name,
    })),
  );
}

/**
 * Shu sanada vaqti kesishadigan boshqa (o'chirilmagan) sessiyani topadi:
 * - shu guruhda (guruhning ikki darsi bir vaqtda bo'lmaydi),
 * - shu xonada,
 * - shu o'qituvchida.
 * Birinchi topilgan to'qnashuv qaytariladi; yo'q bo'lsa null.
 */
export async function findSessionConflict(
  db: Prisma.TransactionClient,
  slot: SessionSlot,
): Promise<SessionConflict | null> {
  const candidates = await db.session.findMany({
    where: {
      tenantId: slot.tenantId,
      sessionDate: slot.sessionDate,
      isDeleted: false,
      startTime: { not: null },
      endTime: { not: null },
      ...(slot.excludeSessionId ? { id: { not: slot.excludeSessionId } } : {}),
      OR: [
        { groupId: slot.groupId },
        { roomId: slot.roomId },
        { teacherId: slot.teacherId },
      ],
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      groupId: true,
      roomId: true,
      teacherId: true,
      group: { select: { name: true } },
    },
  });

  return pickSessionConflict(
    slot,
    candidates.map((c) => ({
      id: c.id,
      startTime: c.startTime!,
      endTime: c.endTime!,
      groupId: c.groupId,
      roomId: c.roomId,
      teacherId: c.teacherId,
      groupName: c.group.name,
    })),
  );
}

const KIND_LABEL: Record<ConflictKind, string> = {
  group: 'Bu guruhning',
  room: 'Bu xonada',
  teacher: "Bu o'qituvchining",
};

export function conflictError(conflict: SessionConflict): ConflictException {
  return new ConflictException({
    statusCode: 409,
    message: `${KIND_LABEL[conflict.kind]} ${conflict.startTime}–${conflict.endTime} da boshqa darsi bor ("${conflict.groupName}")`,
    code: SCHEDULE_CONFLICT_CODE,
    conflict,
  });
}

export async function assertNoSessionConflict(
  db: Prisma.TransactionClient,
  slot: SessionSlot,
): Promise<void> {
  const conflict = await findSessionConflict(db, slot);
  if (conflict) throw conflictError(conflict);
}

// Tenant bo'yicha sessiya yaratish/generatsiya/sinxronlashni navbatga qo'yadi (tx oxirigacha).
// Dublikat va to'qnashuv tekshiruvi qulf ostida bajariladi — parallel so'rovlar bir-birini
// "ko'rmay" bir xil slotga ikkita dars yarata olmaydi.
export async function lockTenantSchedule(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  // pg_advisory_xact_lock `void` qaytaradi — Prisma uni deserializatsiya qila olmasligi uchun o'raladi
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${`schedule:${tenantId}`}))) AS l`;
}
