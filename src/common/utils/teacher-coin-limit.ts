import { HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

export const TEACHER_COIN_LIMIT_EXCEEDED = 'TEACHER_COIN_LIMIT_EXCEEDED';

/**
 * Teacher o'zi belgilaydigan coin miqdori (qo'lda berish, qoidani qo'llash, imtihon natijasi,
 * teacher yaratgan qoida) tenant sozlamasidagi `teacherCoinLimit` dan oshmasligi kerak.
 * Limit bitta o'quvchiga bitta tranzaksiyadagi miqdorga qo'llanadi. Admin va undan yuqori
 * rollar uchun, shuningdek limit o'rnatilmagan (null) tenantda tekshiruv yo'q.
 */
export async function assertTeacherCoinLimit(
  prisma: PrismaService,
  tenantId: string,
  requesterRole: string | undefined,
  amounts: number[],
): Promise<void> {
  if (requesterRole !== 'teacher' || !amounts.length) return;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { teacherCoinLimit: true },
  });
  const limit = tenant?.teacherCoinLimit;
  if (limit == null) return;

  const max = Math.max(...amounts);
  if (max > limit) {
    throw new HttpException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Bir o'quvchiga bir martada ko'pi bilan ${limit} coin bera olasiz (so'ralgan: ${max})`,
        code: TEACHER_COIN_LIMIT_EXCEEDED,
        limit,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
