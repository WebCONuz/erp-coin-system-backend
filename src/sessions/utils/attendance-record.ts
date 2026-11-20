import { AttendanceStatus } from 'src/generated/prisma/enums';

export interface AttendanceRecordFields {
  isPresent: boolean;
  status: AttendanceStatus;
  homeworkDone: boolean;
  // undefined — bu rejimda maydon saqlanmaydi (yo'qlamada ball/izoh o'zgarmaydi)
  score?: number | null;
  note?: string | null;
}

/**
 * Saqlangan yo'qlama yozuvi yangi qiymatlardan farq qiladimi. `score` / `note` faqat
 * yangi qiymatda berilgan bo'lsa solishtiriladi (natija rejimi) — yo'qlamada ular tegilmaydi.
 */
export function recordChanged(
  current: {
    isPresent: boolean;
    status: AttendanceStatus;
    homeworkDone: boolean;
    score: number | null;
    note: string | null;
  },
  next: AttendanceRecordFields,
): boolean {
  return (
    current.isPresent !== next.isPresent ||
    current.status !== next.status ||
    current.homeworkDone !== next.homeworkDone ||
    (next.score !== undefined && current.score !== next.score) ||
    (next.note !== undefined && current.note !== next.note)
  );
}
