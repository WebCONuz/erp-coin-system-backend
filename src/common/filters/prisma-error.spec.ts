import { HttpStatus } from '@nestjs/common';
import { mapPrismaKnownError, uniqueFields } from './prisma-error';

describe('uniqueFields', () => {
  it('klassik target va driver adapter formatini o`qiydi', () => {
    expect(uniqueFields({ target: ['tenantId', 'phone'] })).toEqual([
      'tenantId',
      'phone',
    ]);
    expect(
      uniqueFields({
        driverAdapterError: { cause: { constraint: { fields: ['username'] } } },
      }),
    ).toEqual(['username']);
    expect(uniqueFields({ target: 'users_username_key' })).toEqual([]);
    expect(uniqueFields(undefined)).toEqual([]);
  });
});

describe('mapPrismaKnownError', () => {
  it('P2002 — tushunarli maydon nomi, texnik maydon (tenantId) ko`rsatilmaydi', () => {
    expect(
      mapPrismaKnownError('P2002', { target: ['tenantId', 'phone'] }),
    ).toEqual({
      status: HttpStatus.CONFLICT,
      message: 'Telefon raqam allaqachon mavjud',
      code: 'DUPLICATE_VALUE',
      fields: ['phone'],
    });
  });

  it("P2002 — noma'lum maydon nomi oshkor qilinmaydi", () => {
    const mapped = mapPrismaKnownError('P2002', { target: ['secret_column'] });
    expect(mapped.message).toBe('Bu qiymat allaqachon mavjud');
    expect(mapped.fields).toBeUndefined();
  });

  it.each([
    ['P2025', HttpStatus.NOT_FOUND],
    ['P2003', HttpStatus.CONFLICT],
    ['P2000', HttpStatus.BAD_REQUEST],
    ['P2034', HttpStatus.CONFLICT],
    ['P2024', HttpStatus.SERVICE_UNAVAILABLE],
    ['P9999', HttpStatus.BAD_REQUEST],
  ])('%s → %s', (code, status) => {
    expect(mapPrismaKnownError(code, {}).status).toBe(status);
  });
});
