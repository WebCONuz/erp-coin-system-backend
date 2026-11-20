import { AttendanceStatus } from 'src/generated/prisma/enums';
import { recordChanged } from './attendance-record';

const saved = {
  isPresent: true,
  status: AttendanceStatus.present,
  homeworkDone: false,
  score: 80,
  note: 'yaxshi',
};

describe('recordChanged', () => {
  it("bir xil qiymatlar — o'zgarmagan", () => {
    expect(
      recordChanged(saved, {
        isPresent: true,
        status: AttendanceStatus.present,
        homeworkDone: false,
      }),
    ).toBe(false);
  });

  it.each([
    ['status', { status: AttendanceStatus.late }],
    ['homeworkDone', { homeworkDone: true }],
    ['isPresent', { isPresent: false }],
  ])("%s o'zgarsa — o'zgargan", (_name, over) => {
    expect(
      recordChanged(saved, {
        isPresent: true,
        status: AttendanceStatus.present,
        homeworkDone: false,
        ...over,
      }),
    ).toBe(true);
  });

  it("ball/izoh faqat berilganda solishtiriladi (yo'qlamada tegilmaydi)", () => {
    const base = {
      isPresent: true,
      status: AttendanceStatus.present,
      homeworkDone: false,
    };
    expect(recordChanged(saved, { ...base, score: 80, note: 'yaxshi' })).toBe(
      false,
    );
    expect(recordChanged(saved, { ...base, score: 90 })).toBe(true);
    expect(recordChanged(saved, { ...base, note: null })).toBe(true);
  });
});
