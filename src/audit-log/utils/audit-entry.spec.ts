import { AuditActionType } from 'src/generated/prisma/enums';
import { AUDIT_ENTITY, buildAuditData, definedFields } from './audit-entry';

describe('buildAuditData', () => {
  const entry = {
    tenantId: 't1',
    actorId: 'u1',
    action: AuditActionType.coin_transaction,
    entityType: AUDIT_ENTITY.coinTransaction,
    entityId: 'e1',
    changes: { amount: 5 },
    description: 'x'.repeat(600),
  };

  it('maydonlarni AuditLog ustunlariga moslaydi va uzunlikni kesadi', () => {
    const data = buildAuditData(entry, {
      ipAddress: '1'.repeat(80),
      userAgent: 'Mozilla',
    });
    expect(data).toMatchObject({
      tenantId: 't1',
      createdBy: 'u1',
      actionType: 'coin_transaction',
      entityType: 'CoinTransaction',
      entityId: 'e1',
      changes: { amount: 5 },
      userAgent: 'Mozilla',
    });
    expect(data.description).toHaveLength(500);
    expect(data.ipAddress).toHaveLength(50);
  });

  it("so'rov konteksti bo'lmasa IP va user-agent null", () => {
    const data = buildAuditData(entry, {});
    expect(data.ipAddress).toBeNull();
    expect(data.userAgent).toBeNull();
  });
});

describe('definedFields', () => {
  it('undefined va olib tashlanadigan maydonlarni chiqaradi', () => {
    expect(
      definedFields({ a: 1, b: undefined, c: null, password: 'x' }, [
        'password',
      ]),
    ).toEqual({ a: 1, c: null });
  });
});
