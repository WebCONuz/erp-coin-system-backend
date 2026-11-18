import { BadRequestException } from '@nestjs/common';
import { detectImageExtension, saveImage } from './image-upload';

const bytes = (...b: number[]) => Buffer.from(b);

describe('detectImageExtension', () => {
  it('JPEG', () => {
    expect(detectImageExtension(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe(
      'jpg',
    );
  });

  it('PNG', () => {
    expect(
      detectImageExtension(
        bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00),
      ),
    ).toBe('png');
  });

  it('GIF', () => {
    expect(detectImageExtension(Buffer.from('GIF89a....'))).toBe('gif');
  });

  it('WebP', () => {
    const buf = Buffer.concat([
      Buffer.from('RIFF'),
      bytes(0, 0, 0, 0),
      Buffer.from('WEBPVP8 '),
    ]);
    expect(detectImageExtension(buf)).toBe('webp');
  });

  it.each([
    ['HTML', '<html><script>alert(1)</script></html>'],
    ['SVG', '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'],
    ["bo'sh", ''],
    ['matn', 'hello world'],
  ])('%s — rasm emas', (_name, content) => {
    expect(detectImageExtension(Buffer.from(content))).toBeNull();
  });
});

describe('saveImage', () => {
  it('rasm emas fayl diskka yozilmasdan rad etiladi', async () => {
    const file = {
      buffer: Buffer.from('<html>evil</html>'),
      mimetype: 'image/png', // klient yolg'on mimetype yuborgan
      originalname: 'avatar.png',
    } as Express.Multer.File;

    await expect(saveImage(file, 'avatars')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
