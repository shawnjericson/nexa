import type { FileKind } from './file';

type Signature = 'jpeg' | 'png' | 'gif' | 'webp' | 'mp4' | 'pdf' | 'zip' | 'text';

interface AllowedType {
  kind: FileKind;
  /** What the first bytes must look like. */
  signature: Signature;
  /** Accepted filename extensions; the first one is added when a name has none of them. */
  extensions: readonly [string, ...string[]];
}

/**
 * The only types that can be uploaded (risk register 13: allowlist). Executables and active
 * content (HTML, SVG, scripts) are left out on purpose.
 */
export const ALLOWED_TYPES = {
  'image/jpeg': { kind: 'image', signature: 'jpeg', extensions: ['jpg', 'jpeg'] },
  'image/png': { kind: 'image', signature: 'png', extensions: ['png'] },
  'image/gif': { kind: 'image', signature: 'gif', extensions: ['gif'] },
  'image/webp': { kind: 'image', signature: 'webp', extensions: ['webp'] },
  'video/mp4': { kind: 'video', signature: 'mp4', extensions: ['mp4'] },
  'application/pdf': { kind: 'document', signature: 'pdf', extensions: ['pdf'] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    kind: 'document',
    signature: 'zip',
    extensions: ['docx'],
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    kind: 'document',
    signature: 'zip',
    extensions: ['xlsx'],
  },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    kind: 'document',
    signature: 'zip',
    extensions: ['pptx'],
  },
  'application/zip': { kind: 'archive', signature: 'zip', extensions: ['zip'] },
  'text/plain': { kind: 'document', signature: 'text', extensions: ['txt', 'log', 'md'] },
  'text/csv': { kind: 'document', signature: 'text', extensions: ['csv'] },
} as const satisfies Record<string, AllowedType>;

export type AllowedMimeType = keyof typeof ALLOWED_TYPES;

export const ALLOWED_MIME_TYPES = Object.keys(ALLOWED_TYPES) as [
  AllowedMimeType,
  ...AllowedMimeType[],
];

const lookup = (mimeType: string): AllowedType | undefined =>
  (ALLOWED_TYPES as Record<string, AllowedType>)[mimeType];

export function kindOf(mimeType: string): FileKind {
  return lookup(mimeType)?.kind ?? 'document';
}

// ─── Content check ─────────────────────────────────────────────────────────

/** How many leading bytes the content check reads. */
export const SNIFF_BYTES = 4096;

const bytesOf = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

const hasAt = (bytes: Uint8Array, expected: readonly number[], offset = 0) =>
  bytes.length >= offset + expected.length &&
  expected.every((byte, index) => bytes[offset + index] === byte);

const BINARY_SIGNATURES: Array<[Exclude<Signature, 'text'>, (bytes: Uint8Array) => boolean]> = [
  ['jpeg', (bytes) => hasAt(bytes, [0xff, 0xd8, 0xff])],
  ['png', (bytes) => hasAt(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ['gif', (bytes) => hasAt(bytes, bytesOf('GIF87a')) || hasAt(bytes, bytesOf('GIF89a'))],
  ['webp', (bytes) => hasAt(bytes, bytesOf('RIFF')) && hasAt(bytes, bytesOf('WEBP'), 8)],
  ['mp4', (bytes) => hasAt(bytes, bytesOf('ftyp'), 4)],
  ['pdf', (bytes) => hasAt(bytes, bytesOf('%PDF-'))],
  // Office Open XML documents are ZIP containers too.
  [
    'zip',
    (bytes) => hasAt(bytes, [0x50, 0x4b, 0x03, 0x04]) || hasAt(bytes, [0x50, 0x4b, 0x05, 0x06]),
  ],
];

function binarySignatureOf(bytes: Uint8Array): Exclude<Signature, 'text'> | null {
  return BINARY_SIGNATURES.find(([, matches]) => matches(bytes))?.[0] ?? null;
}

/**
 * Whether the first bytes of an upload are what its declared type claims. The client's content
 * type is never trusted on its own (risk register 13: fake MIME type).
 */
export function contentMatches(mimeType: string, bytes: Uint8Array): boolean {
  const allowed = lookup(mimeType);
  if (!allowed || bytes.length === 0) return false;
  if (allowed.signature === 'text') {
    // Text has no NUL bytes; executables and other binaries do within their first bytes.
    return !bytes.includes(0) && binarySignatureOf(bytes) === null;
  }
  return binarySignatureOf(bytes) === allowed.signature;
}

// ─── Names ─────────────────────────────────────────────────────────────────

const MAX_FILENAME_LENGTH = 255;
const FORBIDDEN_IN_NAMES = new Set(Array.from('"<>:|?*'));

/**
 * Keeps the name people chose, minus any path, control characters and characters that are
 * illegal in file names. The extension is made to agree with the type, so "invoice.exe" uploaded
 * as a PDF downloads as "invoice.exe.pdf".
 */
export function safeFilename(name: string, mimeType: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = Array.from(base)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f && !FORBIDDEN_IN_NAMES.has(char);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  const stem = cleaned || 'file';

  const allowed = lookup(mimeType);
  if (!allowed) return stem.slice(0, MAX_FILENAME_LENGTH);

  const dot = stem.lastIndexOf('.');
  const extension = dot > 0 ? stem.slice(dot + 1).toLowerCase() : '';
  const known = allowed.extensions.includes(extension);
  const body = known ? stem.slice(0, dot) : stem;
  const finalExtension = known ? extension : allowed.extensions[0];
  return `${body.slice(0, MAX_FILENAME_LENGTH - finalExtension.length - 1).trimEnd()}.${finalExtension}`;
}

const encodeRfc5987 = (value: string) =>
  encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/**
 * RFC 6266 Content-Disposition with an ASCII fallback and the UTF-8 name, so Vietnamese file
 * names survive the download.
 */
export function contentDisposition(filename: string, inline: boolean): string {
  const fallback =
    filename
      // "đ" has no decomposed form, so it would otherwise vanish instead of becoming "d".
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/["\\]/g, '_')
      .trim() || 'file';
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(filename)}`;
}
