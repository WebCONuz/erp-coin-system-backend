import { Request } from 'express';

export type AuthPayloadType = {
  sub: string;
  phone: string;
  role: string;
  tenantId: string;
  roleId: string;
};

export interface RequestWithUser extends Request {
  user: AuthPayloadType;
}

export type ReqUserType = {
  id: string;
  phone: string;
  fullName: string;
  tenantId: string;
  role: string;
  roleLevel: number;
  roleId: string;
};
