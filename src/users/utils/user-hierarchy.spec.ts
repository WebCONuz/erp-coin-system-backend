import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { assertCanManageUser, UserManager } from './user-hierarchy';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const manager = (role: string, roleLevel: number, tenantId = TENANT_A) =>
  ({ id: `${role}-id`, role, roleLevel, tenantId }) satisfies UserManager;

const target = (level: number, tenantId = TENANT_A) => ({
  id: 'target-id',
  tenantId,
  role: { level },
});

describe('assertCanManageUser', () => {
  it("admin o'z tenantidagi teacher/studentni boshqaradi", () => {
    expect(() =>
      assertCanManageUser(manager('admin', 60), target(40)),
    ).not.toThrow();
    expect(() =>
      assertCanManageUser(manager('admin', 60), target(20)),
    ).not.toThrow();
  });

  it('admin boshqa adminni boshqara olmaydi', () => {
    expect(() => assertCanManageUser(manager('admin', 60), target(60))).toThrow(
      ForbiddenException,
    );
  });

  it('admin super_admin/creatorni boshqara olmaydi', () => {
    expect(() => assertCanManageUser(manager('admin', 60), target(90))).toThrow(
      ForbiddenException,
    );
    expect(() =>
      assertCanManageUser(manager('admin', 60), target(100)),
    ).toThrow(ForbiddenException);
  });

  it('admin boshqa tenant userini "topilmadi" deb ko\'radi', () => {
    expect(() =>
      assertCanManageUser(manager('admin', 60), target(20, TENANT_B)),
    ).toThrow(NotFoundException);
  });

  it('super_admin istalgan tenantdagi past darajadagi userni boshqaradi', () => {
    expect(() =>
      assertCanManageUser(manager('super_admin', 90), target(60, TENANT_B)),
    ).not.toThrow();
  });

  it('super_admin creatorni boshqara olmaydi', () => {
    expect(() =>
      assertCanManageUser(manager('super_admin', 90), target(100, TENANT_B)),
    ).toThrow(ForbiddenException);
  });

  it('teacher hech kimni boshqara olmaydi (student ham)', () => {
    expect(() =>
      assertCanManageUser(manager('teacher', 40), target(20)),
    ).toThrow(ForbiddenException);
  });
});
