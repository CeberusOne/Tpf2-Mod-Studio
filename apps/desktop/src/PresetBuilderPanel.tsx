import {
  buildModPresetLua,
  extractDependencyInfo,
  findModOrderViolations,
  parseModPreset,
  parseModRef,
  planModOrder,
  type InstalledMod,
  type InstalledModInfo,
  type ModOrderResult
} from "@tpf2-mod-studio/core";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  GripVertical,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
  Wand2,
  X
} from "lucide-react";
import {
  type DragEvent,
  useEffect,
  useMemo,
  useState
} from "react";
import { createPortal } from "react-dom";

import type { DesktopBridge, PresetInfo } from "./bridge";
import { useI18n } from "./i18n";
import "./PresetBuilderPanel.css";

export const PRESET_LIBRARY_DRAG_TYPE = "application/x-tpf2-library-mod";
export const PRESET_ADD_EVENT = "tpf2-mod-studio:preset-add";
export const PRESET_WORKSPACE_REQUEST_KEY =
  "tpf2-mod-studio.preset-workspace-request.v1";

export type PresetWorkspaceRequest =
  | { kind: "new"; name?: string }
  | { kind: "preset"; name: string; path: string }
  | {
      kind: "savegame";
      name: string;
      savePath: string;
      modIds: string[];
    };

interface Notice {
  tone: "success" | "error" | "neutral";
  message: string;
}

interface ActivePreset {
  name: string;
  path?: string;
  savePath?: string;
  explicitOrder: string[];
  preferredOrder: string[];
  refs: Record<string, string>;
  savedSignature: string;
}

interface PendingAddition {
  modId: string;
  explicitOrder: string[];
  preferredOrder: string[];
  plan: ModOrderResult;
  newlyRequired: string[];
}

function signature(name: string, order: readonly string[]): string {
  return `${name}\u0000${order.join("\u0000")}`;
}

function bareId(value: string): string {
  return parseModRef(value).id;
}

function normalizedId(value: string): string {
  return bareId(value).toLocaleLowerCase("en-US");
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function insertAt(values: readonly string[], value: string, index?: number): string[] {
  const next = values.filter((item) => item !== value);
  const target =
    index === undefined ? next.length : Math.max(0, Math.min(index, next.length));
  next.splice(target, 0, value);
  return next;
}

function reconcileOrder(
  preferred: readonly string[],
  planned: readonly string[]
): string[] {
  const allowed = new Set(planned);
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of preferred) {
    if (allowed.has(id) && !seen.has(id)) {
      next.push(id);
      seen.add(id);
    }
  }
  for (const id of planned) {
    if (!seen.has(id)) {
      next.push(id);
      seen.add(id);
    }
  }
  return next;
}

function presetRefFor(mod: InstalledMod): ReturnType<typeof parseModRef> {
  if (mod.source === "workshop" && /^\d+$/u.test(mod.id)) {
    return parseModRef(`*${mod.id}`);
  }
  if (mod.source === "priority") return parseModRef(`!${mod.id}`);
  return parseModRef(mod.id);
}

function majorVersionFor(id: string): number {
  const match = /_([0-9]+)$/u.exec(id);
  return match === null ? 1 : Number.parseInt(match[1] ?? "1", 10);
}

function readWorkspaceRequest(): PresetWorkspaceRequest | undefined {
  try {
    const raw = window.localStorage.getItem(PRESET_WORKSPACE_REQUEST_KEY);
    if (raw === null) return undefined;
    window.localStorage.removeItem(PRESET_WORKSPACE_REQUEST_KEY);
    const value = JSON.parse(raw) as Partial<PresetWorkspaceRequest>;
    if (value.kind === "new") {
      return {
        kind: "new",
        ...(typeof value.name === "string" ? { name: value.name } : {})
      };
    }
    if (
      value.kind === "preset" &&
      typeof value.name === "string" &&
      typeof value.path === "string"
    ) {
      return { kind: "preset", name: value.name, path: value.path };
    }
    if (
      value.kind === "savegame" &&
      typeof value.name === "string" &&
      typeof value.savePath === "string" &&
      Array.isArray(value.modIds)
    ) {
      return {
        kind: "savegame",
        name: value.name,
        savePath: value.savePath,
        modIds: value.modIds.filter((item): item is string => typeof item === "string")
      };
    }
  } catch {
    window.localStorage.removeItem(PRESET_WORKSPACE_REQUEST_KEY);
  }
  return undefined;
}

export function queuePresetWorkspaceRequest(request: PresetWorkspaceRequest): void {
  window.localStorage.setItem(PRESET_WORKSPACE_REQUEST_KEY, JSON.stringify(request));
}

export function requestAddToCurrentPreset(modId: string): void {
  window.dispatchEvent(
    new CustomEvent(PRESET_ADD_EVENT, { detail: { modId } })
  );
}

export default function PresetBuilderPanel({
  bridge,
  installedMods,
  native,
  onNotice,
  userDataPath
}: {
  bridge: DesktopBridge;
  installedMods: InstalledMod[];
  native: boolean;
  onNotice: (notice: Notice) => void;
  userDataPath: string | undefined;
}) {
  const { language } = useI18n();
  const copy =
    language === "de"
      ? {
          title: "Mod Preset Builder",
          noPreset: "Kein Preset geöffnet",
          noPresetHint:
            "Ziehe eine Mod hierher oder klicke bei einer Mod auf „Zum Preset“. Danach kannst du ein neues Preset anlegen oder ein bestehendes öffnen.",
          openPreset: "Preset öffnen",
          switchPreset: "Preset wechseln",
          closePreset: "Preset schließen",
          currentPreset: "Geöffnetes Preset",
          targetSave: "Ziel-Savegame",
          noSave: "Keinem Savegame direkt zugeordnet",
          autoArrange:
            "Abhängigkeiten automatisch hinzufügen und korrekt einsortieren",
          drop: "Mods hier ablegen",
          empty: "Noch keine Mods im geöffneten Preset.",
          autoDependency: "Automatische Abhängigkeit",
          save: "Preset speichern",
          saved: "Preset wurde gespeichert.",
          dirty: "Ungespeicherte Änderungen",
          clean: "Gespeichert",
          blocked:
            "Speichern ist blockiert, bis fehlende Abhängigkeiten und Reihenfolgefehler behoben sind.",
          missing: "Fehlende Abhängigkeiten",
          missingHint: "Diese Mods sind nicht installiert oder konnten nicht zugeordnet werden.",
          wrongOrder: "Falsche Reihenfolge",
          wrongOrderHint:
            "In der sichtbaren TF2-Liste muss die Abhängigkeit unter der Mod stehen, die sie benötigt.",
          repair: "Automatisch korrigieren",
          removeBlocked:
            "Diese Mod wird noch als Abhängigkeit benötigt. Entferne zuerst die davon abhängige Mod.",
          chooseTitle: "Preset auswählen",
          chooseHint:
            "Lege ein neues Preset an oder öffne eines der vorhandenen Presets.",
          newPreset: "Neues Preset",
          presetName: "Name des neuen Presets",
          create: "Anlegen",
          existing: "Vorhandene Presets",
          noneExisting: "Keine vorhandenen Presets gefunden.",
          cancel: "Abbrechen",
          dependencyTitle: "Abhängigkeiten erforderlich",
          dependencyIntro:
            "Die ausgewählte Mod benötigt weitere Mods. Der Builder kann installierte Abhängigkeiten automatisch hinzufügen und an die richtige Position setzen.",
          addAndSort: "Abhängigkeiten hinzufügen und sortieren",
          requiredInstalled: "Wird automatisch hinzugefügt",
          alreadyIncluded: "Bereits enthalten oder wird neu positioniert",
          missingRequired: "Nicht installiert – Preset bleibt blockiert",
          unverifiable: "Nicht automatisch prüfbar",
          requiredBy: "benötigt von",
          position: "TF2-Position",
          addedNotice:
            "Mod und Abhängigkeiten wurden dem geöffneten Preset hinzugefügt.",
          openedNotice: "Preset wurde geöffnet.",
          createdNotice: "Neues Preset wurde angelegt.",
          cannotOpen:
            "Der Preset Builder benötigt den erkannten TF2-Benutzerdatenordner."
        }
      : {
          title: "Mod Preset Builder",
          noPreset: "No preset open",
          noPresetHint:
            "Drag a mod here or click “Add to preset” on a mod. You can then create a new preset or open an existing one.",
          openPreset: "Open preset",
          switchPreset: "Switch preset",
          closePreset: "Close preset",
          currentPreset: "Open preset",
          targetSave: "Target savegame",
          noSave: "Not directly assigned to a savegame",
          autoArrange: "Automatically add and position dependencies",
          drop: "Drop mods here",
          empty: "The open preset does not contain any mods yet.",
          autoDependency: "Automatic dependency",
          save: "Save preset",
          saved: "Preset saved.",
          dirty: "Unsaved changes",
          clean: "Saved",
          blocked:
            "Saving is blocked until missing dependencies and order errors are resolved.",
          missing: "Missing dependencies",
          missingHint: "These mods are not installed or could not be resolved.",
          wrongOrder: "Incorrect order",
          wrongOrderHint:
            "In the visible TF2 list, a dependency must be below the mod that requires it.",
          repair: "Repair automatically",
          removeBlocked:
            "This mod is still required as a dependency. Remove the dependent mod first.",
          chooseTitle: "Choose preset",
          chooseHint: "Create a new preset or open an existing preset.",
          newPreset: "New preset",
          presetName: "New preset name",
          create: "Create",
          existing: "Existing presets",
          noneExisting: "No existing presets found.",
          cancel: "Cancel",
          dependencyTitle: "Dependencies required",
          dependencyIntro:
            "The selected mod requires additional mods. The builder can add installed dependencies and place them correctly.",
          addAndSort: "Add dependencies and sort",
          requiredInstalled: "Will be added automatically",
          alreadyIncluded: "Already included or will be repositioned",
          missingRequired: "Not installed — preset remains blocked",
          unverifiable: "Cannot be verified automatically",
          requiredBy: "required by",
          position: "TF2 position",
          addedNotice: "The mod and its dependencies were added to the open preset.",
          openedNotice: "Preset opened.",
          createdNotice: "New preset created.",
          cannotOpen: "The Preset Builder needs the detected TF2 user-data folder."
        };

  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [active, setActive] = useState<ActivePreset>();
  const [autoArrange, setAutoArrange] = useState(true);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [pendingModId, setPendingModId] = useState<string>();
  const [pendingAddition, setPendingAddition] = useState<PendingAddition>();
  const [busy, setBusy] = useState(false);

  const modInfos = useMemo<InstalledModInfo[]>(() => {
    const priorityIds = new Set(
      Object.entries(active?.refs ?? {})
        .filter(([, raw]) => raw.startsWith("!"))
        .map(([id]) => id)
    );
    return installedMods.map((mod) => {
      const info = extractDependencyInfo(mod.modLua ?? "");
      return {
        id: mod.id,
        source: priorityIds.has(mod.id) ? "priority" : mod.source,
        dependencies: info.dependencies,
        dependenciesAnyLoadOrder: info.anyLoadOrder
      };
    });
  }, [active?.refs, installedMods]);
  const byId = useMemo(
    () => new Map(installedMods.map((mod) => [mod.id, mod])),
    [installedMods]
  );
  const idLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const mod of installedMods) lookup.set(normalizedId(mod.id), mod.id);
    return lookup;
  }, [installedMods]);

  function matchInstalled(value: string): string | undefined {
    return byId.has(value) ? value : idLookup.get(normalizedId(value));
  }

  const plan = useMemo(
    () =>
      active === undefined
        ? undefined
        : planModOrder(
            modInfos,
            active.explicitOrder,
            active.preferredOrder
          ),
    [active, modInfos]
  );
  const builderOrder = useMemo(
    () =>
      active === undefined || plan === undefined
        ? []
        : autoArrange
          ? plan.order
          : reconcileOrder(active.preferredOrder, plan.order),
    [active, autoArrange, plan]
  );
  const orderViolations = useMemo(
    () => findModOrderViolations(modInfos, builderOrder),
    [builderOrder, modInfos]
  );
  const autoAdded = useMemo(
    () => new Set(plan?.addedForDependencies ?? []),
    [plan?.addedForDependencies]
  );
  const dirty =
    active !== undefined &&
    signature(active.name, builderOrder) !== active.savedSignature;

  async function refreshPresets(): Promise<PresetInfo[]> {
    if (userDataPath === undefined) {
      setPresets([]);
      return [];
    }
    const found = await bridge.listModPresets(userDataPath);
    setPresets(found);
    return found;
  }

  function activate(
    name: string,
    ids: readonly string[],
    options: {
      path?: string;
      savePath?: string;
      rawRefs?: readonly string[];
    } = {}
  ): ActivePreset {
    const matched = unique(
      ids
        .map((id) => matchInstalled(id))
        .filter((id): id is string => id !== undefined)
    );
    const refs: Record<string, string> = {};
    for (const raw of options.rawRefs ?? ids) {
      const id = matchInstalled(raw);
      if (id !== undefined) refs[id] = raw;
    }
    const nextPlan = planModOrder(modInfos, matched, matched);
    const order = nextPlan.order;
    const next: ActivePreset = {
      name,
      explicitOrder: matched,
      preferredOrder: order,
      refs,
      savedSignature:
        options.path !== undefined
          ? signature(name, matched)
          : options.savePath !== undefined
            ? ""
            : signature(name, order),
      ...(options.path === undefined ? {} : { path: options.path }),
      ...(options.savePath === undefined ? {} : { savePath: options.savePath })
    };
    setActive(next);
    setAutoArrange(true);
    return next;
  }

  async function openExisting(preset: PresetInfo): Promise<void> {
    setBusy(true);
    try {
      const entries = parseModPreset(await bridge.readModPreset(preset.path));
      const next = activate(
        preset.name,
        entries.map((entry) => entry.ref.raw),
        {
          path: preset.path,
          rawRefs: entries.map((entry) => entry.ref.raw)
        }
      );
      setChooserOpen(false);
      onNotice({ tone: "success", message: copy.openedNotice });
      if (pendingModId !== undefined) {
        setPendingModId(undefined);
        prepareAddition(pendingModId, next);
      }
    } catch (error) {
      onNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy(false);
    }
  }

  function createNew(): void {
    const name = newName.trim();
    if (name.length === 0) return;
    const next = activate(name, []);
    setNewName("");
    setChooserOpen(false);
    onNotice({ tone: "success", message: copy.createdNotice });
    if (pendingModId !== undefined) {
      setPendingModId(undefined);
      prepareAddition(pendingModId, next);
    }
  }

  function openChooser(modId?: string): void {
    if (userDataPath === undefined) {
      onNotice({ tone: "error", message: copy.cannotOpen });
      return;
    }
    setPendingModId(modId);
    setChooserOpen(true);
    void refreshPresets().catch((error) =>
      onNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      })
    );
  }

  function prepareAddition(modId: string, base = active): void {
    const resolved = matchInstalled(modId);
    if (resolved === undefined) return;
    if (base === undefined) {
      openChooser(resolved);
      return;
    }
    const currentPlan = planModOrder(
      modInfos,
      base.explicitOrder,
      base.preferredOrder
    );
    const currentOrder = autoArrange
      ? currentPlan.order
      : reconcileOrder(base.preferredOrder, currentPlan.order);
    const explicitOrder = unique([...base.explicitOrder, resolved]);
    const preferredOrder = insertAt(currentOrder, resolved);
    const nextPlan = planModOrder(modInfos, explicitOrder, preferredOrder);
    const currentSet = new Set(currentOrder);
    const newlyRequired = nextPlan.addedForDependencies.filter(
      (id) => !currentSet.has(id)
    );
    const selectedInfo = modInfos.find((mod) => mod.id === resolved);
    const needsDialog =
      (selectedInfo?.dependencies.length ?? 0) > 0 ||
      newlyRequired.length > 0 ||
      nextPlan.missing.length > 0 ||
      nextPlan.unverifiable.length > 0;
    const pending: PendingAddition = {
      modId: resolved,
      explicitOrder,
      preferredOrder,
      plan: nextPlan,
      newlyRequired
    };
    if (needsDialog) {
      setPendingAddition(pending);
      return;
    }
    commitAddition(pending, base);
  }

  function commitAddition(next: PendingAddition, base = active): void {
    if (base === undefined) return;
    setActive({
      ...base,
      explicitOrder: next.explicitOrder,
      preferredOrder: next.plan.order
    });
    setAutoArrange(true);
    setPendingAddition(undefined);
    onNotice({ tone: "success", message: copy.addedNotice });
  }

  function move(id: string, targetIndex: number): void {
    if (active === undefined) return;
    setAutoArrange(false);
    setActive({
      ...active,
      preferredOrder: insertAt(builderOrder, id, targetIndex)
    });
  }

  function remove(id: string): void {
    if (active === undefined || plan === undefined) return;
    const required = plan.findings.some(
      (finding) =>
        finding.kind === "satisfied" &&
        finding.resolvedTo === id &&
        finding.dependent !== id &&
        builderOrder.includes(finding.dependent)
    );
    if (required) {
      onNotice({ tone: "neutral", message: copy.removeBlocked });
      return;
    }
    const explicitOrder = active.explicitOrder.filter((item) => item !== id);
    const preferredOrder = active.preferredOrder.filter((item) => item !== id);
    const nextPlan = planModOrder(modInfos, explicitOrder, preferredOrder);
    const refs = { ...active.refs };
    delete refs[id];
    setActive({
      ...active,
      explicitOrder,
      preferredOrder: autoArrange ? nextPlan.order : preferredOrder,
      refs
    });
  }

  function repairOrder(): void {
    if (active === undefined || plan === undefined) return;
    setActive({ ...active, preferredOrder: plan.order });
    setAutoArrange(true);
  }

  async function savePreset(): Promise<void> {
    if (
      active === undefined ||
      plan === undefined ||
      userDataPath === undefined ||
      builderOrder.length === 0 ||
      plan.missing.length > 0 ||
      plan.cycles.length > 0 ||
      orderViolations.length > 0
    ) {
      return;
    }
    setBusy(true);
    try {
      const lua = buildModPresetLua(
        builderOrder.map((id) => {
          const mod = byId.get(id);
          const preserved = active.refs[id];
          return {
            ref:
              preserved !== undefined
                ? parseModRef(preserved)
                : mod === undefined
                  ? parseModRef(id)
                  : presetRefFor(mod),
            majorVersion: majorVersionFor(id),
            ...(mod?.displayName === undefined ? {} : { name: mod.displayName })
          };
        })
      );
      const path = await bridge.writeModPreset(userDataPath, active.name, lua);
      const refs = Object.fromEntries(
        builderOrder.map((id) => {
          const mod = byId.get(id);
          return [
            id,
            active.refs[id] ??
              (mod === undefined ? id : presetRefFor(mod).raw)
          ];
        })
      );
      setActive({
        ...active,
        path,
        preferredOrder: builderOrder,
        refs,
        savedSignature: signature(active.name, builderOrder)
      });
      await refreshPresets();
      onNotice({ tone: "success", message: copy.saved });
    } catch (error) {
      onNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(event: DragEvent, targetIndex?: number): void {
    event.preventDefault();
    const builderId = event.dataTransfer
      .getData("application/x-tpf2-preset-mod")
      .trim();
    if (builderId.length > 0) {
      move(builderId, targetIndex ?? builderOrder.length);
      return;
    }
    const libraryId =
      event.dataTransfer.getData(PRESET_LIBRARY_DRAG_TYPE).trim() ||
      event.dataTransfer.getData("text/plain").trim();
    if (libraryId.length > 0) prepareAddition(libraryId);
  }

  useEffect(() => {
    const listener = (event: Event): void => {
      const detail = (event as CustomEvent<{ modId?: string }>).detail;
      if (typeof detail?.modId === "string") prepareAddition(detail.modId);
    };
    window.addEventListener(PRESET_ADD_EVENT, listener);
    return () => window.removeEventListener(PRESET_ADD_EVENT, listener);
  });

  useEffect(() => {
    const request = readWorkspaceRequest();
    if (request === undefined) return;
    if (request.kind === "new") {
      setNewName(request.name ?? "");
      openChooser();
      return;
    }
    if (request.kind === "savegame") {
      activate(request.name, request.modIds, {
        savePath: request.savePath,
        rawRefs: request.modIds
      });
      return;
    }
    void openExisting({
      name: request.name,
      path: request.path,
      modifiedMs: 0
    });
    // A queued request is consumed once when the library opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const presetBlocked =
    plan !== undefined &&
    (plan.missing.length > 0 ||
      plan.cycles.length > 0 ||
      orderViolations.length > 0);

  return (
    <>
      <aside
        className={`docked-preset-builder ${active === undefined ? "is-empty" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = active === undefined ? "copy" : "move";
        }}
        onDrop={(event) => handleDrop(event)}
      >
        <div className="docked-preset-heading">
          <div>
            <span className="eyebrow">TF2</span>
            <h3>{copy.title}</h3>
          </div>
          <button
            className="secondary-button compact-button"
            onClick={() => openChooser()}
            type="button"
          >
            <ChevronDown size={15} />
            {active === undefined ? copy.openPreset : copy.switchPreset}
          </button>
        </div>

        {active === undefined ? (
          <div className="docked-preset-empty">
            <Plus size={30} />
            <strong>{copy.noPreset}</strong>
            <p>{copy.noPresetHint}</p>
            <button className="primary-button" onClick={() => openChooser()} type="button">
              <Plus size={16} />
              {copy.openPreset}
            </button>
          </div>
        ) : (
          <>
            <div className="active-preset-meta">
              <div>
                <span>{copy.currentPreset}</span>
                <strong>{active.name}</strong>
                <small className={dirty ? "is-dirty" : "is-clean"}>
                  {dirty ? copy.dirty : copy.clean}
                </small>
              </div>
              <button
                aria-label={copy.closePreset}
                className="icon-button"
                onClick={() => setActive(undefined)}
                title={copy.closePreset}
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            <div className="active-preset-save">
              <span>{copy.targetSave}</span>
              <small>{active.savePath ?? copy.noSave}</small>
            </div>

            <label className="preset-auto-toggle">
              <input
                checked={autoArrange}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setAutoArrange(enabled);
                  if (enabled && plan !== undefined) {
                    setActive((current) =>
                      current === undefined
                        ? current
                        : { ...current, preferredOrder: plan.order }
                    );
                  }
                }}
                type="checkbox"
              />
              <span>{copy.autoArrange}</span>
            </label>

            {plan !== undefined && plan.missing.length > 0 ? (
              <div className="preset-builder-issue warning">
                <TriangleAlert size={16} />
                <div>
                  <strong>{copy.missing}</strong>
                  <p>{copy.missingHint}</p>
                  {plan.missing.map((id) => <code key={id}>{id}</code>)}
                </div>
              </div>
            ) : null}

            {orderViolations.length > 0 ? (
              <div className="preset-builder-issue warning">
                <TriangleAlert size={16} />
                <div>
                  <strong>{copy.wrongOrder}</strong>
                  <p>{copy.wrongOrderHint}</p>
                  {orderViolations.map((violation) => (
                    <code key={`${violation.dependent}:${violation.dependency}`}>
                      {violation.dependency} ({violation.dependencyPosition}) → {violation.dependent} ({violation.dependentPosition})
                    </code>
                  ))}
                  <button className="secondary-button" onClick={repairOrder} type="button">
                    <Wand2 size={15} />
                    {copy.repair}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="docked-preset-dropzone">
              {builderOrder.length === 0 ? (
                <p>{copy.empty}</p>
              ) : (
                builderOrder.map((id, index) => {
                  const mod = byId.get(id);
                  return (
                    <div
                      className={`docked-preset-row ${autoAdded.has(id) ? "is-dependency" : ""}`}
                      draggable
                      key={id}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "application/x-tpf2-preset-mod",
                          id
                        );
                      }}
                      onDrop={(event) => {
                        event.stopPropagation();
                        handleDrop(event, index);
                      }}
                    >
                      <span className="preset-position">{index + 1}</span>
                      <GripVertical size={15} />
                      <div>
                        <strong>{mod?.displayName ?? id}</strong>
                        <code>{id}</code>
                        {autoAdded.has(id) ? (
                          <small>{copy.autoDependency}</small>
                        ) : null}
                      </div>
                      <button
                        aria-label={`${copy.closePreset}: ${mod?.displayName ?? id}`}
                        className="icon-button"
                        onClick={() => remove(id)}
                        type="button"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })
              )}
              <span className="docked-drop-label">{copy.drop}</span>
            </div>

            {presetBlocked ? <p className="preset-blocked-note">{copy.blocked}</p> : null}

            <button
              className="primary-button docked-preset-save-button"
              disabled={
                !native ||
                busy ||
                !dirty ||
                builderOrder.length === 0 ||
                presetBlocked ||
                userDataPath === undefined
              }
              onClick={() => void savePreset()}
              type="button"
            >
              <Save size={16} />
              {copy.save}
            </button>
          </>
        )}
      </aside>

      {chooserOpen
        ? createPortal(
            <div className="modal-backdrop" role="presentation">
              <div aria-labelledby="preset-chooser-title" aria-modal="true" className="modal preset-chooser-modal" role="dialog">
                <div className="modal-heading">
                  <div>
                    <span className="eyebrow">TF2</span>
                    <h2 id="preset-chooser-title">{copy.chooseTitle}</h2>
                  </div>
                  <button className="icon-button" onClick={() => setChooserOpen(false)} type="button">
                    <X size={18} />
                  </button>
                </div>
                <p>{copy.chooseHint}</p>

                <section className="preset-choice-section">
                  <strong>{copy.newPreset}</strong>
                  <div className="preset-new-row">
                    <input
                      autoFocus
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder={copy.presetName}
                      value={newName}
                    />
                    <button
                      className="primary-button"
                      disabled={newName.trim().length === 0}
                      onClick={createNew}
                      type="button"
                    >
                      <Plus size={16} />
                      {copy.create}
                    </button>
                  </div>
                </section>

                <section className="preset-choice-section">
                  <strong>{copy.existing}</strong>
                  <div className="preset-existing-list">
                    {presets.length === 0 ? (
                      <p>{copy.noneExisting}</p>
                    ) : (
                      presets.map((preset) => (
                        <button
                          className="preset-existing-row"
                          disabled={busy}
                          key={preset.path}
                          onClick={() => void openExisting(preset)}
                          type="button"
                        >
                          <Save size={15} />
                          <span>{preset.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                </section>

                <div className="modal-actions">
                  <button className="secondary-button" onClick={() => setChooserOpen(false)} type="button">
                    {copy.cancel}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {pendingAddition === undefined
        ? null
        : createPortal(
            <div className="modal-backdrop" role="presentation">
              <div aria-labelledby="preset-dependency-title" aria-modal="true" className="modal dependency-modal" role="dialog">
                <div className="modal-heading">
                  <div>
                    <span className="eyebrow">
                      {byId.get(pendingAddition.modId)?.displayName ?? pendingAddition.modId}
                    </span>
                    <h2 id="preset-dependency-title">{copy.dependencyTitle}</h2>
                  </div>
                  <button className="icon-button" onClick={() => setPendingAddition(undefined)} type="button">
                    <X size={18} />
                  </button>
                </div>
                <p>{copy.dependencyIntro}</p>

                {pendingAddition.newlyRequired.length > 0 ? (
                  <div className="dependency-dialog-group">
                    <strong>{copy.requiredInstalled}</strong>
                    {pendingAddition.newlyRequired.map((id) => (
                      <div className="dependency-dialog-row" key={id}>
                        <CheckCircle2 size={15} />
                        <span>{byId.get(id)?.displayName ?? id}</span>
                        <code>{id}</code>
                        <small>
                          {copy.position}: {pendingAddition.plan.order.indexOf(id) + 1}
                        </small>
                      </div>
                    ))}
                  </div>
                ) : null}

                {pendingAddition.plan.findings.some(
                  (finding) => finding.kind === "satisfied"
                ) ? (
                  <div className="dependency-dialog-group">
                    <strong>{copy.alreadyIncluded}</strong>
                    {pendingAddition.plan.findings
                      .filter(
                        (finding) =>
                          finding.kind === "satisfied" &&
                          finding.resolvedTo !== undefined
                      )
                      .map((finding) => (
                        <div className="dependency-dialog-row" key={`${finding.dependent}:${finding.declared}`}>
                          <CheckCircle2 size={15} />
                          <span>{finding.resolvedTo}</span>
                          <small>
                            {copy.requiredBy} {finding.dependent}
                          </small>
                        </div>
                      ))}
                  </div>
                ) : null}

                {pendingAddition.plan.missing.length > 0 ? (
                  <div className="dependency-dialog-group is-warning">
                    <strong>{copy.missingRequired}</strong>
                    {pendingAddition.plan.missing.map((id) => (
                      <div className="dependency-dialog-row" key={id}>
                        <TriangleAlert size={15} />
                        <code>{id}</code>
                      </div>
                    ))}
                  </div>
                ) : null}

                {pendingAddition.plan.unverifiable.length > 0 ? (
                  <div className="dependency-dialog-group is-neutral">
                    <strong>{copy.unverifiable}</strong>
                    {pendingAddition.plan.unverifiable.map((finding) => (
                      <div className="dependency-dialog-row" key={`${finding.dependent}:${finding.declared}`}>
                        <AlertCircle size={15} />
                        <code>{finding.declared}</code>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="modal-actions">
                  <button className="secondary-button" onClick={() => setPendingAddition(undefined)} type="button">
                    {copy.cancel}
                  </button>
                  <button className="primary-button" onClick={() => commitAddition(pendingAddition)} type="button">
                    <Wand2 size={16} />
                    {copy.addAndSort}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
    </>
  );
}
