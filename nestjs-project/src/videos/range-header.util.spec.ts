import { parseRangeHeader } from './range-header.util';

describe('parseRangeHeader', () => {
  it('should parse an explicit byte range', () => {
    expect(parseRangeHeader('bytes=10-19', 100)).toEqual({
      start: 10,
      end: 19,
      length: 10,
    });
  });

  it('should parse an open-ended range', () => {
    expect(parseRangeHeader('bytes=90-', 100)).toEqual({
      start: 90,
      end: 99,
      length: 10,
    });
  });

  it('should parse a suffix range', () => {
    expect(parseRangeHeader('bytes=-10', 100)).toEqual({
      start: 90,
      end: 99,
      length: 10,
    });
  });

  it('should clamp the end and oversized suffix to the object size', () => {
    expect(parseRangeHeader('bytes=95-200', 100)).toEqual({
      start: 95,
      end: 99,
      length: 5,
    });
    expect(parseRangeHeader('bytes=-200', 100)).toEqual({
      start: 0,
      end: 99,
      length: 100,
    });
  });

  it.each([
    '',
    'items=0-10',
    'bytes=-',
    'bytes=20-10',
    'bytes=100-100',
    'bytes=0-1,3-4',
  ])('should reject invalid range %p', (header) => {
    expect(parseRangeHeader(header, 100)).toBeNull();
  });

  it('should reject an empty object', () => {
    expect(parseRangeHeader('bytes=0-', 0)).toBeNull();
  });
});
