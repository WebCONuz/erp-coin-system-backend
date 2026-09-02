import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { QueryGroupDto } from './dto/query-group.dto';
import { AddStudentDto } from './dto/add-student.dto';
import { AddStudentsBulkDto } from './dto/add-students-bulk.dto';
import { Prisma } from 'src/generated/prisma/client';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, createdById: string, dto: CreateGroupDto) {
    // 1. Kurs mavjudligini va shu tenantga tegishliligini tekshiramiz
    const course = await this.prisma.course.findFirst({
      where: { id: dto.courseId, tenantId, isDeleted: false },
    });
    if (!course) throw new NotFoundException('Kurs topilmadi');

    // 2. O'qituvchi mavjudligini va shu tenantga tegishliligini tekshiramiz
    const teacher = await this.prisma.user.findFirst({
      where: { id: dto.teacherId, tenantId, isDeleted: false },
    });
    if (!teacher) throw new NotFoundException('O‘qituvchi topilmadi');

    return this.prisma.group.create({
      data: {
        name: dto.name,
        maxStudents: dto.maxStudents,
        courseId: dto.courseId,
        teacherId: dto.teacherId,
        tenantId,
        createdById,
      },
      select: {
        id: true,
        name: true,
        maxStudents: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        course: { select: { id: true, title: true, description: true } },
        teacher: { select: { id: true, fullName: true, phone: true } },
        _count: { select: { students: { where: { isDeleted: false } } } },
      },
    });
  }

  async findAll(
    query: QueryGroupDto,
    tenantId: string,
    requesterRole?: string,
    requesterId?: string,
  ) {
    const {
      page = 1,
      limit = 10,
      search,
      courseId,
      teacherId,
      isActive,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.GroupWhereInput = { tenantId, isDeleted: false };

    if (isActive !== undefined) where.isActive = isActive;
    else where.isActive = true;

    if (courseId) where.courseId = courseId;
    if (teacherId) where.teacherId = teacherId;
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    // Student faqat o'zi a'zo bo'lgan guruhlarni ko'ra oladi
    if (requesterRole === 'student') {
      where.students = {
        some: { studentId: requesterId, isDeleted: false },
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.group.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          maxStudents: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          course: { select: { id: true, title: true } },
          teacher: { select: { id: true, fullName: true, phone: true } },
          _count: { select: { students: { where: { isDeleted: false } } } }, // Faol o'quvchilar soni
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.group.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(
    id: string,
    tenantId: string,
    requesterRole?: string,
    requesterId?: string,
  ) {
    const group = await this.prisma.group.findFirst({
      where: { id, tenantId, isDeleted: false },
      select: {
        id: true,
        name: true,
        maxStudents: true,
        createdAt: true,
        updatedAt: true,
        course: { select: { id: true, title: true, description: true } },
        teacher: { select: { id: true, fullName: true, phone: true } },
        students: {
          where: { isDeleted: false },
          select: {
            id: true,
            joinedAt: true,
            addedById: true,
            student: { select: { id: true, fullName: true, phone: true } },
          },
        },
      },
    });

    if (!group) throw new NotFoundException('Guruh topilmadi');

    // Student faqat o'zi a'zo bo'lgan guruhni ko'ra oladi
    if (requesterRole === 'student') {
      const isMember = group.students.some((s) => s.student.id === requesterId);
      if (!isMember) {
        throw new ForbiddenException("Siz bu guruhni ko'ra olmaysiz");
      }
    }

    return group;
  }

  // ─── Talabaning o'z guruhlari (Shaxsiy profil uchun) ───────────
  async findMyGroups(userId: string, tenantId: string, role: string) {
    if (role === 'teacher') {
      return this.prisma.group.findMany({
        where: { teacherId: userId, tenantId, isDeleted: false },
        select: {
          id: true,
          name: true,
          maxStudents: true,
          isActive: true,
          course: { select: { id: true, title: true } },
          _count: { select: { students: { where: { isDeleted: false } } } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    const memberships = await this.prisma.groupStudent.findMany({
      where: {
        studentId: userId,
        isDeleted: false,
        group: { tenantId, isDeleted: false },
      },
      select: {
        id: true,
        joinedAt: true,
        isActive: true,
        group: {
          select: {
            id: true,
            name: true,
            isActive: true,
            course: { select: { id: true, title: true } },
            teacher: { select: { id: true, fullName: true, phone: true } },
            _count: {
              select: { students: { where: { isDeleted: false } } },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return memberships.map((m) => ({
      membershipId: m.id,
      joinedAt: m.joinedAt,
      membershipActive: m.isActive,
      ...m.group,
    }));
  }

  async update(id: string, dto: UpdateGroupDto, tenantId: string) {
    await this.findOne(id, tenantId);

    if (dto.courseId) {
      const course = await this.prisma.course.findFirst({
        where: { id: dto.courseId, tenantId, isDeleted: false },
      });
      if (!course) throw new NotFoundException('Kurs topilmadi');
    }

    if (dto.teacherId) {
      const teacher = await this.prisma.user.findFirst({
        where: { id: dto.teacherId, tenantId, isDeleted: false },
      });
      if (!teacher) throw new NotFoundException('O‘qituvchi topilmadi');
    }

    return this.prisma.group.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);

    // Guruh o'chirilishidan oldin unga biriktirilgan dars jadvali shablonlari bormi?
    const schedules = await this.prisma.scheduleTemplate.count({
      where: { groupId: id, isDeleted: false },
    });
    if (schedules > 0) {
      throw new BadRequestException(
        'Guruhda faol dars jadvallari mavjud, avval ularni o‘chiring.',
      );
    }

    const deleted = await this.prisma.group.update({
      where: { id },
      data: { isDeleted: true, isActive: false, deletedAt: new Date() },
    });

    return { message: 'Guruh muvaffaqiyatli o‘chirildi', id: deleted.id };
  }

  // ─────────────────────────────────────────
  // GROUP STUDENTS LOGIC (Guruh o'quvchilari)
  // ─────────────────────────────────────────

  async addStudent(
    groupId: string,
    tenantId: string,
    addedById: string,
    dto: AddStudentDto,
  ) {
    const group = await this.findOne(groupId, tenantId);

    // 1. O'quvchi bazada bormi va shu tenantgami?
    const student = await this.prisma.user.findFirst({
      where: { id: dto.studentId, tenantId, isDeleted: false },
    });
    if (!student) throw new NotFoundException('O‘quvchi topilmadi');

    // 2. O'quvchi allaqachon shu guruhda bormi (o'chirilmagan holatda)?
    const existingMembership = await this.prisma.groupStudent.findFirst({
      where: { groupId, studentId: dto.studentId, isDeleted: false },
    });
    if (existingMembership)
      throw new BadRequestException('O‘quvchi allaqachon ushbu guruhga a’zo');

    // 3. Guruhda bo'sh joy bormi?
    const currentStudentsCount = await this.prisma.groupStudent.count({
      where: { groupId, isDeleted: false },
    });
    if (currentStudentsCount >= group.maxStudents) {
      throw new BadRequestException(
        'Guruhda bo‘sh joy qolmagan (Maksimal sig‘imga yetdi)',
      );
    }

    // 4. Agar oldin o'chirib yuborilgan a'zolik bo'lsa, uni tiklaymiz (Restore), bo'lmasa yangi ochamiz
    const softDeletedMembership = await this.prisma.groupStudent.findFirst({
      where: { groupId, studentId: dto.studentId, isDeleted: true },
    });

    if (softDeletedMembership) {
      return this.prisma.groupStudent.update({
        where: { id: softDeletedMembership.id },
        data: {
          isDeleted: false,
          isActive: true,
          joinedAt: new Date(),
          addedById,
        },
        select: { id: true },
      });
    }

    return this.prisma.groupStudent.create({
      data: { groupId, studentId: dto.studentId, addedById },
      select: { id: true },
    });
  }

  async removeStudent(groupId: string, studentId: string, tenantId: string) {
    await this.findOne(groupId, tenantId);

    const membership = await this.prisma.groupStudent.findFirst({
      where: { groupId, studentId, isDeleted: false },
    });

    if (!membership)
      throw new NotFoundException('O‘quvchi ushbu guruh a’zosi emas');

    await this.prisma.groupStudent.update({
      where: { id: membership.id },
      data: { isDeleted: true, isActive: false, archivedAt: new Date() },
    });

    return { message: 'O‘quvchi guruhdan muvaffaqiyatli chiqarildi' };
  }

  async addStudentsBulk(
    groupId: string,
    tenantId: string,
    addedById: string,
    dto: AddStudentsBulkDto,
  ) {
    const { studentIds } = dto;

    // 1. Guruhni topamiz va sig'imini tekshiramiz
    const group = await this.findOne(groupId, tenantId);

    // 2. Guruhda hozir nechta faol o'quvchi borligini aniqlaymiz
    const currentStudentsCount = await this.prisma.groupStudent.count({
      where: { groupId, isDeleted: false },
    });

    // 3. Bazada yuborilgan IDlar bo'yicha eski a'zolik tarixi bor-yo'qligini tekshiramiz
    const existingRecords = await this.prisma.groupStudent.findMany({
      where: {
        groupId,
        studentId: { in: studentIds },
      },
      select: { studentId: true, isDeleted: true },
    });

    // 4. Talabalarni statuslariga qarab 3 ta guruhga ajratamiz:
    const alreadyActiveIds: string[] = []; // Hozir ham faol bo'lganlar
    const softDeletedIds: string[] = []; // Oldin o'chirib yuborilganlar (Tiklanishi kerak)

    existingRecords.forEach((rec) => {
      if (rec.isDeleted === false) {
        alreadyActiveIds.push(rec.studentId);
      } else {
        softDeletedIds.push(rec.studentId);
      }
    });

    // Mutloq yangi bo'lgan (bazada umuman yozuvi yo'q) o'quvchilar ID-lari
    const knownIds = existingRecords.map((r) => r.studentId);
    const brandNewIds = studentIds.filter((id) => !knownIds.includes(id));

    // 5. Guruhga haqiqatda qo'shilayotgan jami yangi o'quvchilar soni
    const totalToInsertOrRestore = softDeletedIds.length + brandNewIds.length;

    if (totalToInsertOrRestore === 0) {
      throw new BadRequestException(
        "Barcha yuborilgan o‘quvchilar allaqachon ushbu guruhga qo'shilgan.",
      );
    }

    // 6. Guruh sig'imi tekshiruvi (Maksimal joydan oshib ketmasligi shart)
    if (currentStudentsCount + totalToInsertOrRestore > group.maxStudents) {
      const availableSeats = group.maxStudents - currentStudentsCount;
      throw new BadRequestException(
        `Guruhda joy yetarli emas. Maksimal sig‘im: ${group.maxStudents}, faol o‘quvchilar: ${currentStudentsCount}, bo‘sh joy: ${availableSeats} ta. Siz esa ${totalToInsertOrRestore} ta o‘quvchi qo‘shmoqchisiz.`,
      );
    }

    // 7. Baza bilan Tranzaksiya boshlaymiz (Hamma amal yoki bajariladi, yoki bekor bo'ladi)
    await this.prisma.$transaction(async (tx) => {
      // A. Oldin o'chirilganlarni TIKLAYMIZ (Soft-delete bekor qilinadi)
      if (softDeletedIds.length > 0) {
        await tx.groupStudent.updateMany({
          where: {
            groupId,
            studentId: { in: softDeletedIds },
          },
          data: {
            isDeleted: false,
            isActive: true,
            joinedAt: new Date(), // Qo'shilgan vaqtini yangilaymiz
            addedById,
            archivedAt: null, // Eski o'chirilgan vaqtini tozalaymiz
          },
        });
      }

      // B. Umuman yangi bo'lgan o'quvchilarni YARATAMIZ (Bulk Insert)
      if (brandNewIds.length > 0) {
        const newRecordsData = brandNewIds.map((studentId) => ({
          groupId,
          studentId,
          addedById,
        }));

        await tx.groupStudent.createMany({
          data: newRecordsData,
        });
      }
    });

    // 8. Administratorga to'liq va shaffof hisobot qaytaramiz
    return {
      message: `${studentIds.length}ta o'quvchi guruhga biriktirildi`,
      summary: {
        totalRequested: studentIds.length,
        brandNewAdded: brandNewIds.length, // Mutloq yangi qo'shilganlar
        restoredFromDeleted: softDeletedIds.length, // O'chirilgan joyidan qayta tiklanganlar
        skippedAlreadyActive: alreadyActiveIds.length, // Allaqachon borligi uchun tashlab ketilganlar
      },
    };
  }
}
