import { describe, expect, it } from "vitest";

import { LUA_MONARCH_LANGUAGE } from "./lua-language";

/**
 * Monarch resolves every `@name` in a rule against a top-level attribute of the
 * language definition and throws during compilation when one is missing. That
 * throw happened while opening any Lua file and unmounted the whole window,
 * so the grammar is checked here the same way Monarch checks it.
 */
const BUILT_IN = new Set([
  "default",
  "brackets",
  "pop",
  "push",
  "popall",
  "rematch",
  "eos"
]);

function collectReferences(value: unknown, into: Set<string>): void {
  if (typeof value === "string") {
    for (const match of value.matchAll(/@(\w+)/gu)) {
      if (match[1] !== undefined) into.add(match[1]);
    }
    return;
  }
  if (value instanceof RegExp) {
    for (const match of value.source.matchAll(/@(\w+)/gu)) {
      if (match[1] !== undefined) into.add(match[1]);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, into);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      collectReferences(key, into);
      collectReferences(item, into);
    }
  }
}

describe("Lua Monarch grammar", () => {
  it("resolves every @reference it uses", () => {
    const references = new Set<string>();
    collectReferences(LUA_MONARCH_LANGUAGE.tokenizer, references);

    const available = new Set([
      ...Object.keys(LUA_MONARCH_LANGUAGE),
      ...Object.keys(LUA_MONARCH_LANGUAGE.tokenizer),
      ...BUILT_IN
    ]);
    const unresolved = [...references].filter((name) => !available.has(name));

    expect(unresolved).toEqual([]);
  });

  it("still defines the symbols attribute the operator rules depend on", () => {
    // Regression guard: its absence is what crashed the editor.
    expect(LUA_MONARCH_LANGUAGE.symbols).toBeInstanceOf(RegExp);
    expect("==".match(LUA_MONARCH_LANGUAGE.symbols)?.[0]).toBe("==");
  });
});
