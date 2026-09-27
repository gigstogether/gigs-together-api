import { mapPreparedGigPosterToTelegramInputFile } from './telegram-input-file.mapper';

describe('mapPreparedGigPosterToTelegramInputFile', () => {
  it('should map a prepared poster to the Telegram input file contract', () => {
    const buffer = Buffer.from('poster');

    const result = mapPreparedGigPosterToTelegramInputFile({
      buffer,
      filename: 'poster.png',
      mimetype: 'image/png',
    });

    expect(result).toEqual({
      buffer,
      filename: 'poster.png',
      contentType: 'image/png',
    });
  });

  it('should omit contentType when the prepared poster has no mimetype', () => {
    const result = mapPreparedGigPosterToTelegramInputFile({
      buffer: Buffer.from('poster'),
      filename: 'poster',
    });

    expect(result).not.toHaveProperty('contentType');
  });

  it('should preserve an absent optional poster', () => {
    expect(mapPreparedGigPosterToTelegramInputFile(undefined)).toBeUndefined();
  });
});
