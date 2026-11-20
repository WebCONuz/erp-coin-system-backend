import {
  decideExistingKey,
  hashIdempotentRequest,
  IDEMPOTENCY_KEY_REGEX,
  stableStringify,
} from './idempotency';

describe('stableStringify', () => {
  it('kalitlar tartibi natijaga ta`sir qilmaydi, undefined tashlab yuboriladi', () => {
    expect(
      stableStringify({ b: 1, a: { d: [1, 2], c: null }, x: undefined }),
    ).toBe('{"a":{"c":null,"d":[1,2]},"b":1}');
    expect(stableStringify({ a: 1, b: 2 })).toBe(
      stableStringify({ b: 2, a: 1 }),
    );
  });
});

describe('hashIdempotentRequest', () => {
  const body = { studentId: 's1', amount: 5 };

  it('bir xil so`rov — bir xil hash', () => {
    expect(hashIdempotentRequest('post', '/api/x', body)).toBe(
      hashIdempotentRequest('POST', '/api/x', { amount: 5, studentId: 's1' }),
    );
  });

  it('body yoki URL farq qilsa — boshqa hash', () => {
    const base = hashIdempotentRequest('POST', '/api/x', body);
    expect(
      hashIdempotentRequest('POST', '/api/x', { ...body, amount: 6 }),
    ).not.toBe(base);
    expect(hashIdempotentRequest('POST', '/api/x?tenantId=t2', body)).not.toBe(
      base,
    );
  });
});

describe('IDEMPOTENCY_KEY_REGEX', () => {
  it.each(['3f2c1a9e-7b1d-4c2e-9a77-5d0e8b3c1f42', 'abcDEF_12'])(
    'qabul qiladi: %s',
    (v) => expect(IDEMPOTENCY_KEY_REGEX.test(v)).toBe(true),
  );
  it.each(['short', 'has space here', 'x'.repeat(101), 'a/b/c/d/e'])(
    'rad etadi: %s',
    (v) => expect(IDEMPOTENCY_KEY_REGEX.test(v)).toBe(false),
  );
});

describe('decideExistingKey', () => {
  it('tugagan so`rov — saqlangan javob qaytariladi', () => {
    expect(
      decideExistingKey(
        { requestHash: 'h', statusCode: 201, response: { ok: 1 } },
        'h',
      ),
    ).toEqual({ kind: 'replay', statusCode: 201, response: { ok: 1 } });
  });

  it('hali bajarilmoqda — in_progress', () => {
    expect(
      decideExistingKey(
        { requestHash: 'h', statusCode: null, response: null },
        'h',
      ),
    ).toEqual({ kind: 'in_progress' });
  });

  it('boshqa mazmundagi so`rov — reused (holatidan qat`i nazar)', () => {
    expect(
      decideExistingKey(
        { requestHash: 'h', statusCode: 201, response: {} },
        'x',
      ),
    ).toEqual({ kind: 'reused' });
  });
});
