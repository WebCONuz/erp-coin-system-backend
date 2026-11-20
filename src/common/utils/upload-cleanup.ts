import { Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { removeUploadedFile, uploadedFilePath } from './image-upload';

const logger = new Logger('UploadCleanup');

/**
 * Almashtirilgan rasm faylini diskdan o'chiradi — faqat u boshqa hech qayerda (user avatari,
 * sovg'a rasmi) ishlatilmasa: user `avatarUrl` ga boshqa userning faylini yozib qo'yib,
 * keyin o'zinikini almashtirish orqali begona faylni o'chira olmasin.
 * Yozuv yangilangandan **keyin** chaqiriladi. Best-effort: xato amalni buzmaydi, faqat logga.
 */
export async function releaseUnusedUpload(
  prisma: PrismaService,
  url: string | null | undefined,
): Promise<void> {
  if (!url || !uploadedFilePath(url)) return;
  try {
    const [users, rewards] = await Promise.all([
      prisma.user.count({ where: { avatarUrl: url } }),
      prisma.reward.count({ where: { imageUrl: url } }),
    ]);
    if (users + rewards > 0) return;
    await removeUploadedFile(url);
  } catch (err) {
    logger.error(
      `Eski fayl o'chirilmadi (${url}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
