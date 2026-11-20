import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// Proxy/klient yuborgan ID faqat xavfsiz formatda qabul qilinadi (logga inyeksiya bo'lmasin)
const INCOMING_ID_REGEX = /^[A-Za-z0-9_-]{8,64}$/;

export type RequestWithId = Request & { id?: string };

export function resolveRequestId(incoming: unknown): string {
  return typeof incoming === 'string' && INCOMING_ID_REGEX.test(incoming)
    ? incoming
    : randomUUID();
}

/**
 * Har bir so'rovga ID: nginx/klient `X-Request-Id` yuborsa — o'sha, aks holda yangi UUID.
 * Javob header'ida qaytadi, xato javoblarida (`requestId`) va loglarda ko'rinadi —
 * foydalanuvchi xatoni xabar qilganda logdan aniq topiladi.
 * Guard'lardan oldin ishlaydi (401/403 javoblarida ham ID bor).
 */
export function requestIdMiddleware(
  req: RequestWithId,
  res: Response,
  next: NextFunction,
): void {
  const id = resolveRequestId(req.headers[REQUEST_ID_HEADER.toLowerCase()]);
  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
