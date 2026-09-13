import { describe, expect, it } from 'vitest';
import {
  contentDisposition,
  contentMatches,
  safeFilename,
} from '../src/modules/file/domain/file-types';
import { DOCX, EXE, PDF, PNG } from './helpers/files';

const text = (value: string) => new TextEncoder().encode(value);
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('upload content check', () => {
  it('recognises files by their first bytes, not by what the client says', () => {
    expect(contentMatches('image/png', PNG)).toBe(true);
    expect(contentMatches('image/jpeg', PNG)).toBe(false);
    expect(contentMatches('application/pdf', PDF)).toBe(true);
    expect(contentMatches('application/pdf', PNG)).toBe(false);
    expect(contentMatches(DOCX_TYPE, DOCX)).toBe(true);
    expect(contentMatches('image/png', EXE)).toBe(false);
  });

  it('accepts text only when it contains no binary content', () => {
    expect(contentMatches('text/plain', text('Xin chào cả nhà\n'))).toBe(true);
    expect(contentMatches('text/csv', text('name,team\nAn,Engineering\n'))).toBe(true);
    expect(contentMatches('text/plain', EXE)).toBe(false);
    expect(contentMatches('text/csv', PDF)).toBe(false);
    expect(contentMatches('text/plain', new Uint8Array())).toBe(false);
  });

  it('never accepts types outside the allowlist', () => {
    expect(contentMatches('image/svg+xml', text('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(
      false,
    );
    expect(contentMatches('text/html', text('<script>alert(1)</script>'))).toBe(false);
  });
});

describe('file names', () => {
  it('drops paths and illegal characters, and fixes the extension', () => {
    expect(safeFilename('C:\\temp\\..\\evil.exe', 'application/pdf')).toBe('evil.exe.pdf');
    expect(safeFilename('../../etc/passwd', 'text/plain')).toBe('passwd.txt');
    expect(safeFilename('Photo.JPG', 'image/jpeg')).toBe('Photo.jpg');
    expect(safeFilename('  a\u0000b<c>.png  ', 'image/png')).toBe('abc.png');
    expect(safeFilename('...', 'image/png')).toBe('file.png');
    expect(safeFilename(`${'x'.repeat(300)}.pdf`, 'application/pdf')).toHaveLength(255);
  });

  it('keeps Vietnamese names through downloads', () => {
    expect(contentDisposition('Báo cáo.pdf', false)).toBe(
      'attachment; filename="Bao cao.pdf"; filename*=UTF-8\'\'B%C3%A1o%20c%C3%A1o.pdf',
    );
    expect(contentDisposition('Đề xuất "đẹp".png', true)).toContain(
      'inline; filename="De xuat _dep_.png"',
    );
  });
});
