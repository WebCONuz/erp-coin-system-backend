import { Prisma } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

// Teacher guruhga kira oladimi — yagona qoida:
// 1) guruhning asosiy o'qituvchisi (Group.teacherId), yoki
// 2) shu guruhda unga biriktirilgan sessiya bor (admin imtihon/o'rinbosar
//    darsni boshqa o'qituvchiga bergan holat), yoki
// 3) shu guruhning dars jadvali shablonida u o'qituvchi (ScheduleTemplate.teacherId)
export function teacherGroupAccessWhere(
  teacherId: string,
): Prisma.GroupWhereInput {
  return {
    OR: [
      { teacherId },
      { sessions: { some: { teacherId, isDeleted: false } } },
      { scheduleTemplates: { some: { teacherId, isDeleted: false } } },
    ],
  };
}

export async function canTeacherAccessGroup(
  prisma: PrismaService,
  groupId: string,
  teacherId: string,
  tenantId: string,
): Promise<boolean> {
  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      tenantId,
      isDeleted: false,
      ...teacherGroupAccessWhere(teacherId),
    },
    select: { id: true },
  });
  return !!group;
}
