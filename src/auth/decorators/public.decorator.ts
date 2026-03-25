import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Ishlatish: @Public() — token tekshirilmaydi
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
