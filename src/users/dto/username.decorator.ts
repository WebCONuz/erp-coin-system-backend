import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { normalizeUsername, USERNAME_REGEX } from '../constants/username';

export function IsUsername() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? normalizeUsername(value) : value,
    ),
    IsString(),
    Matches(USERNAME_REGEX, {
      message:
        "Username 3–30 belgidan iborat bo'lishi va faqat lotin harflari, raqamlar, '_' va '.' dan tashkil topishi kerak",
    }),
  );
}
