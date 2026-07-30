import type {
  Tf2LoadPhase,
  Tf2ModifierDefinition,
  Tf2RegistrationKind
} from "./types.js";

const MODIFIER_CHAIN =
  "Registered functions form a chain. Each function receives the data returned by the previous modifier and must return the resource data for the next modifier/native ingest.";

const MODIFIER_IMPACT =
  "Changes affect vanilla and mod resources in this category. Later modifiers may observe, extend or overwrite earlier changes; the active mod order is required to prove cross-mod order.";

function modifier(
  category: string,
  resourceType: string,
  purpose: string
): Tf2ModifierDefinition {
  return {
    category,
    resourceType,
    purpose,
    executionPhase: "resource-load",
    inputs: ["fileName", "data"],
    returnContract: "Return the unchanged or modified resource data table.",
    chainSemantics: MODIFIER_CHAIN,
    crossModImpact: MODIFIER_IMPACT
  };
}

/**
 * Complete vanilla categories documented by Urban Games for addModifier().
 * The descriptions deliberately identify resource domains rather than guessing
 * undocumented table members.
 */
export const TF2_RESOURCE_MODIFIERS: readonly Tf2ModifierDefinition[] = [
  modifier("loadModel", "model", "Modify loaded model resources, including vehicle, person, car, tree, rock and other models."),
  modifier("loadModule", "construction module", "Modify modular-construction module resources."),
  modifier("loadStreet", "street", "Modify street configuration resources."),
  modifier("loadTrack", "track", "Modify rail track configuration resources."),
  modifier("loadBridge", "bridge", "Modify bridge configuration resources."),
  modifier("loadTunnel", "tunnel", "Modify tunnel configuration resources."),
  modifier("loadMultipleUnit", "multiple unit", "Modify multiple-unit composition resources."),
  modifier("loadRailroadCrossing", "railroad crossing", "Modify railroad-crossing resources."),
  modifier("loadTrafficLight", "traffic light", "Modify traffic-light resources."),
  modifier("loadConstruction", "construction", "Modify construction resources before native ingestion."),
  modifier("loadConstructionCategory", "construction category", "Modify construction-category resources."),
  modifier("loadConstructionMenu", "construction menu", "Modify construction-menu resources."),
  modifier("loadClimate", "climate", "Modify climate resources."),
  modifier("loadEnvironment", "environment", "Modify environment resources."),
  modifier("loadTerrainMaterial", "terrain material", "Modify terrain-material resources."),
  modifier("loadTerrainGenerator", "terrain generator", "Modify terrain-generator resources."),
  modifier("loadGrass", "grass", "Modify grass resources."),
  modifier("loadGroundTex", "ground texture", "Modify ground-texture resources."),
  modifier("loadCargoType", "cargo type", "Modify cargo-type resources."),
  modifier("loadSoundSet", "sound set", "Modify sound-set resources."),
  modifier("loadScript", "script", "Modify general script resources."),
  modifier("loadGameScript", "game script", "Modify game-script resources.")
] as const;

export const TF2_FILE_FILTER_CATEGORIES = [
  "model/vehicle",
  "model/person",
  "model/car",
  "model/rock",
  "model/tree",
  "model/other",
  "multipleUnit",
  "street",
  "track",
  "bridge",
  "tunnel",
  "railroadCrossing",
  "trafficLight",
  "environment",
  "construction",
  "module",
  "autoGroundTex",
  "groundTex",
  "terrainGenerator",
  "terrainMaterial",
  "cargoType",
  "grass",
  "gameScript",
  "climate"
] as const;

export const TF2_LOAD_PIPELINE: readonly Tf2LoadPhase[] = [
  {
    id: "mod-order",
    description:
      "Resolve the active ordered mod list. Same-path files from later mods override earlier files."
  },
  {
    id: "run-fn",
    description:
      "Execute each active mod's runFn and register resource modifiers and file filters."
  },
  {
    id: "resource-resolution",
    description:
      "Resolve the visible resource file from base game, DLC and active mods."
  },
  {
    id: "filter-chain",
    description:
      "Run every registered filter for the resource category; false deactivates the resource."
  },
  {
    id: "modifier-chain",
    description:
      "Run matching modifiers as a data chain in resolved registration order."
  },
  {
    id: "native-ingest",
    description:
      "Ingest the final Lua data into native game structures; the loading Lua state is not a live game world."
  },
  {
    id: "post-run-fn",
    description:
      "Execute postRunFn only after all active runFn callbacks ran and resource repositories are available."
  },
  {
    id: "game-script",
    description:
      "Use game-script callbacks for live simulation state; modifier callbacks are resource-load time, not runtime entity hooks."
  }
] as const;

const modifierCategories = new Set(
  TF2_RESOURCE_MODIFIERS.map((entry) => entry.category)
);
const fileFilterCategories = new Set<string>(TF2_FILE_FILTER_CATEGORIES);

export function isTf2RegistrationCategory(
  kind: Tf2RegistrationKind,
  category: string
): boolean {
  return kind === "modifier"
    ? modifierCategories.has(category)
    : fileFilterCategories.has(category);
}

export function tf2ModifierDefinition(
  category: string
): Tf2ModifierDefinition | undefined {
  return TF2_RESOURCE_MODIFIERS.find(
    (definition) => definition.category === category
  );
}
