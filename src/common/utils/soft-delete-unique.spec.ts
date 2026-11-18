import { archivedName } from './soft-delete-unique';

describe('archivedName', () => {
  const id = '3f2c1a9e-7b1d-4c2e-9a77-5d0e8b3c1f42';

  it("nomga id bo'yicha noyob qo'shimcha qo'shadi", () => {
    expect(archivedName('Matematika', id, 150)).toBe(
      "Matematika [o'chirilgan 3f2c1a9e]",
    );
  });

  it('ustun uzunligidan oshmaydi (uzun nom qisqartiriladi)', () => {
    const result = archivedName('x'.repeat(200), id, 100);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.endsWith("[o'chirilgan 3f2c1a9e]")).toBe(true);
  });

  it('turli yozuvlar uchun turli nom (unique buzilmaydi)', () => {
    const other = 'a1b2c3d4-0000-0000-0000-000000000000';
    expect(archivedName('Fizika', id, 150)).not.toBe(
      archivedName('Fizika', other, 150),
    );
  });
});
