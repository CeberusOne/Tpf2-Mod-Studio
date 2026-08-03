from pathlib import Path

path = Path("apps/desktop/src/App.tsx")
source = path.read_text(encoding="utf-8")

source = source.replace(
    "  PackageCheck,\n  Play,\n",
    "  PackageCheck,\n  Play,\n  Plus,\n",
    1,
)
source = source.replace(
    'import { tauriBridge } from "./bridge";\n',
    'import { tauriBridge } from "./bridge";\n'
    'import PresetBuilderPanel, {\n'
    '  PRESET_LIBRARY_DRAG_TYPE,\n'
    '  requestAddToCurrentPreset\n'
    '} from "./PresetBuilderPanel";\n',
    1,
)

old_manage_call = '''              onOpen={(path) => void loadProject(path)}
              onScan={() => void refreshModLibrary()}
              theme={theme}
            />'''
new_manage_call = '''              onOpen={(path) => void loadProject(path)}
              onScan={() => void refreshModLibrary()}
              theme={theme}
              userDataPath={
                installations.find(
                  (item) => item.userDataPath !== undefined
                )?.userDataPath
              }
            />'''
if old_manage_call not in source:
    raise SystemExit("ManageView call marker not found")
source = source.replace(old_manage_call, new_manage_call, 1)

old_save_call = '''                  native={bridge.isNative}
                  onNotice={setNotice}
                  onScanLibrary={() => void refreshModLibrary()}'''
new_save_call = '''                  native={bridge.isNative}
                  onNotice={setNotice}
                  onOpenLibrary={() => setView("manage")}
                  onScanLibrary={() => void refreshModLibrary()}'''
if old_save_call not in source:
    raise SystemExit("SavegameView call marker not found")
source = source.replace(old_save_call, new_save_call, 1)

start = source.index("function ManageView({")
end = source.index("\nfunction LogView(", start)
manage = source[start:end]

manage = manage.replace(
    "  onScan,\n  theme\n}: {",
    "  onScan,\n  theme,\n  userDataPath\n}: {",
    1,
)
manage = manage.replace(
    "  onScan: () => void;\n  theme: Theme;\n}) {",
    "  onScan: () => void;\n  theme: Theme;\n  userDataPath: string | undefined;\n}) {",
    1,
)
manage = manage.replace(
    "  const { t } = useI18n();\n",
    "  const { language, t } = useI18n();\n",
    1,
)

body_start = manage.index("      {mods.length === 0 ? (")
body_end_marker = "      )}\n    </div>\n  );\n}"
body_end = manage.rindex(body_end_marker)
body = manage[body_start : body_end + len("      )}")]
wrapped = (
    '      <div className="manage-preset-split">\n'
    '        <div className="manage-library-pane">\n'
    + body.replace("      {mods.length", "          {mods.length", 1)
    + '\n        </div>\n'
    '        <PresetBuilderPanel\n'
    '          bridge={bridge}\n'
    '          installedMods={mods.filter(\n'
    '            (item) => (item.kind ?? "mod") === "mod"\n'
    '          )}\n'
    '          native={native}\n'
    '          onNotice={onNotice}\n'
    '          userDataPath={userDataPath}\n'
    '        />\n'
    '      </div>'
)
manage = manage[:body_start] + wrapped + manage[body_end + len("      )}") :]

article_marker = '''                    className={`installation-card mod-card ${health.status} ${
                      maximizedMod === mod.path ? "is-maximized" : ""
                    }`}
                    key={mod.path}
                  >'''
article_replacement = '''                    className={`installation-card mod-card ${health.status} ${
                      maximizedMod === mod.path ? "is-maximized" : ""
                    }`}
                    draggable={kind === "mod"}
                    key={mod.path}
                    onDragStart={(event) => {
                      if (kind !== "mod") return;
                      event.dataTransfer.effectAllowed = "copy";
                      event.dataTransfer.setData(PRESET_LIBRARY_DRAG_TYPE, mod.id);
                      event.dataTransfer.setData("text/plain", mod.id);
                    }}
                  >'''
if article_marker not in manage:
    raise SystemExit("mod card marker not found")
manage = manage.replace(article_marker, article_replacement, 1)

actions_marker = '''                    <div className="mod-card-actions">
                      <button
                        aria-label={'''
actions_replacement = '''                    <div className="mod-card-actions">
                      {kind === "mod" ? (
                        <button
                          className="primary-button preset-add-card-button"
                          onClick={() => requestAddToCurrentPreset(mod.id)}
                          type="button"
                        >
                          <Plus size={16} />
                          {language === "de" ? "Zum Preset" : "Add to preset"}
                        </button>
                      ) : null}
                      <button
                        aria-label={'''
if actions_marker not in manage:
    raise SystemExit("mod card actions marker not found")
manage = manage.replace(actions_marker, actions_replacement, 1)

source = source[:start] + manage + source[end:]
path.write_text(source, encoding="utf-8")

stale = Path("apps/desktop/src/SavegameView.css")
if stale.exists():
    stale.unlink()
