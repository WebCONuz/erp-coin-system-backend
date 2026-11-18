import { HttpException } from '@nestjs/common';
import {
  AttendanceStatus,
  CoinDirection,
  SourceType,
} from 'src/generated/prisma/enums';
import {
  AttendanceRules,
  buildAttendanceCoinItems,
  DEFAULT_ATTENDANCE_COIN,
  DEFAULT_HOMEWORK_COIN,
  pickAutoRule,
  resolveAttendanceStatus,
} from './attendance-coins';

const common = { teacherId: 't1', groupId: 'g1', sessionId: 's1' };

const build = (
  status: AttendanceStatus,
  rules: AttendanceRules = {},
  homeworkDone = false,
) =>
  buildAttendanceCoinItems({
    status,
    homeworkDone,
    rules,
    common,
    sessionLabel: 'Matematika',
  });

const summary = (items: ReturnType<typeof build>) =>
  items.map((i) => `${i.direction}:${i.sourceType}:${i.amount}`);

describe('resolveAttendanceStatus', () => {
  it('eski format: isPresent → present/absent', () => {
    expect(resolveAttendanceStatus({ studentId: 'x', isPresent: true })).toBe(
      AttendanceStatus.present,
    );
    expect(resolveAttendanceStatus({ studentId: 'x', isPresent: false })).toBe(
      AttendanceStatus.absent,
    );
  });

  it('status ustun', () => {
    expect(
      resolveAttendanceStatus({
        studentId: 'x',
        status: AttendanceStatus.late,
      }),
    ).toBe(AttendanceStatus.late);
  });

  it.each([
    [AttendanceStatus.present, true],
    [AttendanceStatus.late, true],
    [AttendanceStatus.excused, false],
    [AttendanceStatus.absent, false],
  ])('mos juftlik qabul qilinadi: %s + isPresent=%s', (status, isPresent) => {
    expect(resolveAttendanceStatus({ studentId: 'x', status, isPresent })).toBe(
      status,
    );
  });

  it.each([
    [AttendanceStatus.excused, true],
    [AttendanceStatus.present, false],
  ])('nomuvofiq juftlik — 400: %s + isPresent=%s', (status, isPresent) => {
    try {
      resolveAttendanceStatus({ studentId: 'stu-1', status, isPresent });
      fail('xato kutilgan edi');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(400);
      expect((e as HttpException).getResponse()).toMatchObject({
        code: 'ATTENDANCE_STATUS_MISMATCH',
        studentId: 'stu-1',
      });
    }
  });
});

describe('buildAttendanceCoinItems', () => {
  const rules: AttendanceRules = {
    attendance: { id: 'r-att', coinAmount: 7 },
    homework: { id: 'r-hw', coinAmount: 12 },
    absence: { id: 'r-abs', coinAmount: 3 },
    late: { id: 'r-late', coinAmount: 2 },
  };

  it('present — davomat coini', () => {
    expect(summary(build(AttendanceStatus.present, rules))).toEqual([
      'earn:attendance:7',
    ]);
  });

  it("late — kechikish qoidasi bo'yicha (sourceType: late)", () => {
    const items = build(AttendanceStatus.late, rules);
    expect(summary(items)).toEqual(['earn:late:2']);
    expect(items[0].ruleId).toBe('r-late');
  });

  it("late — kechikish qoidasi bo'lmasa davomat coini", () => {
    const { late: _late, ...withoutLate } = rules;
    expect(summary(build(AttendanceStatus.late, withoutLate))).toEqual([
      'earn:attendance:7',
    ]);
  });

  it("excused — coin ham, jarima ham yo'q", () => {
    expect(build(AttendanceStatus.excused, rules)).toEqual([]);
  });

  it("absent — jarima qoidasi bo'lsa jarima", () => {
    expect(summary(build(AttendanceStatus.absent, rules))).toEqual([
      'deduct:attendance:3',
    ]);
  });

  it("absent — jarima qoidasi bo'lmasa hech narsa", () => {
    const { absence: _absence, ...withoutAbsence } = rules;
    expect(build(AttendanceStatus.absent, withoutAbsence)).toEqual([]);
  });

  it("uy vazifasi holatdan qat'i nazar beriladi", () => {
    expect(summary(build(AttendanceStatus.excused, rules, true))).toEqual([
      'earn:homework:12',
    ]);
    expect(summary(build(AttendanceStatus.present, rules, true))).toEqual([
      'earn:attendance:7',
      'earn:homework:12',
    ]);
  });

  it("qoidalar umuman bo'lmasa — standart miqdorlar", () => {
    expect(summary(build(AttendanceStatus.present, {}, true))).toEqual([
      `earn:attendance:${DEFAULT_ATTENDANCE_COIN}`,
      `earn:homework:${DEFAULT_HOMEWORK_COIN}`,
    ]);
  });

  it("har bir elementda sessiya, guruh va o'qituvchi bog'langan", () => {
    for (const item of build(AttendanceStatus.present, rules, true)) {
      expect(item).toMatchObject(common);
    }
  });
});

describe('pickAutoRule', () => {
  const rule = (
    id: string,
    groupId: string | null,
    sourceType: SourceType = SourceType.attendance,
    direction: CoinDirection = CoinDirection.earn,
  ) => ({ id, groupId, sourceType, direction });

  it('guruhga xos qoida umumiydan ustun', () => {
    const rules = [rule('general', null), rule('group', 'g1')];
    expect(
      pickAutoRule(rules, 'g1', SourceType.attendance, CoinDirection.earn)?.id,
    ).toBe('group');
  });

  it('boshqa guruh qoidasi hisobga olinmaydi — umumiy tanlanadi', () => {
    const rules = [rule('general', null), rule('other', 'g2')];
    expect(
      pickAutoRule(rules, 'g1', SourceType.attendance, CoinDirection.earn)?.id,
    ).toBe('general');
  });

  it('sourceType va direction mos kelishi shart', () => {
    const rules = [
      rule('deduct', null, SourceType.attendance, CoinDirection.deduct),
      rule('hw', null, SourceType.homework),
    ];
    expect(
      pickAutoRule(rules, 'g1', SourceType.attendance, CoinDirection.earn),
    ).toBeUndefined();
  });
});
