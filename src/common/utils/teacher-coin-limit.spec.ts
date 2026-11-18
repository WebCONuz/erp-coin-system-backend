import { HttpException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { assertTeacherCoinLimit } from './teacher-coin-limit';

const prismaWithLimit = (teacherCoinLimit: number | null) => {
  const findUnique = jest.fn().mockResolvedValue({ teacherCoinLimit });
  return {
    prisma: { tenant: { findUnique } } as unknown as PrismaService,
    findUnique,
  };
};

describe('assertTeacherCoinLimit', () => {
  it("limit ichida — o'tadi", async () => {
    const { prisma } = prismaWithLimit(50);
    await expect(
      assertTeacherCoinLimit(prisma, 't1', 'teacher', [10, 50]),
    ).resolves.toBeUndefined();
  });

  it('limitdan oshsa — 400 TEACHER_COIN_LIMIT_EXCEEDED', async () => {
    const { prisma } = prismaWithLimit(50);
    const promise = assertTeacherCoinLimit(prisma, 't1', 'teacher', [10, 80]);
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    await expect(
      assertTeacherCoinLimit(prisma, 't1', 'teacher', [80]),
    ).rejects.toMatchObject({
      response: { code: 'TEACHER_COIN_LIMIT_EXCEEDED', limit: 50 },
    });
  });

  it("limit o'rnatilmagan (null) — cheklov yo'q", async () => {
    const { prisma } = prismaWithLimit(null);
    await expect(
      assertTeacherCoinLimit(prisma, 't1', 'teacher', [100_000]),
    ).resolves.toBeUndefined();
  });

  it.each(['admin', 'super_admin', 'creator', undefined])(
    "%s uchun tekshirilmaydi (DB ga ham murojaat yo'q)",
    async (role) => {
      const { prisma, findUnique } = prismaWithLimit(1);
      await assertTeacherCoinLimit(prisma, 't1', role, [999]);
      expect(findUnique).not.toHaveBeenCalled();
    },
  );
});
