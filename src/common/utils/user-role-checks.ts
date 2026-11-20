import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from 'src/generated/prisma/client';

// Dars o'tishi (guruh o'qituvchisi, sessiya/shablon o'qituvchisi) mumkin bo'lgan rollar
export const TEACHING_ROLE_NAMES = ['teacher', 'admin'];

export const STUDENTS_NOT_FOUND = 'STUDENTS_NOT_FOUND';

// Coin oladigan, guruhga a'zo bo'ladigan, sovg'a sotib oladigan user: faol student
export const ACTIVE_STUDENT_WHERE = {
  isActive: true,
  isDeleted: false,
  role: { name: 'student' },
} satisfies Prisma.UserWhereInput;

// Guruh/sessiya/shablon o'qituvchisi bo'la oladigan user: faol teacher yoki admin
export const ACTIVE_TEACHING_USER_WHERE = {
  isActive: true,
  isDeleted: false,
  role: { name: { in: TEACHING_ROLE_NAMES } },
} satisfies Prisma.UserWhereInput;

// PrismaService ham, tx klienti ham mos keladi
type UserFinder = {
  user: {
    findMany(args: {
      where: Prisma.UserWhereInput;
      select: { id: true };
    }): PromiseLike<{ id: string }[]>;
  };
};

// So'ralgan ID'lardan topilmaganlari (tartib saqlanadi, takrorlar bir marta)
export function findMissingIds(requested: string[], found: string[]): string[] {
  const foundSet = new Set(found);
  return [...new Set(requested)].filter((id) => !foundSet.has(id));
}

/**
 * Barcha ID'lar shu tenantdagi faol student ekanini tekshiradi. Aks holda
 * `400 STUDENTS_NOT_FOUND` (mos kelmagan ID'lar bilan) — boshqa tenant useri,
 * xodim yoki arxivlangan o'quvchi bir xil javob oladi (mavjudligi oshkor bo'lmaydi).
 */
export async function assertActiveStudents(
  db: UserFinder,
  tenantId: string,
  studentIds: string[],
): Promise<void> {
  if (!studentIds.length) return;
  const found = await db.user.findMany({
    where: { id: { in: studentIds }, tenantId, ...ACTIVE_STUDENT_WHERE },
    select: { id: true },
  });
  const missing = findMissingIds(
    studentIds,
    found.map((u) => u.id),
  );
  if (missing.length) {
    throw new HttpException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message: "Ayrim o'quvchilar topilmadi yoki faol emas",
        code: STUDENTS_NOT_FOUND,
        studentIds: missing,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

// Bitta o'quvchi uchun — topilmasa 404
export async function assertActiveStudent(
  db: UserFinder,
  tenantId: string,
  studentId: string,
): Promise<void> {
  const found = await db.user.findMany({
    where: { id: studentId, tenantId, ...ACTIVE_STUDENT_WHERE },
    select: { id: true },
  });
  if (!found.length) throw new NotFoundException("O'quvchi topilmadi");
}

// Guruh o'qituvchisi — shu tenantdagi faol teacher/admin, topilmasa 404
export async function assertTeachingUser(
  db: UserFinder,
  tenantId: string,
  userId: string,
): Promise<void> {
  const found = await db.user.findMany({
    where: { id: userId, tenantId, ...ACTIVE_TEACHING_USER_WHERE },
    select: { id: true },
  });
  if (!found.length) throw new NotFoundException("O'qituvchi topilmadi");
}
