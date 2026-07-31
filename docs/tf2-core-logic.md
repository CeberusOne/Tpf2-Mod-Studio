# Transport Fever 2 core-logic baseline

Checked on 2026-07-30 against the official TF2 modding wiki and deterministic
fixtures. This document states what the Studio can prove. It does not substitute
for an in-game run.

## Resource and execution pipeline

1. TF2 resolves the ordered active mod list. If several packages provide the
   same path, the later file overrides the earlier file.
2. Each mod's `runFn` executes during mod loading and registers modifiers and
   file filters.
3. TF2 resolves each visible resource from the base game, DLC and active mods.
4. Matching file filters form a chain. `false` deactivates the resource;
   `true` keeps it visible.
5. Matching resource modifiers receive `fileName` and the table returned by the
   resource's `data()` function. Each callback must return unchanged or modified
   resource data so processing can continue.
6. TF2 ingests the final Lua data into native structures. This load-time Lua
   state is not a live game world and does not provide runtime town or entity
   state.
7. `postRunFn` runs after the active `runFn` callbacks and resource loading.
   Live simulation logic belongs in game-script callbacks, not resource
   modifiers.

The Studio preserves registration order within an inspected `mod.lua`.
Cross-mod order cannot be proven without the savegame's complete ordered active
mod list and resource provenance index.

## Vanilla modifier catalogue

All categories use the same callback contract:
`fn(fileName, data) -> data`. Execution occurs while the matching resource is
loaded. Changes can affect both vanilla and mod resources in that category.

| Category | Resource type and purpose |
| --- | --- |
| `loadModel` | Models, including vehicle, person, car, tree, rock and other models |
| `loadModule` | Modular-construction modules |
| `loadStreet` | Street configurations |
| `loadTrack` | Rail-track configurations |
| `loadBridge` | Bridge configurations |
| `loadTunnel` | Tunnel configurations |
| `loadMultipleUnit` | Multiple-unit compositions |
| `loadRailroadCrossing` | Railroad crossings |
| `loadTrafficLight` | Traffic lights |
| `loadConstruction` | Constructions |
| `loadConstructionCategory` | Construction categories |
| `loadConstructionMenu` | Construction menus |
| `loadClimate` | Climates |
| `loadEnvironment` | Environments |
| `loadTerrainMaterial` | Terrain materials |
| `loadTerrainGenerator` | Terrain generators |
| `loadGrass` | Grass resources |
| `loadGroundTex` | Ground textures |
| `loadCargoType` | Cargo types |
| `loadSoundSet` | Sound sets |
| `loadScript` | General script resources |
| `loadGameScript` | Game-script resources |

The Studio also knows all 24 officially documented `addFileFilter` categories
and checks their boolean return contract.

## Implemented static checks

- unknown modifier and filter categories;
- registration outside the returned `runFn`;
- callbacks with fewer than the documented two inputs;
- missing, nil or boolean resource-modifier returns;
- nil file-filter returns;
- source registration order;
- all existing Lua, path, case and resource-reference checks.

Static analysis proves structure, not runtime behavior. It cannot prove every
control-flow path in a dynamic callback, the semantic correctness of arbitrary
table mutations, or the final result of several mods without their ordered
active set.

## Vanilla versus CommonAPI2

CommonAPI2 adds a normal script mod plus a native Windows/Linux component. The
native component is tied to compatible TF2 builds, exposes additional
CommonAPI2 functionality and can inspect multiple Lua states through its
console. Additional mod APIs are only fully active when CommonAPI2 is present in
the savegame's active mod list.

CommonAPI2 does not change the documented vanilla `addModifier` callback
contract. CommonAPI2-native APIs, compatibility metadata and dependencies must
remain separately labelled and versioned. The Studio currently recognizes
specific CommonAPI2 load/build failures in logs but does not claim a complete
CommonAPI2 API validator.

## `stdout.txt` causal analysis

The analyzer now:

- honors explicit warning/error prefixes;
- groups repeated events while retaining line ranges;
- attaches Lua stack frames and source positions;
- extracts affected files and mod identifiers;
- recognizes supported primary causes such as Lua syntax failures, missing Lua
  modules, nil runtime access, missing resources, CommonAPI2 build/native
  failures, memory exhaustion and failed assertions;
- links generic load/crash messages to a nearby recognized root cause;
- provides cause-specific corrections;
- marks the whole causal result unreliable when any error group remains
  unclassified.

This is pattern-supported causal analysis, not universal diagnosis. A real log
with an unknown engine/native signature remains explicitly unconfirmed.

## Test evidence and limits

- deterministic valid and deliberately broken modifier mods;
- realistic Lua module/stacktrace/follow-up log;
- CommonAPI2 build mismatch/follow-up log;
- explicit unknown-error reliability test;
- four public TF2 mod repositories scanned without a confirmed validation
  error: Track/Street Builder Info, TPF2-Timetables, Natural Town Growth and
  More Line & Vehicle Colors.

The public-mod scan validates available source structure only. No TF2 binary,
base-resource corpus, CommonAPI2 installation, complete savegame mod list or
real crash corpus is available in automated tests, so runtime and cross-mod
conclusions remain unconfirmed.

## Sources

- Official TF2
  [Modifiers and Filters](https://wiki.transportfever2.com/doku.php?id=modding:modifiersfilters)
- Official TF2
  [Scripting Basics](https://wiki.transportfever2.com/doku.php?id=modding:scriptingbasics)
- Official TF2
  [Mod Components](https://wiki.transportfever2.com/doku.php?id=modding:modcomponents)
- Official TF2
  [Base Config](https://wiki.transportfever2.com/doku.php?id=modding:baseconfig)
- CommonAPI2
  [Quickstart Guide](https://www.transportfever.net/lexicon/entry/361-commonapi2-quickstart-guide/)
