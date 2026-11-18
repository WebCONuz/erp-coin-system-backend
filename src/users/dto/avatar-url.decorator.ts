import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength } from 'class-validator';

// Avatar faqat o'zimiz yuklagan fayl (`/uploads/avatars/<fayl>`) yoki tashqi https rasm bo'lishi mumkin.
// `javascript:`, `data:`, `http:` va boshqa sxemalar rad etiladi.
export const AVATAR_URL_PATTERN =
  /^(\/uploads\/avatars\/[A-Za-z0-9._-]+|https:\/\/[^\s"'<>]+)$/;

export function IsAvatarUrl() {
  return applyDecorators(
    IsString(),
    MaxLength(500),
    Matches(AVATAR_URL_PATTERN, {
      message:
        "avatarUrl '/uploads/avatars/...' (yuklangan fayl) yoki 'https://...' bo'lishi kerak",
    }),
  );
}
