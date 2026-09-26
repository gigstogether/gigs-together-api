import type { PreparedGigPosterFile } from '../gig/types/gig-poster.types';
import type { InputFileData } from './types/message.types';

export function mapPreparedGigPosterToTelegramInputFile(
  posterFile: PreparedGigPosterFile | undefined,
): InputFileData | undefined {
  if (posterFile === undefined) {
    return undefined;
  }

  const inputFile: InputFileData = {
    buffer: posterFile.buffer,
    filename: posterFile.filename,
  };
  if (posterFile.mimetype !== undefined) {
    inputFile.contentType = posterFile.mimetype;
  }
  return inputFile;
}
