import path from "node:path";
import { allowedMimeTypes } from "../../config/env";

/** Extensions converted via LibreOffice in conversion.service (non-PDF branch). */
const OFFICE_LIKE_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
]);

const EXTENSION_TO_CANONICAL_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/**
 * Magic-byte sniffing often reports OOXML (.docx, .xlsx) as ZIP, and legacy OLE as x-cfb.
 * We map those ambiguous sniff results to Office MIME types using the extension, without doing the same for PDF.
 */
const MIMES_TRUST_OFFICE_EXTENSION: ReadonlySet<string> = new Set([
  "application/octet-stream",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-cfb",
]);

export function resolveUploadMimeType(
  originalName: string,
  declaredMime: string,
  sniffedMime: string | undefined,
): string {
  const declared = declaredMime.trim().toLowerCase();
  const sniffed = sniffedMime?.toLowerCase();
  const ext = path.extname(originalName).toLowerCase();
  const fromExt = EXTENSION_TO_CANONICAL_MIME[ext];

  if (sniffed && allowedMimeTypes.includes(sniffed)) {
    return sniffed;
  }

  if (
    OFFICE_LIKE_EXTENSIONS.has(ext) &&
    fromExt &&
    allowedMimeTypes.includes(fromExt) &&
    (!sniffed || MIMES_TRUST_OFFICE_EXTENSION.has(sniffed))
  ) {
    return fromExt;
  }

  if (!sniffed && declared && allowedMimeTypes.includes(declared)) {
    return declared;
  }

  return sniffed ?? declared ?? "application/octet-stream";
}

/** Multer runs before sniffing; some clients send octet-stream for Office files. */
export function isUploadCandidateAllowed(
  originalName: string,
  declaredMime: string,
): boolean {
  const mime = declaredMime.trim().toLowerCase();
  if (allowedMimeTypes.includes(mime)) return true;
  const ext = path.extname(originalName).toLowerCase();
  const fromExt = EXTENSION_TO_CANONICAL_MIME[ext];
  return Boolean(fromExt && allowedMimeTypes.includes(fromExt));
}
