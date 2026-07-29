import type { LogGroup, LogSeverity } from "./types.js";

const TIMESTAMP_PREFIX =
  /^\s*(?:\[[^\]]+\]|\d{4}[-/.]\d{2}[-/.]\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)\s*/u;

const FILE_REFERENCE =
  /(?:^|\s)((?:[A-Za-z]:)?[^\s"'<>|]*[\\/][^\s"'<>|]*\.(?:lua|con|mdl|mtl|msh|txt|log))(?::(\d+))?/iu;

function severityFor(line: string): LogSeverity {
  if (/\b(?:error|fatal|exception|stack traceback|failed)\b/iu.test(line)) {
    return "error";
  }
  if (/\bwarn(?:ing)?\b/iu.test(line)) return "warning";
  return "info";
}

function stableMessage(line: string): string {
  return line.replace(TIMESTAMP_PREFIX, "").trim().replace(/\s+/gu, " ");
}

function stableId(
  severity: LogSeverity,
  message: string,
  file: string | undefined,
  sourceLine: number | undefined
): string {
  const value = `${severity}|${message}|${file ?? ""}|${sourceLine ?? ""}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `log-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function modIdFor(file: string | undefined): string | undefined {
  if (file === undefined) return undefined;
  const normalized = file.replaceAll("\\", "/");
  const match = normalized.match(
    /(?:^|\/)(?:mods|staging_area|workshop\/content\/1066780)\/([^/]+)\//iu
  );
  return match?.[1];
}

export function parseTf2Log(content: string): LogGroup[] {
  const groups = new Map<string, LogGroup>();
  const lines = content.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]?.trim();
    if (raw === undefined || raw.length === 0) continue;
    const message = stableMessage(raw);
    const severity = severityFor(message);
    const fileMatch = message.match(FILE_REFERENCE);
    const file = fileMatch?.[1]?.trim();
    const sourceLine =
      fileMatch?.[2] === undefined ? undefined : Number(fileMatch[2]);
    const id = stableId(severity, message, file, sourceLine);
    const modId = modIdFor(file);
    const existing = groups.get(id);
    if (existing !== undefined) {
      existing.count += 1;
      existing.lastLine = index + 1;
      continue;
    }
    groups.set(id, {
      id,
      severity,
      message,
      count: 1,
      firstLine: index + 1,
      lastLine: index + 1,
      causeStatus: "unclassified",
      ...(file === undefined ? {} : { file }),
      ...(sourceLine === undefined ? {} : { sourceLine }),
      ...(modId === undefined ? {} : { modId })
    });
  }

  const severityRank: Record<LogSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2
  };
  return [...groups.values()].sort(
    (left, right) =>
      severityRank[left.severity] - severityRank[right.severity] ||
      left.firstLine - right.firstLine
  );
}
