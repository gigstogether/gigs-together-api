import {
  detectSupportedImageFileType,
  getSupportedImageExtension,
} from './image-file';

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
  it('should map a supported content type to its canonical extension', () => {
    expect(getSupportedImageExtension('image/jpeg')).toBe('jpg');
  });
});
