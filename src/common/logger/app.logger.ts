import { ConsoleLogger, ConsoleLoggerOptions, LogLevel } from '@nestjs/common';
import { getRequestContext } from '../context/request-context';

/**
 * Har bir log qatoriga joriy so'rov ID'si qo'shiladi (so'rov ichida bo'lsa).
 * Production'da JSON format (`{ level, timestamp, context, message, requestId }`) —
 * log yig'uvchi (Loki, ELK, CloudWatch) uchun; dev'da odatdagi rangli matn.
 */
export class AppLogger extends ConsoleLogger {
  constructor(options: ConsoleLoggerOptions = {}) {
    super(options);
  }

  protected formatContext(context: string): string {
    const base = super.formatContext(context);
    const { requestId } = getRequestContext();
    return requestId ? `${base}[req ${requestId}] ` : base;
  }

  protected getJsonLogObject(
    message: unknown,
    options: {
      context: string;
      logLevel: LogLevel;
      writeStreamType?: 'stdout' | 'stderr';
      errorStack?: unknown;
    },
  ) {
    const { requestId } = getRequestContext();
    return {
      ...super.getJsonLogObject(message, options),
      ...(requestId ? { requestId } : {}),
    };
  }
}
