import { describe, expect, it } from 'vitest';
import { initialsOf } from './avatar';

describe('initialsOf', () => {
  it('uses the first and last words of a name', () => {
    expect(initialsOf('Nguyễn Thị Lan')).toBe('NL');
    expect(initialsOf('shawn nguyen')).toBe('SN');
    expect(initialsOf('An')).toBe('A');
    expect(initialsOf('   ')).toBe('?');
  });
});
