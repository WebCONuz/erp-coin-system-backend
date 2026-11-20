import { validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'dev-access',
  JWT_REFRESH_SECRET: 'dev-refresh',
};

const prodSecrets = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('minimal dev konfiguratsiya — o`tadi, raqamlar number ga keltiriladi', () => {
    const env = validateEnv({ ...base, PORT: '3031', DB_POOL_MAX: '20' });
    expect(env.PORT).toBe(3031);
    expect(env.DB_POOL_MAX).toBe(20);
    expect(env.NODE_ENV).toBe('development');
  });

  it("ro'yxatda bo'lmagan o'zgaruvchilar saqlanadi (CREATOR_* va h.k.)", () => {
    const env = validateEnv({ ...base, CREATOR_USERNAME: 'creator' });
    expect((env as unknown as Record<string, unknown>).CREATOR_USERNAME).toBe(
      'creator',
    );
  });

  it("DATABASE_URL yoki JWT kaliti yo'q — barcha xatolar bitta xabarda", () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: 'x' })).toThrow(
      /DATABASE_URL[\s\S]*JWT_REFRESH_SECRET/,
    );
  });

  it('noto`g`ri raqam — xato', () => {
    expect(() => validateEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('production: FRONTEND_DOMEN majburiy, qisqa yoki bir xil kalitlar rad etiladi', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /FRONTEND_DOMEN[\s\S]*JWT_ACCESS_SECRET/,
    );
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        FRONTEND_DOMEN: 'https://app.example.uz',
        JWT_ACCESS_SECRET: 'c'.repeat(32),
        JWT_REFRESH_SECRET: 'c'.repeat(32),
      }),
    ).toThrow(/bir xil/);
  });

  it("production — to'g'ri konfiguratsiya o'tadi", () => {
    expect(() =>
      validateEnv({
        ...base,
        ...prodSecrets,
        NODE_ENV: 'production',
        FRONTEND_DOMEN: 'https://app.example.uz',
      }),
    ).not.toThrow();
  });
});
