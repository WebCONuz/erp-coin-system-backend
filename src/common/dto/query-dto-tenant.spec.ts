import 'reflect-metadata';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

// Barcha controllerlardagi `@Query()` DTO'lari `?tenantId=` ni qabul qilishi shart:
// super_admin/creator uchun @TenantContext() tenantId ni majburiy qiladi, global ValidationPipe
// esa (whitelist + forbidNonWhitelisted) DTO'da yo'q maydonni rad etadi → so'rov doim 400.
// Controllerlar avtomatik topiladi — yangi endpoint qo'shilsa ham shu test uni tekshiradi.

const SRC = join(__dirname, '..', '..');
const TENANT_ID = '3f2c1a9e-7b1d-4c2e-9a77-5d0e8b3c1f42';

function findControllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === 'generated' || name === 'node_modules') return [];
    if (statSync(full).isDirectory()) return findControllerFiles(full);
    return name.endsWith('.controller.ts') ? [full] : [];
  });
}

type Ctor = new (...args: unknown[]) => object;

function collectQueryDtos(): { route: string; dto: Ctor }[] {
  const found: { route: string; dto: Ctor }[] = [];
  for (const file of findControllerFiles(SRC)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function') continue;
      const ctrl = exported as Ctor;
      for (const method of Object.getOwnPropertyNames(ctrl.prototype)) {
        const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, ctrl, method) as
          | Record<string, { index: number; data?: unknown }>
          | undefined;
        if (!args) continue;
        const paramTypes = (Reflect.getMetadata(
          'design:paramtypes',
          ctrl.prototype as object,
          method,
        ) ?? []) as unknown[];
        for (const [key, arg] of Object.entries(args)) {
          // `@Query()` (butun query obyekti) — `@Query('name')` emas
          if (!key.startsWith(`${RouteParamtypes.QUERY}:`) || arg.data)
            continue;
          const dto = paramTypes[arg.index];
          if (typeof dto === 'function' && dto !== Object) {
            found.push({
              route: `${relative(SRC, file)} → ${method}`,
              dto: dto as Ctor,
            });
          }
        }
      }
    }
  }
  return found;
}

const queryDtos = collectQueryDtos();

describe('@Query() DTO lar — ?tenantId= (super_admin) qabul qilinadi', () => {
  it("controllerlardan query DTO'lar topildi", () => {
    expect(queryDtos.length).toBeGreaterThan(15);
  });

  it.each(queryDtos.map((q) => [q.route, q.dto] as const))(
    '%s',
    async (_route, dto) => {
      const instance = plainToInstance(dto, { tenantId: TENANT_ID });
      const errors = await validate(instance, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      expect(errors.map((e) => e.constraints)).toEqual([]);
    },
  );
});
