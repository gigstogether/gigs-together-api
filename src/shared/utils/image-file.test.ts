import {
  detectSupportedImageFileType,
  getSupportedImageExtension,
} from './image-file';
import type {
  SupportedImageContentType,
  SupportedImageExtension,
} from './image-file';

function createIsoBaseMediaFile(
  majorBrand: string,
  compatibleBrands: string[] = [],
): Buffer {
  const boxSize = 16 + compatibleBrands.length * 4;
  const buffer = Buffer.alloc(boxSize);
  buffer.writeUInt32BE(boxSize, 0);
  buffer.write('ftyp', 4, 'ascii');
  buffer.write(majorBrand, 8, 'ascii');
  compatibleBrands.forEach((brand, index) => {
    buffer.write(brand, 16 + index * 4, 'ascii');
  });
  return buffer;
}

describe('detectSupportedImageFileType', () => {
  it.each([
    {
      name: 'JPEG',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
      expected: { contentType: 'image/jpeg', extension: 'jpg' },
    },
    {
      name: 'PNG',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      expected: { contentType: 'image/png', extension: 'png' },
    },
    {
      name: 'WebP',
      buffer: Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]),
      expected: { contentType: 'image/webp', extension: 'webp' },
    },
    {
      name: 'AVIF',
      buffer: createIsoBaseMediaFile('avif', ['mif1']),
      expected: { contentType: 'image/avif', extension: 'avif' },
    },
    {
      name: 'HEIC',
      buffer: createIsoBaseMediaFile('mif1', ['heic']),
      expected: { contentType: 'image/heic', extension: 'heic' },
    },
    {
      name: 'HEIF',
      buffer: createIsoBaseMediaFile('mif1'),
      expected: { contentType: 'image/heif', extension: 'heif' },
    },
  ])('should detect $name bytes', ({ buffer, expected }) => {
    expect(detectSupportedImageFileType(buffer)).toEqual(expected);
  });

  it('should reject bytes without a supported image signature', () => {
    expect(
      detectSupportedImageFileType(Buffer.from('not an image')),
    ).toBeUndefined();
  });

  it('should reject GIF bytes', () => {
    expect(
      detectSupportedImageFileType(
        Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
      ),
    ).toBeUndefined();
  });
});

describe('getSupportedImageExtension', () => {
  const cases: Array<[SupportedImageContentType, SupportedImageExtension]> = [
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/avif', 'avif'],
    ['image/heic', 'heic'],
    ['image/heif', 'heif'],
  ];

  it.each(cases)(
    'should map %s to its canonical extension',
    (contentType, extension) => {
      expect(getSupportedImageExtension(contentType)).toBe(extension);
    },
  );
});
