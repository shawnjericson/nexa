import { describe, expect, it } from 'vitest';
import { fold, formatBytes } from './format';

describe('formatBytes', () => {
  it('uses the largest unit that keeps the number readable, per locale', () => {
    expect(formatBytes(512, 'en')).toBe('512 byte');
    expect(formatBytes(2.4 * 1024 * 1024, 'en')).toBe('2.4 MB');
    expect(formatBytes(2.4 * 1024 * 1024, 'vi')).toBe('2,4 MB');
    expect(formatBytes(25 * 1024 * 1024, 'en')).toBe('25 MB');
  });
});

describe('fold', () => {
  it('matches Vietnamese names typed without accents', () => {
    expect(fold('Nguyễn Thị Lan')).toBe('nguyen thi lan');
    expect(fold('Đặng Lê Tuấn Anh')).toBe('dang le tuan anh');
    expect(fold('ĐÀ NẴNG')).toBe('da nang');
  });
});
