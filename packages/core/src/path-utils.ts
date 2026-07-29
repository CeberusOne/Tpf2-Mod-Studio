const NUL = "\0";

export function normalizeResourcePath(value: string): string {
  return value
    .replaceAll("\\", "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
}

export function assertSafeRelativePath(relativePath: string): string {
  if (relativePath.length === 0) {
    throw new Error("The relative path must not be empty.");
  }
  if (relativePath.includes(NUL)) {
    throw new Error("The path contains a NUL byte.");
  }
  if (
    /^[\\/]/u.test(relativePath) ||
    /^[A-Za-z]:[\\/]/u.test(relativePath)
  ) {
    throw new Error("Absolute paths are not allowed.");
  }

  const normalized = normalizeResourcePath(relativePath);
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "." || part === "")) {
    throw new Error("Path traversal and empty path segments are not allowed.");
  }
  return normalized;
}

export function portablePathKey(relativePath: string): string {
  return normalizeResourcePath(relativePath).normalize("NFC").toLocaleLowerCase("en-US");
}
