import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join, relative, resolve, sep } from 'path';

// Yuklangan fayllar shu papkadan `/uploads` orqali statik beriladi (main.ts)
export const UPLOADS_ROOT = join(process.cwd(), 'uploads');

export const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB

const ALLOWED_MIME = /^image\/(jpeg|png|webp|gif)$/;

// Faylning haqiqiy turi birinchi baytlari (magic bytes) bo'yicha aniqlanadi —
// klient yuborgan mimetype va fayl nomiga ishonilmaydi (aks holda .html/.svg
// faylni rasm deb yuklab, API domenida XSS qilish mumkin edi)
export function detectImageExtension(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return 'jpg';
  if (
    buf.length >= 8 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'png';
  if (buf.length >= 6) {
    const head = buf.subarray(0, 6).toString('ascii');
    if (head === 'GIF87a' || head === 'GIF89a') return 'gif';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'webp';
  return null;
}

// Multer `fileFilter` — birinchi (arzon) filtr; asosiy tekshiruv saveImage ichida
export function imageMimeFilter(
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
): void {
  if (!ALLOWED_MIME.test(file.mimetype)) {
    cb(
      new BadRequestException('Faqat JPEG, PNG, WebP yoki GIF ruxsat etilgan'),
      false,
    );
    return;
  }
  cb(null, true);
}

/**
 * Xotiradagi (memoryStorage) rasmni tekshirib, `uploads/<subdir>/<uuid>.<ext>` ga
 * yozadi va ommaviy URL qaytaradi. Kengaytma faqat aniqlangan turdan olinadi.
 */
export async function saveImage(
  file: Express.Multer.File,
  subdir: string,
): Promise<string> {
  const ext = detectImageExtension(file.buffer);
  if (!ext) {
    throw new BadRequestException(
      "Fayl rasm emas yoki formati qo'llab-quvvatlanmaydi (JPEG, PNG, WebP, GIF)",
    );
  }

  const dir = join(UPLOADS_ROOT, subdir);
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${ext}`;
  await writeFile(join(dir, filename), file.buffer);

  return `/uploads/${subdir}/${filename}`;
}

/**
 * `/uploads/...` URL'idan diskdagi yo'l — faqat UPLOADS_ROOT ichida bo'lsa (`..` bilan
 * tashqariga chiqish, tashqi https URL yoki boshqa qiymat — null).
 */
export function uploadedFilePath(
  url: string | null | undefined,
): string | null {
  if (!url || !url.startsWith('/uploads/')) return null;
  const path = resolve(UPLOADS_ROOT, url.slice('/uploads/'.length));
  const rel = relative(UPLOADS_ROOT, path);
  if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`)) return null;
  return path;
}

// Faylni o'chirish (yo'q bo'lsa — xato emas). Chaqiruvchi fayl boshqa joyda ishlatilmasligini tekshiradi
export async function removeUploadedFile(url: string): Promise<boolean> {
  const path = uploadedFilePath(url);
  if (!path) return false;
  try {
    await unlink(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}
