import { AVATAR_URL_PATTERN } from './avatar-url.decorator';

describe('AVATAR_URL_PATTERN', () => {
  it.each([
    '/uploads/avatars/3f2c1a9e-7b1d-4c2e-9a77-5d0e8b3c1f42.png',
    '/uploads/avatars/photo_1.jpg',
    'https://cdn.example.com/u/1.webp',
  ])('qabul qiladi: %s', (v) => expect(AVATAR_URL_PATTERN.test(v)).toBe(true));

  it.each([
    'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'http://example.com/a.png', // https emas
    '/uploads/avatars/../../etc/passwd',
    '/uploads/other/a.png',
    'https://evil.com/"onerror="alert(1)',
  ])('rad etadi: %s', (v) => expect(AVATAR_URL_PATTERN.test(v)).toBe(false));
});
