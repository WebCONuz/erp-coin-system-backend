import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateScheduleExceptionDto } from './dto/create-schedule-exception.dto';
import { ScheduleService } from './schedule.service';

// PATCH /schedule-exceptions/:id — qisman yangilash semantikasi.
// DTO ValidationPipe kabi plainToInstance orqali yaratiladi: ES2022+ class fields tufayli
// yuborilmagan maydonlar ham obyektda `undefined` bo'lib turadi — `'x' in dto` har doim true.
// Bu test o'sha xatoning qaytmasligini kuzatadi.

const existing = {
  id: 'exc-1',
  templateId: 'tpl-1',
  isCancelled: false,
  startTime: '11:00',
  endTime: '12:30',
  roomId: 'room-2',
  teacherId: 'substitute',
  note: 'eski izoh',
};

function setup() {
  const update = jest
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...existing, ...data }),
    );
  const prisma: Record<string, unknown> = {
    scheduleException: {
      findFirst: jest.fn().mockResolvedValue(existing),
      update,
    },
    room: { findFirst: jest.fn().mockResolvedValue({ id: 'room-x' }) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'teacher-x' }) },
    // tenant timezone ("bugun") va jadval qulfi
    tenant: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  // Istisno yozish + sinxronlash bitta tx'da — tx sifatida shu mock uzatiladi
  prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  const service = new ScheduleService(prisma as unknown as PrismaService);
  jest
    .spyOn(
      service as unknown as {
        syncTemplateSessionsInTx: () => Promise<unknown>;
      },
      'syncTemplateSessionsInTx',
    )
    .mockResolvedValue({ updated: 0, removed: 0, created: 0, conflicts: [] });
  return { service, update };
}

const patch = async (body: Record<string, unknown>) => {
  const { service, update } = setup();
  const dto = plainToInstance(UpdateScheduleExceptionDto, body);
  await service.updateException('exc-1', 'tenant-1', dto);
  const [[arg]] = update.mock.calls as [[{ data: Record<string, unknown> }]];
  return arg.data;
};

describe('updateException (qisman PATCH)', () => {
  it('DTO da yuborilmagan maydonlar ham mavjud — shuning uchun `in` ishlatilmaydi', () => {
    const dto = plainToInstance(UpdateScheduleExceptionDto, { note: 'x' });
    expect('startTime' in dto).toBe(true);
    expect(dto.startTime).toBeUndefined();
  });

  it("faqat izoh yuborilsa — vaqt, xona, o'rinbosar saqlanadi", async () => {
    expect(await patch({ note: 'yangi izoh' })).toMatchObject({
      startTime: '11:00',
      endTime: '12:30',
      roomId: 'room-2',
      teacherId: 'substitute',
      note: 'yangi izoh',
    });
  });

  it("startTime/endTime: null — vaqt tozalanadi, xona va o'rinbosar saqlanadi", async () => {
    expect(await patch({ startTime: null, endTime: null })).toMatchObject({
      startTime: null,
      endTime: null,
      roomId: 'room-2',
      teacherId: 'substitute',
    });
  });

  it("teacherId: null — o'rinbosar olib tashlanadi, qolganlari saqlanadi", async () => {
    expect(await patch({ teacherId: null })).toMatchObject({
      teacherId: null,
      roomId: 'room-2',
      startTime: '11:00',
    });
  });

  it("hamma o'zgarish tozalansa — 400 (bekor qilinmagan istisno nimanidir o'zgartirishi kerak)", async () => {
    await expect(
      patch({ startTime: null, endTime: null, roomId: null, teacherId: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('faqat startTime (endTime siz) tozalansa — 400', async () => {
    await expect(patch({ startTime: null })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("isCancelled: true — vaqt, xona va o'rinbosar tozalanadi", async () => {
    expect(await patch({ isCancelled: true })).toMatchObject({
      isCancelled: true,
      startTime: null,
      endTime: null,
      roomId: null,
      teacherId: null,
    });
  });

  it("exceptionDate yuborilsa ham xato bermaydi va sana o'zgarmaydi", async () => {
    const data = await patch({ exceptionDate: '2030-01-01', note: 'x' });
    expect(data).not.toHaveProperty('exceptionDate');
  });
});
