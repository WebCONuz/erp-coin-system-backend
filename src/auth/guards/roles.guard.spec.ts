import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function contextFor(user?: { roleLevel: number }): ExecutionContext {
  return {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardFor(roles?: string[]) {
  const reflector = {
    getAllAndOverride: () => roles,
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it("rol talab qilinmasa hamma o'tadi", () => {
    expect(guardFor(undefined).canActivate(contextFor({ roleLevel: 20 }))).toBe(
      true,
    );
  });

  it.each([
    ['admin', 60],
    ['super_admin', 90],
    ['creator', 100],
  ])('admin endpointiga %s (%i) kira oladi', (_name, level) => {
    expect(
      guardFor(['admin', 'super_admin']).canActivate(
        contextFor({ roleLevel: level }),
      ),
    ).toBe(true);
  });

  it.each([
    ['teacher', 40],
    ['student', 20],
  ])('admin endpointiga %s (%i) — 403', (_name, level) => {
    expect(() =>
      guardFor(['admin', 'super_admin']).canActivate(
        contextFor({ roleLevel: level }),
      ),
    ).toThrow(ForbiddenException);
  });

  it("eng past talab qilingan daraja hisoblanadi (teacher yo'li)", () => {
    const guard = guardFor(['admin', 'super_admin', 'teacher']);
    expect(guard.canActivate(contextFor({ roleLevel: 40 }))).toBe(true);
    expect(() => guard.canActivate(contextFor({ roleLevel: 20 }))).toThrow(
      ForbiddenException,
    );
  });

  it("faqat super_admin yo'liga admin kira olmaydi", () => {
    expect(() =>
      guardFor(['super_admin']).canActivate(contextFor({ roleLevel: 60 })),
    ).toThrow(ForbiddenException);
  });

  it("noma'lum rol nomi — ruxsat yo'q (xavfsiz tomonga)", () => {
    expect(
      guardFor(['ghost']).canActivate(contextFor({ roleLevel: 100 })),
    ).toBe(false);
  });

  it("user yo'q — ruxsat yo'q", () => {
    expect(guardFor(['admin']).canActivate(contextFor(undefined))).toBe(false);
  });
});
