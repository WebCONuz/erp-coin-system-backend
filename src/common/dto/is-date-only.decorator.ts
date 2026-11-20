import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, ValidateBy } from 'class-validator';
import {
  isValidDateOnly,
  normalizeDateOnly,
} from 'src/common/utils/tenant-time';

/**
 * Kalendar sana maydoni (`@db.Date`): 'YYYY-MM-DD'. Eski klientlar uchun to'liq ISO satr ham
 * qabul qilinadi, lekin faqat sana qismi olinadi — servisga doim 'YYYY-MM-DD' keladi.
 */
export function IsDateOnly() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => normalizeDateOnly(value)),
    IsString(),
    ValidateBy({
      name: 'isDateOnly',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && isValidDateOnly(value),
        defaultMessage: () =>
          "Sana formati YYYY-MM-DD bo'lishi kerak (masalan 2026-11-20)",
      },
    }),
  );
}
