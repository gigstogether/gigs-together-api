export type SupportedImageContentType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/avif'
  | 'image/heic'
  | 'image/heif';

export type SupportedImageExtension =
  'jpg' | 'png' | 'webp' | 'avif' | 'heic' | 'heif';

export interface SupportedImageFileType {
  contentType: SupportedImageContentType;
  extension: SupportedImageExtension;
}

const JPEG_FILE_TYPE: SupportedImageFileType = {
  contentType: 'image/jpeg',
  extension: 'jpg',
};
const PNG_FILE_TYPE: SupportedImageFileType = {
  contentType: 'image/png',
  extension: 'png',
};
const WEBP_FILE_TYPE: SupportedImageFileType = {
  contentType: 'image/webp',
  extension: 'webp',
};
const AVIF_FILE_TYPE: SupportedImageFileType = {
  contentType: 'image/avif',
  extension: 'avif',
};
const HEIC_FILE_TYPE: SupportedImageFileType = {
  contentType: 'image/heic',
  extension: 'heic',
};
const HEIF_FILE_TYPE: SupportedImageFileType = {
  contentType: 'image/heif',
  extension: 'heif',
};

const AVIF_BRANDS = new Set(['avif', 'avis']);
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis']);
const HEIF_BRANDS = new Set(['mif1', 'msf1']);

function hasSignature(
  buffer: Buffer,
  signature: readonly number[],
  offset = 0,
): boolean {
  if (buffer.length < offset + signature.length) {
    return false;
  }
  return signature.every((byte, index) => buffer[offset + index] === byte);
}

function getIsoBaseMediaBrands(buffer: Buffer): string[] | undefined {
  const minimumFtypBoxSize = 16;
  if (
    buffer.length < minimumFtypBoxSize ||
    buffer.toString('ascii', 4, 8) !== 'ftyp'
  ) {
    return;
  }

  const boxSize = buffer.readUInt32BE(0);
  if (
    boxSize < minimumFtypBoxSize ||
    boxSize > buffer.length ||
    (boxSize - minimumFtypBoxSize) % 4 !== 0
  ) {
    return;
  }

  const brands = [buffer.toString('ascii', 8, 12)];
  for (let offset = minimumFtypBoxSize; offset < boxSize; offset += 4) {
    brands.push(buffer.toString('ascii', offset, offset + 4));
  }
  return brands;
}

export function detectSupportedImageFileType(
  buffer: Buffer,
): SupportedImageFileType | undefined {
  if (hasSignature(buffer, [0xff, 0xd8, 0xff])) {
    return { ...JPEG_FILE_TYPE };
  }
  if (hasSignature(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ...PNG_FILE_TYPE };
  }
  if (
    hasSignature(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    hasSignature(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { ...WEBP_FILE_TYPE };
  }

  const isoBaseMediaBrands = getIsoBaseMediaBrands(buffer);
  if (isoBaseMediaBrands?.some((brand) => AVIF_BRANDS.has(brand))) {
    return { ...AVIF_FILE_TYPE };
  }
  if (isoBaseMediaBrands?.some((brand) => HEIC_BRANDS.has(brand))) {
    return { ...HEIC_FILE_TYPE };
  }
  if (isoBaseMediaBrands?.some((brand) => HEIF_BRANDS.has(brand))) {
    return { ...HEIF_FILE_TYPE };
  }
}

export function getSupportedImageExtension(
  contentType: SupportedImageContentType,
): SupportedImageExtension {
  switch (contentType) {
    case 'image/jpeg':
      return JPEG_FILE_TYPE.extension;
    case 'image/png':
      return PNG_FILE_TYPE.extension;
    case 'image/webp':
      return WEBP_FILE_TYPE.extension;
    case 'image/avif':
      return AVIF_FILE_TYPE.extension;
    case 'image/heic':
      return HEIC_FILE_TYPE.extension;
    case 'image/heif':
      return HEIF_FILE_TYPE.extension;
  }
}
