/**
 * Soft delete + unique nom muammosi: `@@unique([tenantId, name])` o'chirilgan yozuvni ham hisobga
 * oladi, shuning uchun o'chirilgan "Matematika" yangi "Matematika" yaratishni bloklardi.
 * Partial unique index (WHERE is_deleted = false) Prisma sxemasida ifodalanmaydi va
 * `migrate dev` uni o'chirib yuboradi — shuning uchun nomni o'chirilgan yozuvdan bo'shatamiz:
 * o'chirilgan yozuv nomiga noyob qo'shimcha qo'shiladi (u baribir hech qayerda ko'rinmaydi).
 */
export function archivedName(
  name: string,
  id: string,
  maxLength: number,
): string {
  const suffix = ` [o'chirilgan ${id.slice(0, 8)}]`;
  return name.slice(0, Math.max(0, maxLength - suffix.length)) + suffix;
}
