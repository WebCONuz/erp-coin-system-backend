import { AsyncLocalStorage } from 'async_hooks';

// So'rov davomida chuqur servislarga argument sifatida uzatmasdan kerak bo'ladigan
// ma'lumotlar (audit log uchun IP va user-agent)
export interface RequestContextStore {
  // Loglarda va xato javoblarida (requestIdMiddleware)
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContextStore>();

// So'rovdan tashqarida (seed, test, fon vazifa) — bo'sh obyekt
export function getRequestContext(): RequestContextStore {
  return requestContext.getStore() ?? {};
}
