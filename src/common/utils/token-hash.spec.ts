import { generateOpaqueToken, hashToken } from './token-hash';

describe('hashToken', () => {
  it('64 belgili hex sha256 qaytaradi va deterministik', () => {
    const h = hashToken('abc');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('abc')).toBe(h);
  });

  it('faqat oxiri farq qiladigan uzun tokenlar turli hash beradi (bcrypt 72 bayt muammosi yo`q)', () => {
    const prefix = 'x'.repeat(100);
    expect(hashToken(`${prefix}a`)).not.toBe(hashToken(`${prefix}b`));
  });
});

describe('generateOpaqueToken', () => {
  it('har safar yangi hex token', () => {
    const a = generateOpaqueToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(generateOpaqueToken()).not.toBe(a);
  });
});
