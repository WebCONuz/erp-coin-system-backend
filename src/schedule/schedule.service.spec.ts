import { Weekday } from 'src/generated/prisma/enums';
import { PrismaService } from 'src/prisma/prisma.service';
import { ScheduleService } from './schedule.service';

// computeOccurrences — shablon + istisno + dam olish kuni + muddat bo'yicha darslarni hisoblash.
// Private metod: generate-sessions va sinxronlashning yadrosi, shuning uchun to'g'ridan-to'g'ri testlanadi.

type Occ = {
  templateId: string;
  date: string;
  startTime: string;
  endTime: string;
  roomId: string;
  teacherId: string;
};

const template = (over: Record<string, unknown> = {}) => ({
  id: 'tpl-1',
  weekday: Weekday.monday,
  startTime: '09:00',
  endTime: '10:30',
  roomId: 'room-1',
  teacherId: null as string | null,
  subjectId: null,
  validFrom: null as Date | null,
  validTo: null as Date | null,
  ...over,
});

function compute(opts: {
  templates?: ReturnType<typeof template>[];
  exceptions?: Record<string, unknown>[];
  holidays?: string[];
  from?: string;
  to?: string;
}) {
  const db = {
    scheduleException: {
      findMany: jest.fn().mockResolvedValue(opts.exceptions ?? []),
    },
    holiday: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (opts.holidays ?? []).map((d) => ({ date: new Date(d) })),
        ),
    },
  };
  const service = new ScheduleService({} as PrismaService);
  // 2026-11-16, 23, 30 — dushanba
  return service['computeOccurrences'](
    db as never,
    'tenant-1',
    opts.templates ?? [template()],
    'group-teacher',
    opts.from ?? '2026-11-16',
    opts.to ?? '2026-11-30',
  ) as Promise<{ occurrences: Occ[]; cancelled: number; holidays: number }>;
}

describe('ScheduleService.computeOccurrences', () => {
  it("faqat shablon hafta kunlarida, o'qituvchi — guruh o'qituvchisi (fallback)", async () => {
    const { occurrences } = await compute({});
    expect(occurrences.map((o) => o.date)).toEqual([
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
    expect(occurrences[0]).toMatchObject({
      startTime: '09:00',
      endTime: '10:30',
      roomId: 'room-1',
      teacherId: 'group-teacher',
    });
  });

  it("shablonning o'z o'qituvchisi guruh o'qituvchisidan ustun", async () => {
    const { occurrences } = await compute({
      templates: [template({ teacherId: 'tpl-teacher' })],
    });
    expect(occurrences[0].teacherId).toBe('tpl-teacher');
  });

  it("dam olish kunida dars yo'q", async () => {
    const result = await compute({ holidays: ['2026-11-23'] });
    expect(result.occurrences.map((o) => o.date)).toEqual([
      '2026-11-16',
      '2026-11-30',
    ]);
    expect(result.holidays).toBe(1);
  });

  it("amal qilish muddatidan tashqarida dars yo'q", async () => {
    const { occurrences } = await compute({
      templates: [
        template({
          validFrom: new Date('2026-11-20'),
          validTo: new Date('2026-11-23'),
        }),
      ],
    });
    expect(occurrences.map((o) => o.date)).toEqual(['2026-11-23']);
  });

  it('bekor qilingan istisno', async () => {
    const result = await compute({
      exceptions: [
        {
          templateId: 'tpl-1',
          exceptionDate: new Date('2026-11-23'),
          isCancelled: true,
        },
      ],
    });
    expect(result.occurrences).toHaveLength(2);
    expect(result.cancelled).toBe(1);
  });

  it("istisno: vaqt, xona va o'rinbosar o'qituvchi faqat shu kunga", async () => {
    const { occurrences } = await compute({
      templates: [template({ teacherId: 'tpl-teacher' })],
      exceptions: [
        {
          templateId: 'tpl-1',
          exceptionDate: new Date('2026-11-23'),
          isCancelled: false,
          startTime: '11:00',
          endTime: '12:30',
          roomId: 'room-2',
          teacherId: 'substitute',
        },
      ],
    });
    const byDate = Object.fromEntries(occurrences.map((o) => [o.date, o]));
    expect(byDate['2026-11-23']).toMatchObject({
      startTime: '11:00',
      endTime: '12:30',
      roomId: 'room-2',
      teacherId: 'substitute',
    });
    expect(byDate['2026-11-16']).toMatchObject({
      startTime: '09:00',
      roomId: 'room-1',
      teacherId: 'tpl-teacher',
    });
  });

  it("bir nechta shablon — har biri o'z kunida", async () => {
    const { occurrences } = await compute({
      templates: [
        template(),
        template({
          id: 'tpl-2',
          weekday: Weekday.wednesday,
          startTime: '14:00',
          endTime: '15:00',
        }),
      ],
      to: '2026-11-22',
    });
    expect(occurrences.map((o) => `${o.templateId}@${o.date}`)).toEqual([
      'tpl-1@2026-11-16',
      'tpl-2@2026-11-18',
    ]);
  });
});
