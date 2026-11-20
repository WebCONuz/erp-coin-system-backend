import {
  classifyRefreshToken,
  REFRESH_GRACE_MS,
  RefreshSessionState,
} from './refresh-session';

const now = new Date('2026-11-20T10:00:00Z');
const session = (over: Partial<RefreshSessionState> = {}) => ({
  tokenHash: 'cur',
  previousTokenHash: 'prev',
  rotatedAt: new Date(now.getTime() - 5_000),
  expiresAt: new Date(now.getTime() + 60_000),
  ...over,
});

describe('classifyRefreshToken', () => {
  it('joriy token — current', () => {
    expect(classifyRefreshToken(session(), 'cur', now)).toBe('current');
  });

  it('muhlat ichidagi oldingi token — grace (parallel tab)', () => {
    expect(classifyRefreshToken(session(), 'prev', now)).toBe('grace');
  });

  it('muhlatdan keyin oldingi token — reuse', () => {
    const s = session({
      rotatedAt: new Date(now.getTime() - REFRESH_GRACE_MS - 1),
    });
    expect(classifyRefreshToken(s, 'prev', now)).toBe('reuse');
  });

  it('notanish token — reuse', () => {
    expect(classifyRefreshToken(session(), 'other', now)).toBe('reuse');
  });

  it('muddati tugagan sessiya — expired (joriy token bo`lsa ham)', () => {
    const s = session({ expiresAt: now });
    expect(classifyRefreshToken(s, 'cur', now)).toBe('expired');
  });

  it('hech qachon aylantirilmagan sessiyada oldingi token yo`q', () => {
    const s = session({ previousTokenHash: null, rotatedAt: null });
    expect(classifyRefreshToken(s, 'prev', now)).toBe('reuse');
  });
});
