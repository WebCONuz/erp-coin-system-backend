const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// Foydalanuvchi kiritgan matnni HTML (email shabloni) ichiga xavfsiz qo'yish uchun
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// Ko'p qatorli matn: avval escape, keyin qator ko'chishi <br>
export function escapeHtmlMultiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

// Email sarlavhasi (Subject) uchun — qator ko'chishlari olib tashlanadi
export function toSingleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}
