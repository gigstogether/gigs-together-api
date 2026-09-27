import type { TGPhotoSize } from '../types/message.types';

export function getBiggestTgPhotoFileId(
  photos: TGPhotoSize[] | undefined,
): string | undefined {
  let best: TGPhotoSize | undefined;

  for (const cur of photos ?? []) {
    if (!best) {
      best = cur;
      continue;
    }

    const bestSize = best.file_size;
    const curSize = cur.file_size;

    // Prefer the variant with the largest file_size (when available).
    if (typeof bestSize === 'number' && typeof curSize === 'number') {
      if (curSize > bestSize) best = cur;
      continue;
    }
    if (typeof curSize === 'number' && typeof bestSize !== 'number') {
      best = cur;
      continue;
    }
    if (typeof bestSize === 'number' && typeof curSize !== 'number') {
      continue;
    }

    // Fallback: compare by area (width * height).
    const bestArea = best.width * best.height;
    const curArea = cur.width * cur.height;
    if (curArea > bestArea) best = cur;
  }

  return best?.file_id;
}
