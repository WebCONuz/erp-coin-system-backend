import {
  addDays,
  diffDays,
  HHMM_REGEX,
  isValidDateOnly,
  isValidTimeZone,
  localDateOf,
  normalizeDateOnly,
  nowInTimeZone,
  startOfMonth,
  startOfWeek,
  timeZoneOffsetMinutes,
  toDateString,
  zonedDayStart,
} from './tenant-time';

describe('tenant-time', () => {
  describe('nowInTimeZone', () => {
    // 2026-11-18 20:30 UTC
    const at = new Date('2026-11-18T20:30:00Z');

    it("Toshkentda (UTC+5) sana keyingi kunga o'tadi", () => {
      expect(nowInTimeZone('Asia/Tashkent', at)).toEqual({
        date: '2026-11-19',
        time: '01:30',
      });
    });

    it("UTC da o'zgarishsiz", () => {
      expect(nowInTimeZone('UTC', at)).toEqual({
        date: '2026-11-18',
        time: '20:30',
      });
    });

    it('yarim tun "00:xx" ko\'rinishida (24:xx emas)', () => {
      expect(nowInTimeZone('UTC', new Date('2026-11-18T00:05:00Z')).time).toBe(
        '00:05',
      );
    });
  });

  it('toDateString — @db.Date qiymatidan kalendar sana', () => {
    expect(toDateString(new Date('2026-03-01'))).toBe('2026-03-01');
  });

  it("addDays — oy va yil chegarasidan o'tadi", () => {
    expect(addDays('2026-03-01', -7)).toBe('2026-02-22');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // kabisa yili
  });

  it('diffDays', () => {
    expect(diffDays('2026-01-01', '2026-01-01')).toBe(0);
    expect(diffDays('2026-01-01', '2026-04-02')).toBe(91);
    expect(diffDays('2026-04-02', '2026-01-01')).toBe(-91);
  });

  it('isValidTimeZone', () => {
    expect(isValidTimeZone('Asia/Tashkent')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Base')).toBe(false);
  });

  it.each(['00:00', '09:00', '14:30', '23:59'])(
    'HHMM_REGEX qabul qiladi: %s',
    (v) => expect(HHMM_REGEX.test(v)).toBe(true),
  );

  it.each(['9:00', '24:00', '12:60', '12:5', '1200', ''])(
    'HHMM_REGEX rad etadi: "%s"',
    (v) => expect(HHMM_REGEX.test(v)).toBe(false),
  );

  it("HH:MM matn sifatida to'g'ri tartiblanadi (ikki xonali soat sababli)", () => {
    expect('09:00' < '14:00').toBe(true);
  });

  it.each(['2026-11-20', '2028-02-29', '2026-12-31'])(
    'isValidDateOnly qabul qiladi: %s',
    (v) => expect(isValidDateOnly(v)).toBe(true),
  );

  it.each(['2026-02-30', '2026-13-01', '2026-1-1', '2026-11-20T00:00', ''])(
    'isValidDateOnly rad etadi: "%s"',
    (v) => expect(isValidDateOnly(v)).toBe(false),
  );

  describe('zonedDayStart / localDateOf', () => {
    it("Toshkent yarim tuni — UTC bo'yicha oldingi kun 19:00", () => {
      expect(zonedDayStart('Asia/Tashkent', '2026-11-20').toISOString()).toBe(
        '2026-11-19T19:00:00.000Z',
      );
    });

    it("UTC da o'zgarishsiz", () => {
      expect(zonedDayStart('UTC', '2026-11-20').toISOString()).toBe(
        '2026-11-20T00:00:00.000Z',
      );
    });

    it('yozgi vaqt (Berlin: qishda +1, yozda +2)', () => {
      expect(zonedDayStart('Europe/Berlin', '2026-01-15').toISOString()).toBe(
        '2026-01-14T23:00:00.000Z',
      );
      expect(zonedDayStart('Europe/Berlin', '2026-07-15').toISOString()).toBe(
        '2026-07-14T22:00:00.000Z',
      );
    });

    it('instant mahalliy sanaga', () => {
      expect(
        localDateOf('Asia/Tashkent', new Date('2026-11-19T19:00:00Z')),
      ).toBe('2026-11-20');
      expect(
        localDateOf('Asia/Tashkent', new Date('2026-11-19T18:59:59Z')),
      ).toBe('2026-11-19');
    });

    it('timeZoneOffsetMinutes', () => {
      expect(timeZoneOffsetMinutes('Asia/Tashkent', new Date())).toBe(300);
      expect(timeZoneOffsetMinutes('UTC', new Date())).toBe(0);
    });
  });

  it('startOfWeek — dushanba (yakshanba oldingi haftaga tegishli)', () => {
    expect(startOfWeek('2026-11-20')).toBe('2026-11-16'); // juma → dushanba
    expect(startOfWeek('2026-11-16')).toBe('2026-11-16');
    expect(startOfWeek('2026-11-22')).toBe('2026-11-16'); // yakshanba
  });

  it('startOfMonth', () => {
    expect(startOfMonth('2026-11-20')).toBe('2026-11-01');
  });

  describe('normalizeDateOnly', () => {
    it("to'liq ISO satrdan klient yozgan sana olinadi (UTC ga aylantirilmaydi)", () => {
      expect(normalizeDateOnly('2026-11-20T02:00:00+05:00')).toBe('2026-11-20');
      expect(normalizeDateOnly('2026-11-20T23:30:00.000Z')).toBe('2026-11-20');
    });

    it("sana yoki boshqa qiymat o'zgarmaydi", () => {
      expect(normalizeDateOnly('2026-11-20')).toBe('2026-11-20');
      expect(normalizeDateOnly('abc')).toBe('abc');
      expect(normalizeDateOnly(5)).toBe(5);
    });
  });
});
