import {
  addDays,
  diffDays,
  HHMM_REGEX,
  isValidTimeZone,
  nowInTimeZone,
  toDateString,
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
});
