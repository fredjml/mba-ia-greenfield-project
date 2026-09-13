import { extname } from 'path';

const SAFE_EXTENSION = /^\.[a-z0-9]{1,10}$/;

export function buildOriginalVideoKey(
  channelId: string,
  videoId: string,
  filename: string,
): string {
  const candidate = extname(filename).toLowerCase();
  const extension = SAFE_EXTENSION.test(candidate) ? candidate : '';

  return `channels/${channelId}/videos/${videoId}/original${extension}`;
}
