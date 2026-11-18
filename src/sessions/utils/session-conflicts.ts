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

  for (const c of candidates) {
    if (!timeOverlap(slot.startTime, slot.endTime, c.startTime!, c.endTime!))
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
      groupName: c.group.name,
      startTime: c.startTime!,
      endTime: c.endTime!,
    };
  }
  return null;
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
