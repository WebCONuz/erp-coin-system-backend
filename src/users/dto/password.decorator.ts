import { applyDecorators } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../constants/password';

// Yangi o'rnatiladigan parol (user yaratish, parolni o'zgartirish/tiklash)
export function IsNewPassword() {
  return applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH, {
      message: `Parol kamida ${PASSWORD_MIN_LENGTH} belgidan iborat bo'lishi kerak`,
    }),
    MaxLength(PASSWORD_MAX_LENGTH, {
      message: `Parol ${PASSWORD_MAX_LENGTH} belgidan oshmasligi kerak`,
    }),
  );
}
