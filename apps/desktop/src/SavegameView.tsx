import {
  buildModPresetLua,
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
  Save,
  Search,
  TriangleAlert
} from "lucide-react";
import { useMemo, useState } from "react";

import type { DesktopBridge, PresetInfo, SavegameInfo } from "./bridge";
import { useI18n } from "./i18n";

interface Notice {
  tone: "success" | "error" | "neutral";
  message: string;
}

/** Strip the `!`/`*` prefix so a preset id matches an installed folder id. */
function bareId(value: string): string {
  return parseModRef(value).id;
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
  const { t } = useI18n();
  const [savegames, setSavegames] = useState<SavegameInfo[]>();
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [selectedSave, setSelectedSave] = useState<string>();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [presetName, setPresetName] = useState("");
  const [busy, setBusy] = useState(false);

  // Dependencies live in mod.lua, which the library scan already carries.
  const modInfos = useMemo<InstalledModInfo[]>(() => {
    const dependency = /(?:dependencies|requiredMods)\s*=\s*\{([^}]*)\}/gsu;
    const literal = /"([^"]+)"/gu;
    return installedMods.map((mod) => {
      const found = new Set<string>();
      for (const block of (mod.modLua ?? "").matchAll(dependency)) {
        for (const item of (block[1] ?? "").matchAll(literal)) {
          const value = item[1]?.trim();
          if (value !== undefined && value.length > 0) found.add(value);
        }
      }
      return { id: mod.id, source: mod.source, dependencies: [...found] };
    });
  }, [installedMods]);

  const plan = useMemo<ModOrderResult | undefined>(
    () =>
      selected.size === 0
        ? undefined
        : planModOrder(modInfos, [...selected]),
    [modInfos, selected]
  );

  const byId = useMemo(
    () => new Map(installedMods.map((mod) => [mod.id, mod])),
    [installedMods]
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

  async function loadFromSave(save: SavegameInfo): Promise<void> {
    setBusy(true);
    try {
      const result = await bridge.readSavegameMods(save.path);
      // The header scan returns candidates; only ids that match an installed
      // mod are real. Author names and roles fall away here.
      const matched = new Set<string>();
      for (const candidate of result.mods) {
        const bare = bareId(candidate);
        if (byId.has(candidate)) matched.add(candidate);
        else if (byId.has(bare)) matched.add(bare);
      }
      setSelectedSave(save.path);
      setSelected(matched);
      setPresetName(save.name);
      onNotice({
        tone: matched.size === 0 ? "neutral" : "success",
        message: t("saveModsRead", {
          matched: matched.size,
          candidates: result.mods.length
        })
      });
    } catch (error) {
      onNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy(false);
    }
  }

  async function loadFromPreset(preset: PresetInfo): Promise<void> {
    setBusy(true);
    try {
      const entries = parseModPreset(await bridge.readModPreset(preset.path));
      const matched = new Set<string>();
      for (const entry of entries) {
        if (byId.has(entry.ref.raw)) matched.add(entry.ref.raw);
        else if (byId.has(entry.ref.id)) matched.add(entry.ref.id);
      }
      setSelectedSave(undefined);
      setSelected(matched);
      setPresetName(preset.name);
      onNotice({
        tone: "success",
        message: t("presetLoaded", {
          matched: matched.size,
          total: entries.length
        })
      });
    } catch (error) {
      onNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy(false);
    }
  }

  async function savePreset(): Promise<void> {
    if (userDataPath === undefined || plan === undefined) return;
    setBusy(true);
    try {
      const lua = buildModPresetLua(
        plan.order.map((id) => {
          const mod = byId.get(id);
          return {
            ref: parseModRef(id),
            ...(mod?.displayName === undefined
              ? {}
              : { name: mod.displayName })
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
      onNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const grouped = useMemo(() => {
    const map = new Map<string, DependencyFinding[]>();
    for (const finding of plan?.findings ?? []) {
      const list = map.get(finding.kind) ?? [];
      list.push(finding);
      map.set(finding.kind, list);
    }
    return map;
  }, [plan]);

  if (installedMods.length === 0) {
    return (
      <div className="setup-page">
        <div className="section-intro">
          <div>
            <span className="eyebrow">{t("navSavegames")}</span>
            <h2>{t("saveTitle")}</h2>
            <p>{t("saveNeedsLibrary")}</p>
          </div>
          <button
            className="primary-button"
            disabled={!native}
            onClick={onScanLibrary}
            type="button"
          >
            <Search size={17} />
            {t("scanModLibrary")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-page">
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

      <div className="save-columns">
        <section className="save-sources">
          <h3>{t("saveGames")}</h3>
          {savegames === undefined ? (
            <p className="mod-editor-hint">{t("saveRefreshHint")}</p>
          ) : savegames.length === 0 ? (
            <p className="mod-editor-hint">{t("saveNone")}</p>
          ) : (
            savegames.slice(0, 40).map((save) => (
              <button
                className={`save-row ${
                  selectedSave === save.path ? "is-active" : ""
                }`}
                key={save.path}
                onClick={() => void loadFromSave(save)}
                type="button"
              >
                <Download size={14} />
                <span>{save.name}</span>
                <small>{Math.round(save.size / 1024 / 1024)} MB</small>
              </button>
            ))
          )}

          <h3>{t("savePresets")}</h3>
          {presets.length === 0 ? (
            <p className="mod-editor-hint">{t("savePresetsNone")}</p>
          ) : (
            presets.map((preset) => (
              <button
                className="save-row"
                key={preset.path}
                onClick={() => void loadFromPreset(preset)}
                type="button"
              >
                <Save size={14} />
                <span>{preset.name}</span>
              </button>
            ))
          )}
        </section>

        <section className="save-plan">
          <div className="save-plan-head">
            <strong>
              {t("saveSelected", {
                count: selected.size,
                total: installedMods.length
              })}
            </strong>
            <label className="field save-name">
              <span>{t("savePresetName")}</span>
              <input
                onChange={(event) => setPresetName(event.target.value)}
                placeholder="tpf2-mod-studio"
                value={presetName}
              />
            </label>
            <button
              className="primary-button"
              disabled={
                !native ||
                busy ||
                plan === undefined ||
                plan.cycles.length > 0 ||
                userDataPath === undefined
              }
              onClick={() => void savePreset()}
              type="button"
            >
              <Save size={16} />
              {t("saveWritePreset")}
            </button>
          </div>

          {plan === undefined ? (
            <p className="mod-editor-hint">{t("saveNothingSelected")}</p>
          ) : (
            <>
              <div className="save-summary">
                <span>
                  {t("saveOrderCount", { count: plan.order.length })}
                </span>
                {plan.addedForDependencies.length > 0 ? (
                  <span className="save-added">
                    {t("saveAdded", {
                      count: plan.addedForDependencies.length
                    })}
                  </span>
                ) : null}
                {plan.missing.length > 0 ? (
                  <span className="save-missing">
                    {t("saveMissing", { count: plan.missing.length })}
                  </span>
                ) : null}
                {plan.unverifiable.length > 0 ? (
                  <span className="save-unverifiable">
                    {t("saveUnverifiable", {
                      count: plan.unverifiable.length
                    })}
                  </span>
                ) : null}
              </div>

              {plan.cycles.length > 0 ? (
                <div className="save-issue error">
                  <AlertCircle size={16} />
                  <div>
                    <strong>{t("saveCycle")}</strong>
                    {plan.cycles.map((cycle) => (
                      <code key={cycle.join(">")}>{cycle.join(" → ")}</code>
                    ))}
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
                        {finding.declared} — {t("saveNeededBy", {
                          mod: finding.dependent
                        })}
                      </code>
                    ))}
                  </div>
                </div>
              ) : null}

              {plan.unverifiable.length > 0 ? (
                <details className="save-issue neutral">
                  <summary>
                    {t("saveUnverifiableTitle", {
                      count: plan.unverifiable.length
                    })}
                  </summary>
                  <p>{t("saveUnverifiableHint")}</p>
                  {plan.unverifiable.map((finding) => (
                    <code key={`${finding.dependent}:${finding.declared}`}>
                      {finding.declared}
                    </code>
                  ))}
                </details>
              ) : null}

              <details className="save-order" open>
                <summary>{t("saveOrderTitle")}</summary>
                {plan.order.map((id, index) => (
                  <div className="save-order-row" key={id}>
                    <span>{index + 1}</span>
                    <code>{id}</code>
                    {plan.addedForDependencies.includes(id) ? (
                      <small className="save-added">{t("saveAutoAdded")}</small>
                    ) : null}
                  </div>
                ))}
              </details>
            </>
          )}

          <details className="save-picker">
            <summary>{t("saveChooseMods")}</summary>
            <div className="save-picker-list">
              {installedMods.map((mod) => (
                <label className="check-row" key={mod.path}>
                  <input
                    checked={selected.has(mod.id)}
                    onChange={() => toggle(mod.id)}
                    type="checkbox"
                  />
                  <span title={mod.path}>
                    {mod.displayName ?? mod.id}
                    <small> · {mod.source}</small>
                  </span>
                </label>
              ))}
            </div>
          </details>
        </section>
      </div>

      <p className="save-footnote">
        <CheckCircle2 size={14} />
        {t("saveSafetyNote")}
      </p>
    </div>
  );
}
