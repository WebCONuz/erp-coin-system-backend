import { escapeHtml, escapeHtmlMultiline, toSingleLine } from './html-escape';

describe('escapeHtml', () => {
  it('HTML maxsus belgilarini escape qiladi', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('oddiy matnni o`zgartirmaydi', () => {
    expect(escapeHtml('Salom, Ali! Ertaga dars 09:00 da')).toBe(
      'Salom, Ali! Ertaga dars 09:00 da',
    );
  });
});

describe('escapeHtmlMultiline', () => {
  it('avval escape, keyin qator ko`chishini <br> qiladi', () => {
    expect(escapeHtmlMultiline('1-qator\r\n<b>2</b>\n3')).toBe(
      '1-qator<br>&lt;b&gt;2&lt;/b&gt;<br>3',
    );
  });
});

describe('toSingleLine', () => {
  it('sarlavhadagi qator ko`chishlarini olib tashlaydi', () => {
    expect(toSingleLine('Ali\r\nBcc: x@y.z ')).toBe('Ali Bcc: x@y.z');
  });
});
