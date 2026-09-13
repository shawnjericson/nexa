/** The smallest byte sequences that pass (or fail) the upload content check. */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MZ_HEADER = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00];
const ZIP_HEADER = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00];
const filler = (byte: number) => Array.from({ length: 24 }, () => byte);

export const PNG = Uint8Array.from([...PNG_SIGNATURE, ...filler(1)]);

export const PDF = new TextEncoder().encode('%PDF-1.7\n% NEXA test document\n');

/** A Windows executable header ("MZ"), NUL bytes included. */
export const EXE = Uint8Array.from([...MZ_HEADER, ...filler(0)]);

/** An Office Open XML document is a ZIP container. */
export const DOCX = Uint8Array.from(ZIP_HEADER);
