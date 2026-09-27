import type { TGPhotoSize } from '../types/message.types';
import { getBiggestTgPhotoFileId } from './telegram-photo';

describe('getBiggestTgPhotoFileId', () => {
  it('returns undefined for undefined input', () => {
    expect(getBiggestTgPhotoFileId(undefined)).toBeUndefined();
  });

  it('returns undefined for empty array', () => {
    expect(getBiggestTgPhotoFileId([])).toBeUndefined();
  });

  it('picks the biggest photo by file_size (example)', () => {
    const photos: TGPhotoSize[] = [
      {
        file_id:
          'AgACAgQAAxkDAAM4aW_U_6fRFWGezC47Pkht0eY4El0AAg4Maxt-mIVTHmLGnVLTwZYBAAMCAANzAAM4BA',
        file_unique_id: 'AQADDgxrG36YhVN4',
        file_size: 1765,
        width: 90,
        height: 90,
      },
      {
        file_id:
          'AgACAgQAAxkDAAM4aW_U_6fRFWGezC47Pkht0eY4El0AAg4Maxt-mIVTHmLGnVLTwZYBAAMCAANtAAM4BA',
        file_unique_id: 'AQADDgxrG36YhVNy',
        file_size: 15853,
        width: 236,
        height: 236,
      },
    ];

    expect(getBiggestTgPhotoFileId(photos)).toBe(photos[1].file_id);
  });

  it('falls back to width*height when file_size is missing', () => {
    const photos: TGPhotoSize[] = [
      {
        file_id: 'small',
        file_unique_id: 'u1',
        width: 100,
        height: 100,
      },
      {
        file_id: 'big',
        file_unique_id: 'u2',
        width: 200,
        height: 150,
      },
    ];

    expect(getBiggestTgPhotoFileId(photos)).toBe('big');
  });

  it('prefers any photo with file_size over photos without file_size', () => {
    const photos: TGPhotoSize[] = [
      {
        file_id: 'no-size-but-huge-area',
        file_unique_id: 'u1',
        width: 4000,
        height: 4000,
      },
      {
        file_id: 'has-size',
        file_unique_id: 'u2',
        file_size: 1,
        width: 10,
        height: 10,
      },
    ];

    expect(getBiggestTgPhotoFileId(photos)).toBe('has-size');
  });
});
