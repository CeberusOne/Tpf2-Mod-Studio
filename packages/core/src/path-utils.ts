const NUL = "\0";

/**
 * Drop a leading UTF-8 byte order mark.
 *
 * Many editors write one, Transport Fever 2 loads such files fine, but the Lua
 * parser reports it as `unexpected symbol` on line 1. Measured on a real
 * library, 225 of 709 installed `mod.lua` files start with a BOM — without
 * this every one of them would be reported as a syntax error and blocked from
 * installation.
 */
export function stripByteOrderMark(source: string): string {
  return source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
}
const WINDOWS_FORBIDDEN_CHARACTERS = /[\u0000-\u001f\u007f<>:"|?*]/u;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

export function normalizeResourcePath(value: string): string {
  return value
    .replaceAll("\\", "/")
    .replace(/^(?:\.\/)+/u, "")
    .replace(/^\/+/, "")
    .replace(/\/+/gu, "/");
}

function assertPortableSegment(segment: string): void {
  if (WINDOWS_FORBIDDEN_CHARACTERS.test(segment)) {
    throw new Error(
      "Path segments must not contain control characters or characters forbidden on Windows."
    );
  }
  if (/[ .]$/u.test(segment)) {
    throw new Error("Path segments must not end with a space or a dot.");
  }
  if (WINDOWS_RESERVED_NAME.test(segment)) {
    throw new Error(`The path segment \`${segment}\` is reserved on Windows.`);
  }
}

export function assertSafeRelativePath(relativePath: string): string {
  if (relativePath.length === 0) {
    throw new Error("The relative path must not be empty.");
  }
  if (relativePath.includes(NUL)) {
    throw new Error("The path contains a NUL byte.");
  }
  if (/^[\\/]/u.test(relativePath) || /^[A-Za-z]:[\\/]/u.test(relativePath)) {
    throw new Error("Absolute paths are not allowed.");
  }

  const normalized = normalizeResourcePath(relativePath).normalize("NFC");
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "." || part === "")) {
    throw new Error("Path traversal and empty path segments are not allowed.");
  }
  for (const part of parts) assertPortableSegment(part);
  return normalized;
}

/**
 * Key used to detect names that collapse to the same path on common Windows
 * filesystems. Invalid trailing spaces/dots are removed so scans can still
 * report a collision even before the path is rejected by the validator.
 */
export function portablePathKey(relativePath: string): string {
  return normalizeResourcePath(relativePath)
    .normalize("NFC")
    .split("/")
    .map((segment) => segment.replace(/[ .]+$/u, "").toLowerCase())
    .join("/");
}
