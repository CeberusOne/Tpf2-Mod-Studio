import type { InstallationCandidate } from "@tpf2-mod-studio/core";
import { FolderOpen, HardDrive, Save, Settings, X } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useState
} from "react";
import { createPortal } from "react-dom";

import App from "./App";
import { type DesktopBridge, tauriBridge } from "./bridge";
import {
  buildManualInstallation,
  EMPTY_MANUAL_PATHS,
  type ManualPaths,
  mergeInstallationCandidates,
  readManualPaths,
  writeManualPaths
} from "./manualPaths";

function manualDefaults(
  input: Parameters<DesktopBridge["scanModLibrary"]>[0],
  paths: ManualPaths
): Parameters<DesktopBridge["scanModLibrary"]>[0] {
  return {
    ...(input.modsPath === undefined && paths.modsPath.length > 0
      ? { modsPath: paths.modsPath }
      : input.modsPath === undefined
        ? {}
        : { modsPath: input.modsPath }),
    ...(input.userDataPath === undefined && paths.userDataPath.length > 0
      ? { userDataPath: paths.userDataPath }
      : input.userDataPath === undefined
        ? {}
        : { userDataPath: input.userDataPath }),
    ...(input.gameRoot === undefined && paths.gameRoot.length > 0
      ? { gameRoot: paths.gameRoot }
      : input.gameRoot === undefined
        ? {}
        : { gameRoot: input.gameRoot })
  };
}

function configuredBridge(paths: ManualPaths): DesktopBridge {
  return {
    ...tauriBridge,
    isNative: tauriBridge.isNative,
    async detectInstallations(): Promise<InstallationCandidate[]> {
      const detected = await tauriBridge.detectInstallations();
      return mergeInstallationCandidates(
        detected,
        buildManualInstallation(paths)
      );
    },
    async scanModLibrary(input) {
      return tauriBridge.scanModLibrary(manualDefaults(input, paths));
    }
  };
}

function useTopbarTarget(): Element | null {
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    const findTarget = (): void => {
      setTarget(document.querySelector(".topbar-actions"));
    };
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return target;
}

function PathField({
  label,
  onBrowse,
  onChange,
  placeholder,
  value
}: {
  label: string;
  onBrowse: () => void;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="path-picker">
        <input
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onChange(event.target.value)
          }
          placeholder={placeholder}
          spellCheck={false}
          value={value}
        />
        <button onClick={onBrowse} type="button">
          <FolderOpen size={16} />
          Auswählen
        </button>
      </div>
    </label>
  );
}

export default function ConfiguredApp() {
  const [paths, setPaths] = useState<ManualPaths>(readManualPaths);
  const [draft, setDraft] = useState<ManualPaths>(paths);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const topbarTarget = useTopbarTarget();
  const bridge = useMemo(() => configuredBridge(paths), [paths]);

  function change<K extends keyof ManualPaths>(
    key: K,
    value: ManualPaths[K]
  ): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function browse(key: keyof ManualPaths, title: string): Promise<void> {
    setError(undefined);
    try {
      const selected = await tauriBridge.chooseDirectory(title);
      if (selected !== null) change(key, selected);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function show(): void {
    setDraft(paths);
    setError(undefined);
    setOpen(true);
  }

  function save(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    try {
      const saved = writeManualPaths(draft);
      setPaths(saved);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function clear(): void {
    setDraft(EMPTY_MANUAL_PATHS);
  }

  return (
    <>
      <App bridge={bridge} />
      {topbarTarget === null
        ? null
        : createPortal(
            <button
              className="secondary-button"
              onClick={show}
              title="Transport-Fever-2-Pfade manuell festlegen"
              type="button"
            >
              <Settings size={17} />
              Spielpfade
            </button>,
            topbarTarget
          )}
      {open
        ? createPortal(
            <div className="modal-backdrop" role="presentation">
              <form className="modal" onSubmit={save}>
                <div className="modal-heading">
                  <div>
                    <span className="eyebrow">Windows und Linux</span>
                    <h2>Transport-Fever-2-Pfade festlegen</h2>
                  </div>
                  <button
                    aria-label="Dialog schließen"
                    className="icon-button"
                    onClick={() => setOpen(false)}
                    type="button"
                  >
                    <X size={18} />
                  </button>
                </div>

                <p>
                  Diese Angaben überschreiben die automatische Erkennung. Sie
                  bleiben nach einem Neustart gespeichert und werden für
                  Installation, Modbibliothek, Logs und Savegames verwendet.
                </p>

                <PathField
                  label="TF2-Spielordner"
                  onBrowse={() =>
                    void browse(
                      "gameRoot",
                      "Transport Fever 2 installation auswählen"
                    )
                  }
                  onChange={(value) => change("gameRoot", value)}
                  placeholder="D:\\SteamLibrary\\steamapps\\common\\Transport Fever 2"
                  value={draft.gameRoot}
                />
                <PathField
                  label="TF2-Benutzerdaten"
                  onBrowse={() =>
                    void browse(
                      "userDataPath",
                      "Transport Fever 2 Benutzerdaten auswählen"
                    )
                  }
                  onChange={(value) => change("userDataPath", value)}
                  placeholder="...\\Steam\\userdata\\<Steam-ID>\\1066780\\local"
                  value={draft.userDataPath}
                />
                <PathField
                  label="Lokaler Mod-Ordner"
                  onBrowse={() =>
                    void browse("modsPath", "Transport Fever 2 Mods auswählen")
                  }
                  onChange={(value) => change("modsPath", value)}
                  placeholder="...\\1066780\\local\\mods"
                  value={draft.modsPath}
                />

                {error === undefined ? null : (
                  <div className="modal-info">
                    <HardDrive size={18} />
                    {error}
                  </div>
                )}

                <div className="modal-actions">
                  <button
                    className="secondary-button"
                    onClick={clear}
                    type="button"
                  >
                    Zurücksetzen
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => setOpen(false)}
                    type="button"
                  >
                    Abbrechen
                  </button>
                  <button className="primary-button" type="submit">
                    <Save size={17} />
                    Pfade speichern
                  </button>
                </div>
              </form>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
