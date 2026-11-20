import { HttpException, NotFoundException } from '@nestjs/common';
import {
  assertActiveStudent,
  assertActiveStudents,
  assertTeachingUser,
  findMissingIds,
  STUDENTS_NOT_FOUND,
} from './user-role-checks';

type FindManyArgs = { where: Record<string, unknown> };

const dbReturning = (ids: string[]) => {
  const findMany = jest
    .fn<Promise<{ id: string }[]>, [FindManyArgs]>()
    .mockResolvedValue(ids.map((id) => ({ id })));
  return { db: { user: { findMany } }, findMany };
};

describe('findMissingIds', () => {
  it('topilmaganlarini tartib bilan, takrorsiz qaytaradi', () => {
    expect(findMissingIds(['a', 'b', 'c', 'b'], ['a'])).toEqual(['b', 'c']);
  });

  it('hammasi topilsa bo`sh', () => {
    expect(findMissingIds(['a', 'b'], ['b', 'a'])).toEqual([]);
  });
});

describe('assertActiveStudents', () => {
  it('tenant, rol va faollik bo`yicha filtrlaydi', async () => {
    const { db, findMany } = dbReturning(['s1']);
    await assertActiveStudents(db, 't1', ['s1']);
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      id: { in: ['s1'] },
      tenantId: 't1',
      isActive: true,
      isDeleted: false,
      role: { name: 'student' },
    });
  });

  it('boshqa tenant / xodim ID si bo`lsa 400 STUDENTS_NOT_FOUND', async () => {
    const { db } = dbReturning(['s1']);
    const err = await assertActiveStudents(db, 't1', ['s1', 'x']).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(400);
    expect((err as HttpException).getResponse()).toMatchObject({
      code: STUDENTS_NOT_FOUND,
      studentIds: ['x'],
    });
  });

  it('bo`sh ro`yxatda DB ga murojaat qilmaydi', async () => {
    const { db, findMany } = dbReturning([]);
    await assertActiveStudents(db, 't1', []);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('assertActiveStudent / assertTeachingUser', () => {
  it('topilmasa 404', async () => {
    const { db } = dbReturning([]);
    await expect(assertActiveStudent(db, 't1', 's1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(assertTeachingUser(db, 't1', 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('o`qituvchi teacher/admin rolida bo`lishi kerak', async () => {
    const { db, findMany } = dbReturning(['u1']);
    await assertTeachingUser(db, 't1', 'u1');
    expect(findMany.mock.calls[0][0].where.role).toEqual({
      name: { in: ['teacher', 'admin'] },
    });
  });
});
