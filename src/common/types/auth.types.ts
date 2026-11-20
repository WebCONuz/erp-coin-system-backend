import { Request } from 'express';

export type AuthPayloadType = {
  sub: string;
  username: string;
  phone: string;
  role: string;
  tenantId: string;
  roleId: string;
};

// Refresh token qaysi qurilma sessiyasiga tegishli (RefreshSession.id)
export type RefreshPayloadType = AuthPayloadType & { sid: string };

// Login/refresh so'rovining qurilma ma'lumoti (sessiya ro'yxatida ko'rsatish uchun)
export type ClientMeta = { userAgent?: string; ipAddress?: string };

// req.user — JwtStrategy.validate() qaytaradigan obyekt (JWT payload emas)
export interface RequestWithUser extends Request {
  user: ReqUserType;
}

export type ReqUserType = {
  id: string;
  username: string;
  phone: string;
  fullName: string;
  tenantId: string;
  role: string;
  roleLevel: number;
  roleId: string;
};
