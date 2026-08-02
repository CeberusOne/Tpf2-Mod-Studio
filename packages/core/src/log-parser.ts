import type {
  LogAnalysis,
  LogCauseCertainty,
  LogCauseStatus,
  LogFilterMode,
  LogGroup,
  LogSeverity,
  LogStackFrame
} from "./types.js";

const TIMESTAMP_PREFIX =
  /^\s*(?:\[(?:\d{4}[-/.]\d{2}[-/.]\d{2}[T\s])?\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\]|\d{4}[-/.]\d{2}[-/.]\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)\s*/u;

const BRACKET_FILE_REFERENCE = /\[string\s+"([^"]+)"\]:(\d+)/giu;
const AT_FILE_REFERENCE =
  /@((?:[A-Za-z]:)?[^()\r\n]+\.(?:lua|con|mdl|mtl|msh(?:\.blob)?|txt|log))\((\d+)\)/giu;
// Absolute or relative resource paths, including real TF2 stack lines:
// /home/.../mod.lua:32: in function
//
// Path separators are excluded from the segment classes on purpose. TF2 writes
// stdout from several threads without locking, so lines get shredded into each
// other and produce very long slash-heavy fragments with no valid extension.
// If a segment class can also match `/`, the split between segments becomes
// ambiguous and such a fragment backtracks exponentially (real 24 MB log: no
// result after 10 minutes). Excluding the separators makes each match
// deterministic without changing which paths are recognized.
const PATH_SEGMENT = String.raw`[^\s"'<>|:[\]()\\/]`;
const FILE_REFERENCE = new RegExp(
  String.raw`((?:[A-Za-z]:)?(?:\/|\\)?(?:${PATH_SEGMENT}*[\\/])+${PATH_SEGMENT}+\.(?:lua|con|mdl|mtl|msh(?:\.blob)?|txt|log))(?::(\d+))?`,
  "giu"
);
const PLAIN_STACK_FRAME = new RegExp(
  String.raw`^((?:[A-Za-z]:)?(?:\/|\\)?(?:${PATH_SEGMENT}*[\\/])+${PATH_SEGMENT}+\.(?:lua|con)):(\d+):\s+in\s+(?:function|main chunk)`,
  "iu"
);

interface FileLocation {
  file: string;
  sourceLine?: number;
}

interface RawLogEvent {
  lines: string[];
  firstLine: number;
  lastLine: number;
  severity: LogSeverity;
  message: string;
  locations: FileLocation[];
  stackTrace: LogStackFrame[];
  causeStatus: LogCauseStatus;
  causeCertainty: LogCauseCertainty;
  causeCode?: string;
  causedBy?: string;
  technicalCause?: string;
  recommendedFix?: string;
}

interface CauseRule {
  code: string;
  pattern: RegExp;
  technicalCause: string;
  recommendedFix: string;
  certainty: Exclude<LogCauseCertainty, "unclassified">;
}

const CAUSE_RULES: readonly CauseRule[] = [
  {
    code: "COMMONAPI2_BUILD_UNSUPPORTED",
    pattern:
      /commonapi2[^\r\n]*(?:build|version|native)[^\r\n]*(?:not supported|unsupported|incompatible)|commonapi2 with different version installed/iu,
    technicalCause:
      "The loaded CommonAPI2 native component does not declare compatibility with this Transport Fever 2 build, or multiple CommonAPI2 versions are active.",
    recommendedFix:
      "Keep exactly one CommonAPI2 package (`eis_os_commonapi2_1`) that matches the current TF2 build. Remove duplicate CommonAPI2 installs from mods and workshop folders.",
    certainty: "confirmed"
  },
  {
    code: "COMMONAPI2_DUPLICATE",
    pattern:
      /you can only have one commonapi2 installed|commonapi2 with different version installed/iu,
    technicalCause:
      "More than one CommonAPI2 installation is active. The runtime only allows a single CommonAPI2 package.",
    recommendedFix:
      "Disable or delete every extra CommonAPI2 folder so only one `eis_os_commonapi2_1` remains in the active mods list.",
    certainty: "confirmed"
  },
  {
    code: "COMMONAPI2_NATIVE_LOAD_FAILED",
    pattern:
      /commonapi2[^\r\n]*(?:native|dll|shared (?:object|library)|\.so)[^\r\n]*(?:failed|could not|cannot|not loaded)|error while in commonapi2/iu,
    technicalCause:
      "The CommonAPI2 script layer could not use its build-specific native component.",
    recommendedFix:
      "Verify that exactly one CommonAPI2 installation exists, its folder is `eis_os_commonapi2_1`, and its native binary matches the operating system and TF2 build.",
    certainty: "confirmed"
  },
  {
    code: "LUA_MODULE_NOT_FOUND",
    pattern:
      /(?:module\s+['"][^'"]+['"]\s+not found|unable to load module\s+['"][^'"]+['"]|cannot open[^\r\n]+\.lua[^\r\n]*(?:no such file|not found))/iu,
    technicalCause:
      "Lua could not resolve or open a required module through the active base-game and mod search paths.",
    recommendedFix:
      "Check the module path and letter case, ensure the providing mod is installed and enabled, and confirm dependency load order.",
    certainty: "confirmed"
  },
  {
    code: "MOD_ENTRY_MISSING",
    pattern:
      /(?:["'][^"']*mod\.lua["']\s+not found|mod\.lua["']?\s+not found)[^\r\n]*(?:mod will not be available)?/iu,
    technicalCause:
      "Transport Fever 2 discovered a mod folder or external mod reference without a usable root `mod.lua`.",
    recommendedFix:
      "Remove or repair the incomplete mod package. For mod.io/workshop entries, reinstall the mod or disable the broken entry.",
    certainty: "confirmed"
  },
  {
    code: "LUA_SYNTAX",
    pattern:
      /(?:unexpected symbol|syntax error|unfinished string|malformed number|['"][^'"]+['"] expected|expected near|<eof> expected)/iu,
    technicalCause:
      "The Lua parser rejected the source before the resource callback could complete.",
    recommendedFix:
      "Open the first reported source file and line, correct the Lua syntax there, then rerun the game before investigating later messages.",
    certainty: "confirmed"
  },
  {
    code: "LUA_RUNTIME_NIL",
    pattern:
      /attempt to (?:index|call|perform arithmetic on|concatenate|compare)[^\r\n]*nil/iu,
    technicalCause:
      "Lua code used a nil value where a table, function or scalar was required. In a modifier chain this can also follow an earlier callback returning invalid data.",
    recommendedFix:
      "Inspect the first mod-owned stack frame, verify the referenced field/input, and confirm that every earlier modifier returns the resource `data` table.",
    certainty: "confirmed"
  },
  {
    code: "RESOURCE_NOT_FOUND",
    pattern:
      /(?:no such file or directory|no such file|file not found|cannot open|could not open|resource[^\r\n]*not found|failed to open|unable to load[^\r\n]+(?:file|resource|model|texture|mesh))/iu,
    technicalCause:
      "A referenced file or resource was unavailable in the resolved TF2 base-game and active-mod paths.",
    recommendedFix:
      "Verify the complete resource path with exact Linux-sensitive casing and confirm that the base game or an active dependency supplies it.",
    certainty: "confirmed"
  },
  {
    code: "OUT_OF_MEMORY",
    pattern: /(?:out of memory|bad allocation|std::bad_alloc)/iu,
    technicalCause:
      "The process could not satisfy a memory allocation request.",
    recommendedFix:
      "Record memory use and the active mod set, reduce the reproducible workload, and retest before attributing the failure to a specific mod.",
    certainty: "confirmed"
  },
  {
    code: "ASSERTION_FAILED",
    pattern: /(?:assertion|assert)[^\r\n]*failed/iu,
    technicalCause:
      "A game or native-extension invariant was violated at the reported assertion.",
    recommendedFix:
      "Use the assertion location and the immediately preceding mod/resource operations to isolate the smallest reproducible active-mod set.",
    certainty: "probable"
  },
] as const;

const CONSEQUENCE_PATTERN =
  /(?:exception type:|this error is usually caused by modding|some game resources contain incorrect data|error (?:while )?loading|failed to load (?:resource|script|model|construction)|resource loading (?:failed|aborted)|application (?:crashed|terminated)|caught exception|mod will not be available)/iu;

const ERROR_SIGNAL =
  /(?:\berror\b|\bfatal\b|\bexception\b|unable to load|cannot open|could not open|no such file|stack traceback|assertion failed|mod will not be available|(?:file|module|resource|script|mod\.lua).{0,80}not found|(?:failed to (?:load|open|read|write|init))|you can only have one commonapi2)/iu;

/**
 * TF2 stdout noise that forums/wikis treat as non-actionable chatter
 * (startup banners, Vulkan/OpenAL dumps, successful init, archive mounts).
 * @see https://wiki.transportfever2.com/doku.php?id=gamemanual:gamefilelocations
 * @see https://www.transportfever.net/lexicon/entry/219-location-of-stdout-txt/
 */
const NOISE_LINE =
  /^(?:adding archive\b|MemoryTool::|createTrampoline|Region:\s*>|Modio:\s|mod\.io backend|__CRASHDB_|Optional extension not found|Requested (?:instance|device) extensions|Supported depth resolve|Supperted stencil|Format support:|\* (?:R8|R16|R32|B10|D16|D24|D32)|- (?:linear|optimal):|Memory (?:types|heaps):|\* \d+ \{|Swapchain size:|StreamingTexturePool:|sampling rate:|opened device OpenAL|Started in UI Mode|Build: Build |GC Called|Saved (?:settings|pipeline cache)|Goodbye\.?|Shutdown at |Startup at |=+|seed: \d+|Fifo|Immediate|invalid|Use present mode:|Create Vulkan instance|Found device #|-> Selected device|Count: \d+|Flags: \{|ecs::Engine::|Steam(?:User|API)|TPF2 Build |starting up build version|user data folder:|language: |locale: |"ooooo|"`888|" 888|"o888o|eatglobal: (?:init |History created|Initialization )|commonapi2\.(?:init|ui:)|CommonAPI2Native: (?:stdout|InitDone)|Successfully read pipeline cache|Pipeline was read successfully|Mods changed, recreating data|Found (?:CommonAPI2|menuUI|layout)|menuUILayout:|MainMenuFailbackButton|Destroying failback|- (?:numSamples|textureQuality|terrainTextureResolution):|Settings:|Steam language code|Found \d+ mods$|Loaded \d+ of \d+ mod|Update of mod descriptions|successfully completed:)/iu;

function isNoiseLine(stable: string): boolean {
  if (stable.length === 0) return true;
  if (ERROR_SIGNAL.test(stable) || /^(?:warn(?:ing)?)(?:\b|:)/iu.test(stable)) {
    return false;
  }
  return NOISE_LINE.test(stable);
}

function stableMessage(line: string): string {
  return line.replace(TIMESTAMP_PREFIX, "").trim().replace(/\s+/gu, " ");
}

function severityFor(normalized: string): LogSeverity {
  if (/^(?:warn(?:ing)?)(?:\b|:)/iu.test(normalized)) return "warning";
  if (
    /^(?:info|debug|trace)(?:\b|:)/iu.test(normalized) &&
    !ERROR_SIGNAL.test(normalized)
  ) {
    return "info";
  }
  if (
    /^(?:error|fatal|exception)(?:\b|:)/iu.test(normalized) ||
    /\b(?:stack traceback|unhandled exception|assertion failed)\b/iu.test(
      normalized
    ) ||
    /^(?:this error is usually caused by modding|some game resources contain incorrect data)/iu.test(
      normalized
    ) ||
    ERROR_SIGNAL.test(normalized)
  ) {
    return "error";
  }
  return "info";
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `log-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeFile(file: string): string {
  return file.trim().replaceAll("\\", "/").replace(/^["']/u, "").replace(/["']$/u, "");
}

function locationKey(location: FileLocation): string {
  return `${location.file}:${location.sourceLine ?? ""}`;
}

function extractLocations(value: string): FileLocation[] {
  const locations = new Map<string, FileLocation>();

  function add(fileValue: string, lineValue: string | undefined): void {
    const file = normalizeFile(fileValue);
    const sourceLine =
      lineValue === undefined ? undefined : Number.parseInt(lineValue, 10);
    const location: FileLocation = {
      file,
      ...(sourceLine === undefined || Number.isNaN(sourceLine)
        ? {}
        : { sourceLine })
    };
    locations.set(locationKey(location), location);
  }

  for (const match of value.matchAll(BRACKET_FILE_REFERENCE)) {
    if (match[1] !== undefined) add(match[1], match[2]);
  }
  for (const match of value.matchAll(AT_FILE_REFERENCE)) {
    if (match[1] !== undefined) add(match[1], match[2]);
  }
  for (const match of value.matchAll(FILE_REFERENCE)) {
    if (match[1] !== undefined) add(match[1], match[2]);
  }

  return [...locations.values()];
}

function modIdFor(file: string): string | undefined {
  const normalized = normalizeFile(file);
  const match = normalized.match(
    /(?:^|\/)(?:mods|staging_area|workshop\/content\/\d+|mod\.io\/common\/\d+\/mods)\/([^/]+)\//iu
  );
  return match?.[1];
}

function explicitModIds(value: string): string[] {
  const ids = new Set<string>();
  for (const match of value.matchAll(/\bmod(?: id)?\s*[:=]\s*([a-z0-9_-]+)/giu)) {
    if (match[1] !== undefined) ids.add(match[1]);
  }
  return [...ids];
}

function stackFrameFor(line: string): LogStackFrame | undefined {
  const stable = stableMessage(line);
  if (/^stack traceback:?$/iu.test(stable)) return undefined;
  const plain = stable.match(PLAIN_STACK_FRAME);
  if (plain?.[1] !== undefined) {
    const sourceLine = Number.parseInt(plain[2] ?? "", 10);
    const functionMatch = stable.match(
      /\bin function\s+(?:['"]([^'"]+)['"]|<([^>]+)>|([^\s]+))/iu
    );
    const functionName =
      functionMatch?.[1] ?? functionMatch?.[2] ?? functionMatch?.[3];
    return {
      raw: stable,
      file: normalizeFile(plain[1]),
      ...(Number.isNaN(sourceLine) ? {} : { sourceLine }),
      ...(functionName === undefined ? {} : { functionName })
    };
  }
  if (
    !/(?:\bin function\b|\bin main chunk\b|\[C\]|@.+\(\d+\)|\[string\s+")/iu.test(
      stable
    )
  ) {
    return undefined;
  }
  const location = extractLocations(stable).at(0);
  const functionMatch = stable.match(
    /\bin function\s+(?:['"]([^'"]+)['"]|<([^>]+)>|([^\s]+))/iu
  );
  const functionName =
    functionMatch?.[1] ?? functionMatch?.[2] ?? functionMatch?.[3];
  return {
    raw: stable,
    ...(location?.file === undefined ? {} : { file: location.file }),
    ...(location?.sourceLine === undefined
      ? {}
      : { sourceLine: location.sourceLine }),
    ...(functionName === undefined ? {} : { functionName })
  };
}

function isDetailLine(line: string, previous: RawLogEvent | undefined): boolean {
  if (previous === undefined || previous.severity !== "error") return false;
  const stable = stableMessage(line);
  return (
    /^stack traceback:?$/iu.test(stable) ||
    /^\[string\s+"[^"]+"\]:\d+:/iu.test(stable) ||
    /^@.+\(\d+\):/u.test(stable) ||
    /^no (?:field|file) package\./iu.test(stable) ||
    /^no file\s+['"]/iu.test(stable) ||
    /^file name:/iu.test(stable) ||
    /^message:\s*/iu.test(stable) ||
    /^\t/u.test(line) ||
    PLAIN_STACK_FRAME.test(stable) ||
    stackFrameFor(line) !== undefined
  );
}

function rebuildEvent(event: RawLogEvent): void {
  event.lastLine = event.firstLine + event.lines.length - 1;
  event.message = stableMessage(event.lines[0] ?? "");
  const joined = event.lines.map(stableMessage).join("\n");
  event.locations = extractLocations(joined);
  event.stackTrace = event.lines
    .map(stackFrameFor)
    .filter((frame): frame is LogStackFrame => frame !== undefined);
}

function rawEvents(content: string): { events: RawLogEvent[]; noiseSkipped: number } {
  const events: RawLogEvent[] = [];
  const lines = content.split(/\r?\n/u);
  let noiseSkipped = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (raw === undefined || raw.trim().length === 0) continue;
    const previous = events.at(-1);
    if (previous !== undefined && isDetailLine(raw, previous)) {
      // Only collect here. Rebuilding per appended line would re-scan every
      // earlier line of the event and make long stack tracebacks quadratic.
      previous.lines.push(raw);
      continue;
    }
    const stable = stableMessage(raw);
    if (isNoiseLine(stable)) {
      noiseSkipped += 1;
      continue;
    }
    events.push({
      lines: [raw],
      firstLine: index + 1,
      lastLine: index + 1,
      severity: severityFor(stable),
      message: stable,
      locations: [],
      stackTrace: [],
      causeStatus: "unclassified",
      causeCertainty: "unclassified"
    });
  }
  for (const event of events) rebuildEvent(event);
  return { events, noiseSkipped };
}

function classifyCauses(events: RawLogEvent[]): void {
  for (const event of events) {
    if (event.severity !== "error") continue;
    const evidence = event.lines.map(stableMessage).join("\n");
    const rule = CAUSE_RULES.find(({ pattern }) => pattern.test(evidence));
    if (rule === undefined) continue;
    event.causeStatus = "root-cause";
    event.causeCertainty = rule.certainty;
    event.causeCode = rule.code;
    event.technicalCause = rule.technicalCause;
    event.recommendedFix = rule.recommendedFix;
  }

  const roots = events.filter(
    (event) => event.causeStatus === "root-cause"
  );
  for (const event of events) {
    if (
      event.severity !== "error" ||
      event.causeStatus === "root-cause" ||
      !CONSEQUENCE_PATTERN.test(event.message)
    ) {
      continue;
    }
    const root = roots
      .filter(
        (candidate) =>
          Math.abs(candidate.firstLine - event.firstLine) <= 60
      )
      .sort((left, right) => {
        const leftAfterPenalty = left.firstLine > event.firstLine ? 1 : 0;
        const rightAfterPenalty = right.firstLine > event.firstLine ? 1 : 0;
        return (
          leftAfterPenalty - rightAfterPenalty ||
          Math.abs(left.firstLine - event.firstLine) -
            Math.abs(right.firstLine - event.firstLine)
        );
      })
      .at(0);
    if (root === undefined) continue;
    const rootFile = root.locations.at(0);
    const rootKey = [
      root.severity,
      root.causeStatus,
      root.causeCode ?? "",
      root.message,
      rootFile?.file ?? "",
      rootFile?.sourceLine ?? "",
      ""
    ].join("|");
    event.causeStatus = "consequence";
    event.causeCertainty = "probable";
    event.causedBy = stableId(rootKey);
    event.technicalCause =
      "This message reports the load/crash outcome after an earlier, more specific error.";
    event.recommendedFix =
      "Fix the linked root cause first, rerun TF2, and only investigate this message if it remains.";
  }
}

function groupEvents(events: RawLogEvent[]): LogGroup[] {
  const groups = new Map<string, LogGroup>();

  for (const event of events) {
    const primary = event.locations.at(0);
    const key = [
      event.severity,
      event.causeStatus,
      event.causeCode ?? "",
      event.message,
      primary?.file ?? "",
      primary?.sourceLine ?? "",
      event.causedBy ?? ""
    ].join("|");
    const id = stableId(key);
    const affectedFiles = new Set(
      event.locations.map((location) => location.file)
    );
    for (const frame of event.stackTrace) {
      if (frame.file !== undefined) affectedFiles.add(frame.file);
    }
    const affectedMods = new Set<string>(
      [...affectedFiles]
        .map(modIdFor)
        .filter((modId): modId is string => modId !== undefined)
    );
    for (const modId of explicitModIds(event.lines.join("\n"))) {
      affectedMods.add(modId);
    }
    const existing = groups.get(id);
    if (existing !== undefined) {
      existing.count += 1;
      existing.lastLine = event.lastLine;
      for (const file of affectedFiles) {
        if (!existing.affectedFiles.includes(file)) {
          existing.affectedFiles.push(file);
        }
      }
      for (const modId of affectedMods) {
        if (!existing.affectedMods.includes(modId)) {
          existing.affectedMods.push(modId);
        }
      }
      for (const frame of event.stackTrace) {
        if (!existing.stackTrace.some((item) => item.raw === frame.raw)) {
          existing.stackTrace.push(frame);
        }
      }
      continue;
    }

    const modId = [...affectedMods].at(0);
    groups.set(id, {
      id,
      severity: event.severity,
      message: event.message,
      count: 1,
      firstLine: event.firstLine,
      lastLine: event.lastLine,
      causeStatus: event.causeStatus,
      causeCertainty: event.causeCertainty,
      stackTrace: event.stackTrace,
      affectedFiles: [...affectedFiles],
      affectedMods: [...affectedMods],
      ...(primary?.file === undefined ? {} : { file: primary.file }),
      ...(primary?.sourceLine === undefined
        ? {}
        : { sourceLine: primary.sourceLine }),
      ...(modId === undefined ? {} : { modId }),
      ...(event.causeCode === undefined ? {} : { causeCode: event.causeCode }),
      ...(event.causedBy === undefined ? {} : { causedBy: event.causedBy }),
      ...(event.technicalCause === undefined
        ? {}
        : { technicalCause: event.technicalCause }),
      ...(event.recommendedFix === undefined
        ? {}
        : { recommendedFix: event.recommendedFix })
    });
  }

  const causeRank: Record<LogCauseStatus, number> = {
    "root-cause": 0,
    consequence: 1,
    unclassified: 2
  };
  const severityRank: Record<LogSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2
  };
  return [...groups.values()].sort(
    (left, right) =>
      severityRank[left.severity] - severityRank[right.severity] ||
      causeRank[left.causeStatus] - causeRank[right.causeStatus] ||
      left.firstLine - right.firstLine
  );
}

export function analyzeTf2Log(
  content: string,
  options?: { filterMode?: LogFilterMode }
): LogAnalysis {
  const filterMode = options?.filterMode ?? "problems";
  const { events, noiseSkipped } = rawEvents(content);
  classifyCauses(events);
  const allGroups = groupEvents(events);
  const rootCauseCount = allGroups.filter(
    (group) => group.causeStatus === "root-cause"
  ).length;
  const consequenceCount = allGroups.filter(
    (group) => group.causeStatus === "consequence"
  ).length;
  const warningCount = allGroups.filter(
    (group) => group.severity === "warning"
  ).length;
  const unclassifiedErrorCount = allGroups.filter(
    (group) =>
      group.severity === "error" && group.causeStatus === "unclassified"
  ).length;
  const errorCount = allGroups.filter(
    (group) => group.severity === "error"
  ).length;
  const reliable =
    errorCount === 0 ||
    (rootCauseCount > 0 && unclassifiedErrorCount === 0);
  const reliabilityReason =
    errorCount === 0
      ? "No error event requires causal attribution."
      : reliable
        ? "Every error is either a recognized root cause or linked consequence."
        : rootCauseCount === 0
          ? "Errors are present, but no supported root-cause signature was proven."
          : `${unclassifiedErrorCount} error group(s) remain causally unclassified.`;

  const groups =
    filterMode === "all"
      ? allGroups
      : allGroups.filter(
          (group) =>
            group.severity === "error" || group.severity === "warning"
        );

  return {
    groups,
    allGroups,
    rootCauseCount,
    consequenceCount,
    warningCount,
    unclassifiedErrorCount,
    noiseSkipped,
    reliable,
    reliabilityReason,
    filterMode
  };
}

/**
 * Backward-compatible grouped view. New callers should use analyzeTf2Log() to
 * retain the reliability summary.
 */
export function parseTf2Log(content: string): LogGroup[] {
  return analyzeTf2Log(content).groups;
}
