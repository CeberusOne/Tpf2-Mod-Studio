import { parseModRef, type InstalledMod } from "@tpf2-mod-studio/core";
import {
  Database,
  Download,
  Plus,
  Save,
  Search,
  TriangleAlert
} from "lucide-react";
import { useMemo, useState } from "react";

import type { DesktopBridge, PresetInfo, SavegameInfo } from "./bridge";
import { useI18n } from "./i18n";
import { queuePresetWorkspaceRequest } from "./PresetBuilderPanel";

interface Notice {
  tone: "success" | "error" | "neutral";
  message: string;
}

function normalized(value: string): string {
  return parseModRef(value).id.toLocaleLowerCase("en-US");
}

export default function SavegameView({
  bridge,
  installedMods,
  native,
  onNotice,
  onOpenLibrary,
  onScanLibrary,
  userDataPath
}: {
  bridge: DesktopBridge;
  installedMods: InstalledMod[];
  native: boolean;
  onNotice: (notice: Notice) => void;
  onOpenLibrary: () => void;
  onScanLibrary: () => void;
  userDataPath: string | undefined;
}) {
  const { language, t } = useI18n();
  const copy =
    language === "de"
      ? {
          description:
            "Savegames und vorhandene Mod-Presets auswählen. Die Bearbeitung erfolgt anschließend im Splitscreen der bestehenden Mod Library.",
          openSave: "Modliste im Preset Builder öffnen",
          openPreset: "Preset in der Mod Library öffnen",
          newPreset: "Neues Preset",
          newPresetHint:
            "Öffnet die Mod Library. Dort wird zuerst nach dem Preset-Namen gefragt.",
          readOnly:
            "Savegames bleiben unverändert. Es werden ausschließlich TF2-Mod-Presets geschrieben.",
          incomplete:
            "Die Savegame-Modliste konnte nur teilweise gelesen werden. Nicht zugeordnete Einträge werden nicht erfunden.",
          library: "Zur Mod Library",
          noUserData:
            "Der TF2-Benutzerdatenordner wurde noch nicht erkannt oder festgelegt."
        }
      : {
          description:
            "Choose a savegame or an existing mod preset. Editing then continues in the split-screen of the existing Mod Library.",
          openSave: "Open mod list in Preset Builder",
          openPreset: "Open preset in Mod Library",
          newPreset: "New preset",
          newPresetHint:
            "Opens the Mod Library, where the preset name is requested first.",
          readOnly:
            "Savegames remain unchanged. Only TF2 mod presets are written.",
          incomplete:
            "The savegame mod list was only read partially. Unmatched entries are not guessed.",
          library: "Go to Mod Library",
          noUserData:
            "The TF2 user-data folder has not been detected or configured yet."
        };

  const [savegames, setSavegames] = useState<SavegameInfo[]>();
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [busy, setBusy] = useState(false);

  const installedLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const mod of installedMods) lookup.set(normalized(mod.id), mod.id);
    return lookup;
  }, [installedMods]);

  async function refresh(): Promise<void> {
    if (userDataPath === undefined) {
      onNotice({ tone: "neutral", message: copy.noUserData });
      return;
    }
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

  async function openSavegame(save: SavegameInfo): Promise<void> {
    setBusy(true);
    try {
      const result = await bridge.readSavegameMods(save.path);
      const matched: string[] = [];
      const seen = new Set<string>();
      for (const candidate of result.mods) {
        const id = installedLookup.get(normalized(candidate));
        if (id !== undefined && !seen.has(id)) {
          matched.push(id);
          seen.add(id);
        }
      }
      queuePresetWorkspaceRequest({
        kind: "savegame",
        name: save.name,
        savePath: save.path,
        modIds: matched
      });
      if (!result.complete) {
        onNotice({ tone: "neutral", message: copy.incomplete });
      } else {
        onNotice({
          tone: matched.length > 0 ? "success" : "neutral",
          message: t("saveModsRead", {
            matched: matched.length,
            candidates: result.mods.length
          })
        });
      }
      onOpenLibrary();
    } catch (error) {
      onNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy(false);
    }
  }

  function openPreset(preset: PresetInfo): void {
    queuePresetWorkspaceRequest({
      kind: "preset",
      name: preset.name,
      path: preset.path
    });
    onOpenLibrary();
  }

  function createPreset(): void {
    queuePresetWorkspaceRequest({ kind: "new" });
    onOpenLibrary();
  }

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
          <p>{copy.description}</p>
        </div>
        <div className="section-actions">
          <button
            className="secondary-button"
            disabled={!native || userDataPath === undefined}
            onClick={createPreset}
            type="button"
          >
            <Plus size={17} />
            {copy.newPreset}
          </button>
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
      </div>

      {userDataPath === undefined ? (
        <div className="save-issue warning">
          <TriangleAlert size={16} />
          <div>
            <strong>{copy.noUserData}</strong>
          </div>
        </div>
      ) : null}

      <div className="save-columns">
        <section className="save-sources">
          <h3>{t("saveGames")}</h3>
          {savegames === undefined ? (
            <p className="mod-editor-hint">{t("saveRefreshHint")}</p>
          ) : savegames.length === 0 ? (
            <p className="mod-editor-hint">{t("saveNone")}</p>
          ) : (
            savegames.slice(0, 80).map((save) => (
              <button
                className="save-row"
                disabled={busy}
                key={save.path}
                onClick={() => void openSavegame(save)}
                title={copy.openSave}
                type="button"
              >
                <Download size={14} />
                <span>{save.name}</span>
                <small>{Math.round(save.size / 1024 / 1024)} MB</small>
              </button>
            ))
          )}
        </section>

        <section className="save-plan">
          <div className="save-plan-head">
            <div>
              <h3>{t("savePresets")}</h3>
              <p className="mod-editor-hint">{copy.newPresetHint}</p>
            </div>
            <button
              className="primary-button"
              disabled={!native || userDataPath === undefined}
              onClick={createPreset}
              type="button"
            >
              <Plus size={16} />
              {copy.newPreset}
            </button>
          </div>

          {presets.length === 0 ? (
            <p className="mod-editor-hint">{t("savePresetsNone")}</p>
          ) : (
            <div className="preset-launch-list">
              {presets.map((preset) => (
                <button
                  className="save-row"
                  key={preset.path}
                  onClick={() => openPreset(preset)}
                  title={copy.openPreset}
                  type="button"
                >
                  <Save size={14} />
                  <span>{preset.name}</span>
                  <small>{copy.library}</small>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <p className="save-footnote">
        <Database size={14} />
        {copy.readOnly}
      </p>
    </div>
  );
}
