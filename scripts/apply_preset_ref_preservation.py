from pathlib import Path

panel_path = Path("apps/desktop/src/PresetBuilderPanel.tsx")
panel = panel_path.read_text(encoding="utf-8")

panel = panel.replace(
    "  preferredOrder: string[];\n  savedSignature: string;\n}",
    "  preferredOrder: string[];\n  refs: Record<string, string>;\n  savedSignature: string;\n}",
    1,
)

old_mod_infos = '''  const modInfos = useMemo<InstalledModInfo[]>(
    () =>
      installedMods.map((mod) => {
        const info = extractDependencyInfo(mod.modLua ?? "");
        return {
          id: mod.id,
          source: mod.source,
          dependencies: info.dependencies,
          dependenciesAnyLoadOrder: info.anyLoadOrder
        };
      }),
    [installedMods]
  );'''
new_mod_infos = '''  const modInfos = useMemo<InstalledModInfo[]>(() => {
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
  }, [active?.refs, installedMods]);'''
if old_mod_infos not in panel:
    raise SystemExit("modInfos marker not found")
panel = panel.replace(old_mod_infos, new_mod_infos, 1)

old_activate = '''  function activate(
    name: string,
    ids: readonly string[],
    options: { path?: string; savePath?: string } = {}
  ): ActivePreset {
    const matched = unique(
      ids
        .map((id) => matchInstalled(id))
        .filter((id): id is string => id !== undefined)
    );
    const nextPlan = planModOrder(modInfos, matched, matched);
    const order = nextPlan.order;
    const next: ActivePreset = {
      name,
      explicitOrder: matched,
      preferredOrder: order,
      savedSignature: signature(name, order),
      ...(options.path === undefined ? {} : { path: options.path }),
      ...(options.savePath === undefined ? {} : { savePath: options.savePath })
    };
    setActive(next);
    setAutoArrange(true);
    return next;
  }'''
new_activate = '''  function activate(
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
  }'''
if old_activate not in panel:
    raise SystemExit("activate marker not found")
panel = panel.replace(old_activate, new_activate, 1)

panel = panel.replace(
    '''        entries.map((entry) => entry.ref.raw),
        { path: preset.path }
      );''',
    '''        entries.map((entry) => entry.ref.raw),
        {
          path: preset.path,
          rawRefs: entries.map((entry) => entry.ref.raw)
        }
      );''',
    1,
)

old_remove_set = '''    setActive({
      ...active,
      explicitOrder,
      preferredOrder: autoArrange ? nextPlan.order : preferredOrder
    });'''
new_remove_set = '''    const refs = { ...active.refs };
    delete refs[id];
    setActive({
      ...active,
      explicitOrder,
      preferredOrder: autoArrange ? nextPlan.order : preferredOrder,
      refs
    });'''
if old_remove_set not in panel:
    raise SystemExit("remove marker not found")
panel = panel.replace(old_remove_set, new_remove_set, 1)

old_save_map = '''          const mod = byId.get(id);
          return {
            ref: mod === undefined ? parseModRef(id) : presetRefFor(mod),
            majorVersion: majorVersionFor(id),
            ...(mod?.displayName === undefined ? {} : { name: mod.displayName })
          };'''
new_save_map = '''          const mod = byId.get(id);
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
          };'''
if old_save_map not in panel:
    raise SystemExit("save map marker not found")
panel = panel.replace(old_save_map, new_save_map, 1)

old_saved_state = '''      setActive({
        ...active,
        path,
        preferredOrder: builderOrder,
        savedSignature: signature(active.name, builderOrder)
      });'''
new_saved_state = '''      const refs = Object.fromEntries(
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
      });'''
if old_saved_state not in panel:
    raise SystemExit("saved state marker not found")
panel = panel.replace(old_saved_state, new_saved_state, 1)

panel = panel.replace(
    '''      activate(request.name, request.modIds, { savePath: request.savePath });''',
    '''      activate(request.name, request.modIds, {
        savePath: request.savePath,
        rawRefs: request.modIds
      });''',
    1,
)

panel_path.write_text(panel, encoding="utf-8")

save_path = Path("apps/desktop/src/SavegameView.tsx")
save = save_path.read_text(encoding="utf-8")
save = save.replace("          matched.push(id);", "          matched.push(candidate);", 1)
save_path.write_text(save, encoding="utf-8")

test_path = Path("packages/core/src/mod-order.test.ts")
tests = test_path.read_text(encoding="utf-8")
marker = '''  it("handles one mod depending on several others", () => {'''
addition = '''  it("places priority refs at the bottom of the visible TF2 list", () => {
    const installed = [
      mod("normal_1"),
      mod("commonapi_1", [], "priority")
    ];
    const result = planModOrder(
      installed,
      ["commonapi_1", "normal_1"],
      ["commonapi_1", "normal_1"]
    );

    expect(result.order).toEqual(["normal_1", "commonapi_1"]);
    expect(result.loadOrder[0]).toBe("commonapi_1");
  });

'''
if marker not in tests:
    raise SystemExit("test insertion marker not found")
tests = tests.replace(marker, addition + marker, 1)
test_path.write_text(tests, encoding="utf-8")
