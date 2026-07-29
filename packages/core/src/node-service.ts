import {
  access,
  copyFile,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import { assertSafeRelativePath } from "./path-utils.js";
import type {
  CreateProjectRequest,
  CreatedProject,
  InstallResult,
  ProjectFile,
  ProjectMode,
  ProjectSnapshot
} from "./types.js";

const MAX_SCANNED_FILES = 20_000;
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_EDIT_BYTES = 8 * 1024 * 1024;
const MAX_LOG_BYTES = 32 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  ".lua",
  ".con",
  ".mdl",
  ".mtl",
  ".ani",
  ".fs",
  ".vs",
  ".json",
  ".md",
  ".txt",
  ".cfg",
  ".ini",
  ".toml",
  ".xml"
]);

const EDITABLE_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  ".po"
]);

const IGNORED_SCAN_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "target",
  "dist",
  "backups"
]);

const INSTALL_EXCLUDES = new Set([
  ".git",
  ".tpf2-studio",
  "node_modules",
  "target",
  "dist"
]);

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/gu, "-");
}

function escapeLuaString(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r", "")
    .replaceAll("\n", "\\n");
}

function validateCreateRequest(request: CreateProjectRequest): void {
  if (!/^[a-z0-9][a-z0-9_-]*_[1-9][0-9]*$/u.test(request.projectId)) {
    throw new Error(
      "The project ID must be lower-case and end in a positive major version, for example my_mod_1."
    );
  }
  if (request.displayName.trim().length === 0 || request.displayName.length > 120) {
    throw new Error("The display name must contain 1 to 120 characters.");
  }
  if (request.author.trim().length === 0 || request.author.length > 120) {
    throw new Error("The author must contain 1 to 120 characters.");
  }
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

async function resolveExistingRoot(rootPath: string): Promise<string> {
  const resolved = await realpath(rootPath);
  const metadata = await stat(resolved);
  if (!metadata.isDirectory()) throw new Error("The selected path is not a directory.");
  return resolved;
}

async function safeExistingPath(
  rootPath: string,
  relativePath: string
): Promise<{ root: string; candidate: string; relative: string }> {
  const relative = assertSafeRelativePath(relativePath);
  const root = await resolveExistingRoot(rootPath);
  const candidate = await realpath(path.join(root, ...relative.split("/")));
  if (!isPathInside(root, candidate)) {
    throw new Error("The resolved path leaves the selected project.");
  }
  return { root, candidate, relative };
}

async function safeWritablePath(
  rootPath: string,
  relativePath: string
): Promise<{ root: string; candidate: string; relative: string }> {
  const relative = assertSafeRelativePath(relativePath);
  const root = await resolveExistingRoot(rootPath);
  const candidate = path.resolve(root, ...relative.split("/"));
  const parent = await realpath(path.dirname(candidate));
  if (!isPathInside(root, parent) || !isPathInside(root, candidate)) {
    throw new Error("The resolved write path leaves the selected project.");
  }
  return { root, candidate, relative };
}

function projectTemplate(request: CreateProjectRequest): {
  modLua: string;
  stringsLua: string;
  readme: string;
} {
  const displayName = escapeLuaString(request.displayName.trim());
  const author = escapeLuaString(request.author.trim());
  return {
    modLua: `function data()
  return {
    info = {
      name = _("${displayName}"),
      description = _("modDesc"),
      authors = {
        {
          name = "${author}",
          role = "CREATOR",
        },
      },
      minorVersion = 0,
      severityAdd = "NONE",
      severityRemove = "WARNING",
    },
  }
end
`,
    stringsLua: `function data()
  return {
    en = {
      ["${displayName}"] = "${displayName}",
      modDesc = "Describe this Transport Fever 2 mod.",
    },
    de = {
      ["${displayName}"] = "${displayName}",
      modDesc = "Beschreibe diese Transport-Fever-2-Mod.",
    },
  }
end
`,
    readme: `# ${request.displayName.trim()}

Transport Fever 2 mod project created by Tpf2 Mod Studio.

- Project ID: \`${request.projectId}\`
- Mode: \`${request.mode}\`
- Major version: derived from the project ID suffix

Place game resources below \`res/\`. Keep resource filenames lower-case and
update \`mod.lua\` and \`strings.lua\` before release.
`
  };
}

export async function createProjectNode(
  request: CreateProjectRequest
): Promise<CreatedProject> {
  validateCreateRequest(request);
  const parent = await resolveExistingRoot(request.parentDirectory);
  const target = path.join(parent, request.projectId);
  if (await exists(target)) {
    throw new Error(`The project directory already exists: ${target}`);
  }

  const temporary = await mkdtemp(path.join(parent, ".tpf2-mod-studio-create-"));
  const template = projectTemplate(request);
  try {
    await mkdir(path.join(temporary, "res"), { recursive: false });
    await mkdir(path.join(temporary, "documents"), { recursive: false });
    await mkdir(path.join(temporary, ".tpf2-studio"), { recursive: false });
    await Promise.all([
      writeFile(path.join(temporary, "mod.lua"), template.modLua, "utf8"),
      writeFile(path.join(temporary, "strings.lua"), template.stringsLua, "utf8"),
      writeFile(path.join(temporary, "documents", "README.md"), template.readme, "utf8"),
      writeFile(
        path.join(temporary, ".tpf2-studio", "project.json"),
        `${JSON.stringify(
          {
            schemaVersion: 1,
            projectId: request.projectId,
            displayName: request.displayName.trim(),
            author: request.author.trim(),
            mode: request.mode
          },
          null,
          2
        )}\n`,
        "utf8"
      )
    ]);
    await rename(temporary, target);
    return {
      rootPath: target,
      projectId: request.projectId,
      mode: request.mode
    };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

function isTextFile(relativePath: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(relativePath).toLocaleLowerCase("en-US"));
}

async function readMode(root: string): Promise<ProjectMode> {
  try {
    const raw = await readFile(
      path.join(root, ".tpf2-studio", "project.json"),
      "utf8"
    );
    const parsed = JSON.parse(raw) as { mode?: unknown };
    return parsed.mode === "commonapi2" ? "commonapi2" : "vanilla";
  } catch {
    return "vanilla";
  }
}

async function scanDirectory(
  root: string,
  current: string,
  output: ProjectFile[]
): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (output.length >= MAX_SCANNED_FILES) {
      throw new Error(
        `Project scan stopped after ${MAX_SCANNED_FILES.toLocaleString("en-US")} files.`
      );
    }
    if (entry.isSymbolicLink()) continue;
    if (
      entry.isDirectory() &&
      (IGNORED_SCAN_DIRECTORIES.has(entry.name) ||
        current.endsWith(`${path.sep}.tpf2-studio`))
    ) {
      continue;
    }
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(root, absolute, output);
      continue;
    }
    if (!entry.isFile()) continue;
    const metadata = await lstat(absolute);
    const relativePath = path.relative(root, absolute).split(path.sep).join("/");
    const text = isTextFile(relativePath);
    let content: string | undefined;
    if (text && metadata.size <= MAX_TEXT_FILE_BYTES) {
      content = await readFile(absolute, "utf8");
    }
    output.push({
      relativePath,
      size: metadata.size,
      modifiedMs: metadata.mtimeMs,
      text,
      ...(content === undefined ? {} : { content })
    });
  }
}

export async function scanProjectNode(
  rootPath: string
): Promise<ProjectSnapshot> {
  const root = await resolveExistingRoot(rootPath);
  const files: ProjectFile[] = [];
  await scanDirectory(root, root, files);
  return {
    rootPath: root,
    folderName: path.basename(root),
    mode: await readMode(root),
    scannedAt: new Date().toISOString(),
    files
  };
}

export async function readProjectFileNode(
  rootPath: string,
  relativePath: string
): Promise<string> {
  const { candidate, relative } = await safeExistingPath(rootPath, relativePath);
  if (!EDITABLE_EXTENSIONS.has(path.extname(relative).toLocaleLowerCase("en-US"))) {
    throw new Error("This file type is not editable as text.");
  }
  const metadata = await stat(candidate);
  if (!metadata.isFile()) throw new Error("The selected path is not a file.");
  if (metadata.size > MAX_EDIT_BYTES) {
    throw new Error("The text file exceeds the 8 MiB editor limit.");
  }
  return readFile(candidate, "utf8");
}

export async function saveProjectFileNode(
  rootPath: string,
  relativePath: string,
  content: string
): Promise<void> {
  if (Buffer.byteLength(content, "utf8") > MAX_EDIT_BYTES) {
    throw new Error("The edited content exceeds the 8 MiB editor limit.");
  }
  const { root, candidate, relative } = await safeWritablePath(
    rootPath,
    relativePath
  );
  if (!EDITABLE_EXTENSIONS.has(path.extname(relative).toLocaleLowerCase("en-US"))) {
    throw new Error("This file type is not editable as text.");
  }

  if (await exists(candidate)) {
    const backup = path.join(
      root,
      ".tpf2-studio",
      "backups",
      timestamp(),
      ...relative.split("/")
    );
    await mkdir(path.dirname(backup), { recursive: true });
    await copyFile(candidate, backup);
  }

  const temporary = path.join(
    path.dirname(candidate),
    `.${path.basename(candidate)}.${process.pid}.tmp`
  );
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, candidate);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function countFiles(directory: string): Promise<number> {
  let count = 0;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) count += await countFiles(absolute);
    else if (entry.isFile()) count += 1;
  }
  return count;
}

export async function installProjectNode(
  rootPath: string,
  modsDirectory: string,
  overwrite: boolean
): Promise<InstallResult> {
  const root = await resolveExistingRoot(rootPath);
  const modsRoot = await resolveExistingRoot(modsDirectory);
  if (!(await exists(path.join(root, "mod.lua")))) {
    throw new Error("Installation blocked: the project has no root mod.lua.");
  }

  const projectId = path.basename(root);
  const destination = path.join(modsRoot, projectId);
  const destinationExists = await exists(destination);
  if (destinationExists && !overwrite) {
    throw new Error(
      `Installation blocked: ${projectId} already exists in the target directory.`
    );
  }

  const temporaryContainer = await mkdtemp(
    path.join(modsRoot, ".tpf2-install-")
  );
  const temporary = path.join(temporaryContainer, "payload");
  let backupPath: string | undefined;
  try {
    await cp(root, temporary, {
      recursive: true,
      force: false,
      errorOnExist: true,
      filter: (source) => {
        const relative = path.relative(root, source);
        if (relative === "") return true;
        const firstPart = relative.split(path.sep)[0];
        return firstPart !== undefined && !INSTALL_EXCLUDES.has(firstPart);
      }
    });
    if (!(await exists(path.join(temporary, "mod.lua")))) {
      throw new Error("The staged installation does not contain mod.lua.");
    }
    if (destinationExists) {
      const backupRoot = path.join(modsRoot, ".tpf2-mod-studio-backups");
      await mkdir(backupRoot, { recursive: true });
      backupPath = path.join(backupRoot, `${projectId}-${timestamp()}`);
      await rename(destination, backupPath);
    }
    try {
      await rename(temporary, destination);
      await rm(temporaryContainer, { recursive: true, force: true });
    } catch (error) {
      if (
        backupPath !== undefined &&
        !(await exists(destination)) &&
        (await exists(backupPath))
      ) {
        await rename(backupPath, destination);
        backupPath = undefined;
      }
      throw error;
    }
    await access(path.join(destination, "mod.lua"));
    return {
      installedPath: destination,
      fileCount: await countFiles(destination),
      ...(backupPath === undefined ? {} : { backupPath })
    };
  } catch (error) {
    await rm(temporaryContainer, { recursive: true, force: true });
    throw error;
  }
}

export async function readTf2LogNode(logPath: string): Promise<string> {
  const resolved = await realpath(logPath);
  const metadata = await stat(resolved);
  if (!metadata.isFile()) throw new Error("The selected log path is not a file.");
  if (![".txt", ".log"].includes(path.extname(resolved).toLocaleLowerCase("en-US"))) {
    throw new Error("Only .txt and .log files can be opened as TF2 logs.");
  }
  if (metadata.size > MAX_LOG_BYTES) {
    throw new Error("The log exceeds the current 32 MiB analysis limit.");
  }
  return readFile(resolved, "utf8");
}
