export interface GigPosterFile {
  buffer: Buffer;
  mimetype?: string;
}

export interface PreparedGigPosterFile extends GigPosterFile {
  filename: string;
}
