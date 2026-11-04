export type SupportedImageContentType =
  'image/jpeg' | 'image/png' | 'image/webp';

export type SupportedImageExtension = 'jpg' | 'png' | 'webp';

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
  }
}
