export interface ByteRange {
  start: number;
  end: number;
  length: number;
}

export function parseRangeHeader(
  rangeHeader: string,
  objectSize: number,
): ByteRange | null {
  if (!Number.isSafeInteger(objectSize) || objectSize <= 0) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) return null;

  let start: number;
  let end: number;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(objectSize - suffixLength, 0);
    end = objectSize - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : objectSize - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= objectSize ||
      end < start
    ) {
      return null;
    }
    end = Math.min(end, objectSize - 1);
  }

  return { start, end, length: end - start + 1 };
}
