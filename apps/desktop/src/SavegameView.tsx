import {
  buildModPresetLua,
  extractDependencyInfo,
  findModOrderViolations,
  parseModPreset,
  parseModRef,
  planModOrder,
  type DependencyFinding,
  type InstalledMod,
  type InstalledModInfo,
  type ModOrderResult
} from "@tpf2-mod-studio/core";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  GripVertical,
  Plus,
  Save,
  Search,
  Trash2,
  TriangleAlert,
  Wand2,
  X
} from "lucide-react";
import {
  type DragEvent,
  useMemo,
  useState
} from "react";
import { createPortal } from "react-dom";

import type { DesktopBridge, PresetInfo, SavegameInfo } from "./bridge";
import { useI18n } from "./i18n";
import "./SavegameView.css";

interface Notice {
  tone: "success" | "error" | "neutral";
  message: string;
}

interface PendingAddition {
  modId: string;
  explicitOrder: string[];
  preferredOrder: string[];
  plan: ModOrderResult;
  newlyRequired: string[];
}

const LIBRARY_DRAG_TYPE = "application/x-tpf2-library-mod";
const BUILDER_DRAG_TYPE = "application/x-tpf2-preset-mod";

/** Strip the `!`/`*` prefix so a preset id matches an installed folder id. */
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
  const target = index === undefined ? next.length : Math.max(0, Math.min(index, next.length));
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

function draggedValue(event: DragEvent, type: string): string | undefined {
  const value = event.dataTransfer.getData(type).trim();
  return value.length === 0 ? undefined : value;
}

export default function SavegameView({
  bridge,
  installedMods,
  native,
  onNotice,
  onScanLibrary,
  userDataPath
}: {
  bridge: DesktopBridge;
  installedMods: InstalledMod[];
  native: boolean;
  onNotice: (notice: Notice) => void;
  onScanLibrary: () => void;
  userDataPath: string | undefined;
}) {
  const { language, t } = useI18n();
  const copy = language === "de"
    ? {
        library: "Mod-Bibliothek",
        libraryHint: "Mods in den Preset Builder ziehen oder mit + hinzufügen.",
        search: "Mods durchsuchen …",
        builder: "Mod Preset Builder",
        builderHint: "Die Reihenfolge entspricht der TF2-Modliste von oben nach unten.",
        drop: "Mod hier ablegen",
        selectedSave: "Ziel-Savegame",
        noSave: "Kein Savegame ausgewählt – der Preset kann trotzdem gespeichert werden.",
        autoArrange: "Abhängigkeiten automatisch hinzufügen und korrekt sortieren",
        autoFix: "Abhängigkeiten automatisch ergänzen und Reihenfolge reparieren",
        manualOrder: "Manuell angeordnete Liste",
        dependency: "Automatische Abhängigkeit",
        dependencyDialog: "Abhängigkeiten erforderlich",
        dependencyIntro: "Diese Mod benötigt weitere Mods. Sie müssen im Preset enthalten und korrekt positioniert sein.",
        installedRequired: "Wird automatisch hinzugefügt",
        alreadyPresent: "Bereits enthalten oder wird neu positioniert",
        missingRequired: "Nicht installiert – Preset bleibt blockiert",
        unverifiable: "Nicht automatisch prüfbar",
        cancel: "Abbrechen",
        addAndSort: "Abhängigkeiten hinzufügen und sortieren",
        removeBlocked: "Diese Mod wird weiterhin als Abhängigkeit benötigt. Entferne zuerst die abhängige Mod.",
        orderProblem: "Falsche Ladereihenfolge",
        orderProblemHint: "In der TF2-Liste muss die Abhängigkeit unter der abhängigen Mod stehen.",
        presetBlocked: "Der Preset kann erst gespeichert werden, wenn fehlende Abhängigkeiten und Reihenfolgefehler behoben sind.",
        firstShown: "Position in TF2",
        loadFirst: "wird intern vorher geladen",
        add: "Zum Preset hinzufügen",
        remove: "Aus Preset entfernen",
        autoAddedNotice: "Abhängigkeiten wurden automatisch ergänzt und einsortiert.",
        orderFixedNotice: "Die Reihenfolge wurde entsprechend der TF2-Ladelogik korrigiert.",
        emptyBuilder: "Ziehe Mods aus der Bibliothek in diesen Bereich.",
        mods: "Mods",
        gameOrder: "TF2-Reihenfolge",
        requiredBy: "benötigt von"
      }
    : {
        library: "Mod Library",
        libraryHint: "Drag mods into the Preset Builder or use the + button.",
        search: "Search mods …",
        builder: "Mod Preset Builder",
        builderHint: "The order matches the TF2 mod list from top to bottom.",
        drop: "Drop mod here",
        selectedSave: "Target savegame",
        noSave: "No savegame selected — the preset can still be saved.",
        autoArrange: "Automatically add dependencies and place them correctly",
        autoFix: "Add dependencies and repair order automatically",
        manualOrder: "Manually arranged list",
        dependency: "Automatic dependency",
        dependencyDialog: "Dependencies required",
        dependencyIntro: "This mod requires additional mods. They must be included and positioned correctly in the preset.",
        installedRequired: "Will be added automatically",
        alreadyPresent: "Already included or will be repositioned",
        missingRequired: "Not installed — preset remains blocked",
        unverifiable: "Cannot be verified automatically",
        cancel: "Cancel",
        addAndSort: "Add dependencies and sort",
        removeBlocked: "This mod is still required as a dependency. Remove the dependent mod first.",
        orderProblem: "Incorrect load order",
        orderProblemHint: "In the TF2 list, the dependency must be below the dependent mod.",
        presetBlocked: "The preset cannot be saved until missing dependencies and order errors are resolved.",
        firstShown: "Position in TF2",
        loadFirst: "loads earlier internally",
        add: "Add to preset",
        remove: "Remove from preset",
        autoAddedNotice: "Dependencies were added and positioned automatically.",
        orderFixedNotice: "The order was corrected to match TF2 loading logic.",
        emptyBuilder: "Drag mods from the library into this area.",
        mods: "Mods",
        gameOrder: "TF2 order",
        requiredBy: "required by"
      };

  const [savegames, setSavegames] = useState<SavegameInfo[]>();
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [selectedSave, setSelectedSave] = useState<string>();
  const [explicitOrder, setExplicitOrder] = useState<string[]>([]);
  const [preferredOrder, setPreferredOrder] = useState<string[]>([]);
  const [presetName, setPresetName] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [autoArrange, setAutoArrange] = useState(true);
  const [pending, setPending] = useState<PendingAddition>();
  const [busy, setBusy] = useState(false);

  const modInfos = useMemo<InstalledModInfo[]>(
    () =>
      installedMods.map((mod) => {
        const dependencyInfo = extractDependencyInfo(mod.modLua ?? "");
        return {
          id: mod.id,
          source: mod.source,
          dependencies: dependencyInfo.dependencies,
          dependenciesAnyLoadOrder: dependencyInfo.anyLoadOrder
        };
      }),
    [installedMods]
  );

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
    () => planModOrder(modInfos, explicitOrder, preferredOrder),
    [explicitOrder, modInfos, preferredOrder]
  );
  const builderOrder = useMemo(
    () => autoArrange ? plan.order : reconcileOrder(preferredOrder, plan.order),
    [autoArrange, plan.order, preferredOrder]
  );
  const orderViolations = useMemo(
    () => findModOrderViolations(modInfos, builderOrder),
    [builderOrder, modInfos]
  );
  const builderSet = useMemo(() => new Set(builderOrder), [builderOrder]);
  const autoAddedSet = useMemo(
    () => new Set(plan.addedForDependencies),
    [plan.addedForDependencies]
  );

  const visibleLibrary = useMemo(() => {
    const query = libraryQuery.trim().toLocaleLowerCase(language === "de" ? "de" : "en");
    return [...installedMods]
      .filter((mod) => {
        if (query.length === 0) return true;
        return `${mod.displayName ?? ""} ${mod.id} ${mod.source}`
          .toLocaleLowerCase(language === "de" ? "de" : "en")
          .includes(query);
      })
      .sort((left, right) =>
        (left.displayName ?? left.id).localeCompare(
          right.displayName ?? right.id,
          language === "de" ? "de" : "en"
        )
      );
  }, [installedMods, language, libraryQuery]);

  const selectedSaveName = useMemo(
    () => savegames?.find((save) => save.path === selectedSave)?.name,
    [savegames, selectedSave]
  );

  async function refresh(): Promise<void> {
    if (userDataPath === undefined) return;
    setBusy(true);
    try {
      const [saves, presetList] = await Promise.all([
        bridge.listSavegames(userDataPath),
        bridge.listModPresets(userDataPath)
      ]);
      setSavegames(saves);
      setPresets(presetList);
    } catch (error) {
      onNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy(false);
    }
  }

  function loadOrderedSelection(ids: readonly string[], name: string, savePath?: string): void {
    const matched = unique(
      ids.map((candidate) => matchInstalled(candidate)).filter(
        (id): id is string => id !== undefined
      )
    );
    const nextPlan = planModOrder(modInfos, matched, matched);
    setSelectedSave(savePath);
    setExplicitOrder(matched);
    setPreferredOrder(autoArrange ? nextPlan.order : matched);
    setPresetName(name);
  }

  async function loadFromSave(save: SavegameInfo): Promise<void> {
    setBusy(true);
    try {
      const result = await bridge.readSavegameMods(save.path);
      loadOrderedSelection(result.mods, save.name, save.path);
      const matched = result.mods.filter((candidate) => matchInstalled(candidate) !== undefined);
      onNotice({
        tone: matched.length === 0 ? "neutral" : "success",
        message: t("saveModsRead", {
          matched: matched.length,
          candidates: result.mods.length
        })
      });
    } catch (error) {
      onNotice({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function loadFromPreset(preset: PresetInfo): Promise<void> {
    setBusy(true);
    try {
      const entries = parseModPreset(await bridge.readModPreset(preset.path));
      loadOrderedSelection(entries.map((entry) => entry.ref.raw), preset.name);
      const matched = entries.filter((entry) => matchInstalled(entry.ref.raw) !== undefined);
      onNotice({
        tone: "success",
        message: t("presetLoaded", { matched: matched.length, total: entries.length })
      });
    } catch (error) {
      onNotice({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function savePreset(): Promise<void> {
    if (
      userDataPath === undefined ||
      builderOrder.length === 0 ||
      plan.cycles.length > 0 ||
      plan.missing.length > 0 ||
      orderViolations.length > 0
    ) return;

    setBusy(true);
    try {
      const lua = buildModPresetLua(
        builderOrder.map((id) => {
          const mod = byId.get(id);
          return {
            ref: mod === undefined ? parseModRef(id) : presetRefFor(mod),
            majorVersion: majorVersionFor(id),
            ...(mod?.displayName === undefined ? {} : { name: mod.displayName })
          };
        })
      );
      const written = await bridge.writeModPreset(
        userDataPath,
        presetName.trim().length > 0 ? presetName : "tpf2-mod-studio",
        lua
      );
      onNotice({ tone: "success", message: t("presetWritten", { path: written }) });
      await refresh();
    } catch (error) {
      onNotice({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  function commitAddition(next: PendingAddition): void {
    setExplicitOrder(next.explicitOrder);
    setPreferredOrder(next.plan.order);
    setPending(undefined);
    if (next.newlyRequired.length > 0) {
      onNotice({ tone: "success", message: copy.autoAddedNotice });
    }
  }

  function requestAdd(modId: string, targetIndex?: number): void {
    const resolved = matchInstalled(modId);
    if (resolved === undefined) return;
    const nextExplicit = unique([...explicitOrder, resolved]);
    const candidatePreferred = insertAt(builderOrder, resolved, targetIndex);
    const nextPlan = planModOrder(modInfos, nextExplicit, candidatePreferred);
    const newlyRequired = nextPlan.addedForDependencies.filter(
      (id) => !builderSet.has(id)
    );
    const direct = modInfos.find((mod) => mod.id === resolved);
    const hasDependencyDeclaration = (direct?.dependencies.length ?? 0) > 0;

    const next: PendingAddition = {
      modId: resolved,
      explicitOrder: nextExplicit,
      preferredOrder: candidatePreferred,
      plan: nextPlan,
      newlyRequired
    };

    if (
      hasDependencyDeclaration ||
      newlyRequired.length > 0 ||
      nextPlan.missing.length > 0 ||
      nextPlan.unverifiable.length > 0
    ) {
      setPending(next);
      return;
    }

    setExplicitOrder(nextExplicit);
    setPreferredOrder(autoArrange ? nextPlan.order : candidatePreferred);
  }

  function removeMod(id: string): void {
    const stillRequired = plan.findings.some(
      (finding) =>
        finding.kind === "satisfied" &&
        finding.resolvedTo === id &&
        finding.dependent !== id &&
        builderSet.has(finding.dependent)
    );
    if (stillRequired) {
      onNotice({ tone: "neutral", message: copy.removeBlocked });
      return;
    }
    const nextExplicit = explicitOrder.filter((item) => item !== id);
    const nextPreferred = preferredOrder.filter((item) => item !== id);
    const nextPlan = planModOrder(modInfos, nextExplicit, nextPreferred);
    setExplicitOrder(nextExplicit);
    setPreferredOrder(autoArrange ? nextPlan.order : nextPreferred);
  }

  function moveBuilderMod(sourceId: string, targetIndex: number): void {
    const next = insertAt(builderOrder, sourceId, targetIndex);
    setAutoArrange(false);
    setPreferredOrder(next);
  }

  function handleBuilderDrop(event: DragEvent, targetIndex?: number): void {
    event.preventDefault();
    const builderId = draggedValue(event, BUILDER_DRAG_TYPE);
    if (builderId !== undefined) {
      moveBuilderMod(builderId, targetIndex ?? builderOrder.length);
      return;
    }
    const libraryId = draggedValue(event, LIBRARY_DRAG_TYPE) ?? draggedValue(event, "text/plain");
    if (libraryId !== undefined) requestAdd(libraryId, targetIndex);
  }

  function repairOrder(): void {
    setPreferredOrder(plan.order);
    setAutoArrange(true);
    onNotice({ tone: "success", message: copy.orderFixedNotice });
  }

  const grouped = useMemo(() => {
    const map = new Map<string, DependencyFinding[]>();
    for (const finding of plan.findings) {
      const list = map.get(finding.kind) ?? [];
      list.push(finding);
      map.set(finding.kind, list);
    }
    return map;
  }, [plan.findings]);

  if (installedMods.length === 0) {
    return (
      <div className="setup-page">
        <div className="section-intro">
          <div>
            <span className="eyebrow">{t("navSavegames")}</span>
            <h2>{t("saveTitle")}</h2>
            <p>{t("saveNeedsLibrary")}</p>
          </div>
          <button className="primary-button" disabled={!native} onClick={onScanLibrary} type="button">
            <Search size={17} />
            {t("scanModLibrary")}
          </button>
        </div>
      </div>
    );
  }

  const presetBlocked =
    plan.cycles.length > 0 ||
    plan.missing.length > 0 ||
    orderViolations.length > 0;

  return (
    <div className="setup-page savegame-page">
      <div className="section-intro">
        <div>
          <span className="eyebrow">{t("navSavegames")}</span>
          <h2>{t("saveTitle")}</h2>
          <p>{t("saveDescription")}</p>
        </div>
        <button
          className="primary-button"
          disabled={!native || busy || userDataPath === undefined}
          onClick={() => void refresh()}
          type="button"
        >
          <Search size={17} />
          {t("saveRefresh")}
        </button>
      </div>

      <div className="savegame-workbench">
        <section className="save-sources savegame-panel">
          <h3>{t("saveGames")}</h3>
          {savegames === undefined ? (
            <p className="mod-editor-hint">{t("saveRefreshHint")}</p>
          ) : savegames.length === 0 ? (
            <p className="mod-editor-hint">{t("saveNone")}</p>
          ) : (
            <div className="savegame-scroll-list">
              {savegames.slice(0, 80).map((save) => (
                <button
                  className={`save-row ${selectedSave === save.path ? "is-active" : ""}`}
                  key={save.path}
                  onClick={() => void loadFromSave(save)}
                  type="button"
                >
                  <Download size={14} />
                  <span>{save.name}</span>
                  <small>{Math.round(save.size / 1024 / 1024)} MB</small>
                </button>
              ))}
            </div>
          )}

          <h3>{t("savePresets")}</h3>
          {presets.length === 0 ? (
            <p className="mod-editor-hint">{t("savePresetsNone")}</p>
          ) : (
            <div className="savegame-scroll-list presets-list">
              {presets.map((preset) => (
                <button className="save-row" key={preset.path} onClick={() => void loadFromPreset(preset)} type="button">
                  <Save size={14} />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="preset-library savegame-panel">
          <div className="preset-panel-heading">
            <div>
              <h3>{copy.library}</h3>
              <p>{copy.libraryHint}</p>
            </div>
            <span className="preset-count">{visibleLibrary.length}</span>
          </div>
          <label className="preset-search">
            <Search size={15} />
            <input
              onChange={(event) => setLibraryQuery(event.target.value)}
              placeholder={copy.search}
              value={libraryQuery}
            />
          </label>
          <div className="preset-library-list">
            {visibleLibrary.map((mod) => {
              const selected = builderSet.has(mod.id);
              return (
                <div
                  className={`preset-library-row ${selected ? "is-selected" : ""}`}
                  draggable
                  key={mod.path}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData(LIBRARY_DRAG_TYPE, mod.id);
                    event.dataTransfer.setData("text/plain", mod.id);
                  }}
                >
                  <GripVertical aria-hidden="true" size={15} />
                  <div className="preset-mod-copy" title={mod.path}>
                    <strong>{mod.displayName ?? mod.id}</strong>
                    <code>{mod.id}</code>
                    <small>{mod.source}</small>
                  </div>
                  <button
                    aria-label={`${copy.add}: ${mod.displayName ?? mod.id}`}
                    className="icon-button preset-add-button"
                    disabled={selected}
                    onClick={() => requestAdd(mod.id)}
                    title={copy.add}
                    type="button"
                  >
                    {selected ? <CheckCircle2 size={16} /> : <Plus size={16} />}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="save-plan preset-builder savegame-panel">
          <div className="preset-panel-heading builder-heading">
            <div>
              <h3>{copy.builder}</h3>
              <p>{copy.builderHint}</p>
            </div>
            <span className="preset-count">{builderOrder.length}</span>
          </div>

          <div className="preset-target-save">
            <strong>{copy.selectedSave}</strong>
            <span>{selectedSaveName ?? copy.noSave}</span>
          </div>

          <label className="field save-name">
            <span>{t("savePresetName")}</span>
            <input
              onChange={(event) => setPresetName(event.target.value)}
              placeholder="tpf2-mod-studio"
              value={presetName}
            />
          </label>

          <label className="preset-auto-toggle">
            <input
              checked={autoArrange}
              onChange={(event) => {
                const enabled = event.target.checked;
                setAutoArrange(enabled);
                if (enabled) setPreferredOrder(plan.order);
              }}
              type="checkbox"
            />
            <span>{copy.autoArrange}</span>
          </label>

          <div className="save-summary">
            <span>{copy.gameOrder}: {builderOrder.length} {copy.mods}</span>
            {plan.addedForDependencies.length > 0 ? (
              <span className="save-added">{t("saveAdded", { count: plan.addedForDependencies.length })}</span>
            ) : null}
            {plan.missing.length > 0 ? (
              <span className="save-missing">{t("saveMissing", { count: plan.missing.length })}</span>
            ) : null}
          </div>

          {plan.cycles.length > 0 ? (
            <div className="save-issue error">
              <AlertCircle size={16} />
              <div>
                <strong>{t("saveCycle")}</strong>
                {plan.cycles.map((cycle) => <code key={cycle.join(">")}>{cycle.join(" → ")}</code>)}
              </div>
            </div>
          ) : null}

          {plan.missing.length > 0 ? (
            <div className="save-issue warning">
              <TriangleAlert size={16} />
              <div>
                <strong>{t("saveMissingTitle")}</strong>
                <p>{t("saveMissingHint")}</p>
                {(grouped.get("missing") ?? []).map((finding) => (
                  <code key={`${finding.dependent}:${finding.declared}`}>
                    {finding.declared} — {copy.requiredBy} {finding.dependent}
                  </code>
                ))}
              </div>
            </div>
          ) : null}

          {orderViolations.length > 0 ? (
            <div className="save-issue warning preset-order-warning">
              <TriangleAlert size={16} />
              <div>
                <strong>{copy.orderProblem}</strong>
                <p>{copy.orderProblemHint}</p>
                {orderViolations.map((violation) => (
                  <code key={`${violation.dependent}:${violation.dependency}`}>
                    {violation.dependency} ({violation.dependencyPosition}) → {violation.dependent} ({violation.dependentPosition})
                  </code>
                ))}
                <button className="secondary-button" onClick={repairOrder} type="button">
                  <Wand2 size={15} />
                  {copy.autoFix}
                </button>
              </div>
            </div>
          ) : null}

          <div
            className={`preset-drop-zone ${builderOrder.length === 0 ? "is-empty" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(event) => handleBuilderDrop(event)}
          >
            {builderOrder.length === 0 ? (
              <p>{copy.emptyBuilder}</p>
            ) : (
              <div className="preset-builder-list">
                {builderOrder.map((id, index) => {
                  const mod = byId.get(id);
                  return (
                    <div
                      className={`preset-builder-row ${autoAddedSet.has(id) ? "is-dependency" : ""}`}
                      draggable
                      key={id}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(BUILDER_DRAG_TYPE, id);
                      }}
                      onDrop={(event) => {
                        event.stopPropagation();
                        handleBuilderDrop(event, index);
                      }}
                    >
                      <span className="preset-position">{index + 1}</span>
                      <GripVertical aria-hidden="true" size={16} />
                      <div className="preset-mod-copy">
                        <strong>{mod?.displayName ?? id}</strong>
                        <code>{id}</code>
                        {autoAddedSet.has(id) ? <small className="save-added">{copy.dependency}</small> : null}
                      </div>
                      <button
                        aria-label={`${copy.remove}: ${mod?.displayName ?? id}`}
                        className="icon-button"
                        onClick={() => removeMod(id)}
                        title={copy.remove}
                        type="button"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="preset-drop-label">{copy.drop}</div>
          </div>

          {presetBlocked ? <p className="preset-blocked-note">{copy.presetBlocked}</p> : null}

          <button
            className="primary-button preset-save-button"
            disabled={
              !native ||
              busy ||
              builderOrder.length === 0 ||
              presetBlocked ||
              userDataPath === undefined
            }
            onClick={() => void savePreset()}
            type="button"
          >
            <Save size={16} />
            {t("saveWritePreset")}
          </button>
        </section>
      </div>

      <p className="save-footnote">
        <CheckCircle2 size={14} />
        {t("saveSafetyNote")}
      </p>

      {pending === undefined
        ? null
        : createPortal(
            <div className="modal-backdrop" role="presentation">
              <div aria-labelledby="dependency-dialog-title" aria-modal="true" className="modal dependency-modal" role="dialog">
                <div className="modal-heading">
                  <div>
                    <span className="eyebrow">{byId.get(pending.modId)?.displayName ?? pending.modId}</span>
                    <h2 id="dependency-dialog-title">{copy.dependencyDialog}</h2>
                  </div>
                  <button aria-label={copy.cancel} className="icon-button" onClick={() => setPending(undefined)} type="button">
                    <X size={18} />
                  </button>
                </div>
                <p>{copy.dependencyIntro}</p>

                {pending.newlyRequired.length > 0 ? (
                  <div className="dependency-dialog-group">
                    <strong>{copy.installedRequired}</strong>
                    {pending.newlyRequired.map((id) => (
                      <div className="dependency-dialog-row" key={id}>
                        <CheckCircle2 size={15} />
                        <span>{byId.get(id)?.displayName ?? id}</span>
                        <code>{id}</code>
                        <small>{copy.firstShown}: {pending.plan.order.indexOf(id) + 1}</small>
                      </div>
                    ))}
                  </div>
                ) : null}

                {pending.plan.findings.some((finding) => finding.kind === "satisfied") ? (
                  <div className="dependency-dialog-group">
                    <strong>{copy.alreadyPresent}</strong>
                    {pending.plan.findings
                      .filter((finding) => finding.kind === "satisfied" && finding.resolvedTo !== undefined)
                      .map((finding) => (
                        <div className="dependency-dialog-row" key={`${finding.dependent}:${finding.declared}`}>
                          <CheckCircle2 size={15} />
                          <span>{finding.resolvedTo}</span>
                          <small>{copy.requiredBy} {finding.dependent}; {copy.firstShown}: {pending.plan.order.indexOf(finding.resolvedTo ?? "") + 1}</small>
                        </div>
                      ))}
                  </div>
                ) : null}

                {pending.plan.missing.length > 0 ? (
                  <div className="dependency-dialog-group is-warning">
                    <strong>{copy.missingRequired}</strong>
                    {pending.plan.missing.map((id) => (
                      <div className="dependency-dialog-row" key={id}>
                        <TriangleAlert size={15} />
                        <code>{id}</code>
                      </div>
                    ))}
                  </div>
                ) : null}

                {pending.plan.unverifiable.length > 0 ? (
                  <div className="dependency-dialog-group is-neutral">
                    <strong>{copy.unverifiable}</strong>
                    {pending.plan.unverifiable.map((finding) => (
                      <div className="dependency-dialog-row" key={`${finding.dependent}:${finding.declared}`}>
                        <AlertCircle size={15} />
                        <code>{finding.declared}</code>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="modal-actions">
                  <button className="secondary-button" onClick={() => setPending(undefined)} type="button">
                    {copy.cancel}
                  </button>
                  <button className="primary-button" onClick={() => commitAddition(pending)} type="button">
                    <Wand2 size={16} />
                    {copy.addAndSort}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
    </div>
  );
}
