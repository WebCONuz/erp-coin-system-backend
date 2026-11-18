import { HttpException, HttpStatus } from '@nestjs/common';
import {
  AttendanceStatus,
  CoinDirection,
  SourceType,
} from 'src/generated/prisma/enums';
import { SessionCoinItem } from 'src/common/types';
import { SESSION_ERROR_CODES } from '../constants/session-types';

// Qoida bo'lmaganda ishlatiladigan standart coin miqdorlari
export const DEFAULT_ATTENDANCE_COIN = 5;
export const DEFAULT_HOMEWORK_COIN = 10;

export interface AttendanceRuleRef {
  id: string;
  coinAmount: number;
}

// Sessiyaga mos avtomatik qoidalar (guruhga xos > umumiy tanlab bo'lingan)
export interface AttendanceRules {
  attendance?: AttendanceRuleRef;
  late?: AttendanceRuleRef;
  homework?: AttendanceRuleRef;
  absence?: AttendanceRuleRef;
}

/**
 * Avtomatik qoidani `sourceType` + `direction` bo'yicha tanlash: shu guruhga xos qoida
 * (groupId === sessiya guruhi) tenant bo'yicha umumiy qoidadan (groupId: null) ustun.
 */
export function pickAutoRule<
  T extends {
    sourceType: SourceType | null;
    direction: CoinDirection;
    groupId: string | null;
  },
>(
  rules: T[],
  groupId: string,
  sourceType: SourceType,
  direction: CoinDirection,
): T | undefined {
  const candidates = rules.filter(
    (r) => r.sourceType === sourceType && r.direction === direction,
  );
  return (
    candidates.find((r) => r.groupId === groupId) ??
    candidates.find((r) => r.groupId === null)
  );
}

export const isAttendedStatus = (status: AttendanceStatus) =>
  status === AttendanceStatus.present || status === AttendanceStatus.late;

/**
 * Yo'qlama holatini aniqlash: `status` ustun; faqat `isPresent` berilsa — present/absent.
 * Ikkalasi berilsa mos bo'lishi kerak (isPresent true ↔ present/late), aks holda 400.
 */
export function resolveAttendanceStatus(record: {
  studentId: string;
  status?: AttendanceStatus;
  isPresent?: boolean;
}): AttendanceStatus {
  if (record.status === undefined) {
    return record.isPresent
      ? AttendanceStatus.present
      : AttendanceStatus.absent;
  }
  if (
    record.isPresent !== undefined &&
    record.isPresent !== isAttendedStatus(record.status)
  ) {
    throw new HttpException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message: `status (${record.status}) va isPresent (${record.isPresent}) bir-biriga mos emas`,
        code: SESSION_ERROR_CODES.ATTENDANCE_STATUS_MISMATCH,
        studentId: record.studentId,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
  return record.status;
}

/**
 * Bitta o'quvchi uchun yo'qlama coinlari:
 * - present — davomat coini (qoida yoki 5);
 * - late — "kechikish" qoidasi bo'lsa shu (`sourceType: late`), bo'lmasa davomat coini;
 * - excused — coin ham, jarima ham yo'q;
 * - absent — jarima qoidasi bo'lsa jarima;
 * - homeworkDone — holatdan qat'i nazar uy vazifasi coini (qoida yoki 10).
 */
export function buildAttendanceCoinItems(params: {
  status: AttendanceStatus;
  homeworkDone: boolean;
  rules: AttendanceRules;
  common: { teacherId: string; groupId: string; sessionId: string };
  sessionLabel: string;
}): SessionCoinItem[] {
  const { status, homeworkDone, rules, common, sessionLabel } = params;
  const attendanceCoin =
    rules.attendance?.coinAmount ?? DEFAULT_ATTENDANCE_COIN;
  const items: SessionCoinItem[] = [];

  if (status === AttendanceStatus.present) {
    items.push({
      ...common,
      amount: attendanceCoin,
      direction: CoinDirection.earn,
      sourceType: SourceType.attendance,
      note: `Darsda qatnashgani uchun avtomatik bonus (${sessionLabel})`,
      ruleId: rules.attendance?.id,
    });
  }

  if (status === AttendanceStatus.late) {
    items.push(
      rules.late
        ? {
            ...common,
            amount: rules.late.coinAmount,
            direction: CoinDirection.earn,
            sourceType: SourceType.late,
            note: `Darsga kechikib kelgani uchun (${sessionLabel})`,
            ruleId: rules.late.id,
          }
        : {
            ...common,
            amount: attendanceCoin,
            direction: CoinDirection.earn,
            sourceType: SourceType.attendance,
            note: `Darsda qatnashgani uchun avtomatik bonus — kechikdi (${sessionLabel})`,
            ruleId: rules.attendance?.id,
          },
    );
  }

  if (homeworkDone) {
    items.push({
      ...common,
      amount: rules.homework?.coinAmount ?? DEFAULT_HOMEWORK_COIN,
      direction: CoinDirection.earn,
      sourceType: SourceType.homework,
      note: `Uy vazifasini bajargani uchun bonus (${sessionLabel})`,
      ruleId: rules.homework?.id,
    });
  }

  // Sababsiz kelmaganlarga jarima (faqat qoida bo'lsa). Sababli (excused) — hech narsa
  if (status === AttendanceStatus.absent && rules.absence) {
    items.push({
      ...common,
      amount: rules.absence.coinAmount,
      direction: CoinDirection.deduct,
      sourceType: SourceType.attendance,
      note: `Darsga sababsiz kelmagani uchun jarima (${sessionLabel})`,
      ruleId: rules.absence.id,
    });
  }

  return items;
}
