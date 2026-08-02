import { parse } from "luaparse";

import { stripByteOrderMark } from "./path-utils.js";

/** A statically evaluated Lua value. Functions and dynamic calls yield undefined. */
export type LuaValue =
  | string
  | number
  | boolean
  | null
  | LuaValue[]
  | { [key: string]: LuaValue };

interface Node {
  type?: string;
  value?: unknown;
  raw?: string;
  name?: string;
  operator?: string;
  argument?: Node;
  base?: Node;
  identifier?: Node | null;
  body?: Node[];
  arguments?: Node[];
  fields?: Node[];
  key?: Node;
  [key: string]: unknown;
}

function literal(node: Node): LuaValue | undefined {
  switch (node.type) {
    case "StringLiteral":
      if (typeof node.value === "string") return node.value;
      if (typeof node.raw === "string" && node.raw.length >= 2) {
        return node.raw.slice(1, -1);
      }
      return undefined;
    case "NumericLiteral":
      return typeof node.value === "number" ? node.value : Number(node.raw);
    case "BooleanLiteral":
      return node.value === true;
    case "NilLiteral":
      return null;
    default:
      return undefined;
  }
}

/**
 * Evaluate a Lua expression node into plain JSON-like data.
 *
 * Only literals, tables, numeric negation and locals bound to those are
 * supported. Transport Fever 2 resource files are plain data tables, so that
 * is enough; anything computed (`require`, `transf.rotZTransl(...)`,
 * concatenation) yields `undefined` and is skipped by the caller rather than
 * guessed at.
 */
function evaluate(
  node: Node | undefined,
  locals: Map<string, Node> = new Map()
): LuaValue | undefined {
  if (node === undefined) return undefined;

  const direct = literal(node);
  if (direct !== undefined) return direct;

  if (node.type === "UnaryExpression" && node.operator === "-") {
    const inner = evaluate(node.argument, locals);
    return typeof inner === "number" ? -inner : undefined;
  }

  // `local result = { ... } ... return result`
  if (node.type === "Identifier" && typeof node.name === "string") {
    const bound = locals.get(node.name);
    if (bound === undefined) return undefined;
    // Drop the binding first so a self-referencing local cannot recurse.
    const next = new Map(locals);
    next.delete(node.name);
    return evaluate(bound, next);
  }

  if (node.type !== "TableConstructorExpression") return undefined;

  const array: LuaValue[] = [];
  const record: Record<string, LuaValue> = {};
  let named = false;

  for (const field of node.fields ?? []) {
    if (field.type === "TableValue") {
      const value = evaluate(field.value as Node | undefined, locals);
      if (value !== undefined) array.push(value);
      continue;
    }
    // `key = value` and `["key"] = value`
    const keyNode = field.key;
    const key =
      keyNode?.type === "Identifier"
        ? keyNode.name
        : keyNode === undefined
          ? undefined
          : literal(keyNode);
    const value = evaluate(field.value as Node | undefined, locals);
    if (typeof key !== "string" || value === undefined) continue;
    record[key] = value;
    named = true;
  }

  if (named && array.length > 0) {
    // Mixed tables are rare in TF2 data; keep both under stable keys.
    return { ...record, ...Object.fromEntries(array.map((v, i) => [i + 1, v])) };
  }
  return named ? record : array;
}

/**
 * Read the table returned by a Transport Fever 2 `data()` function.
 *
 * Returns `undefined` when the file does not parse or does not return a table.
 * The Lua is never executed.
 */
export function parseLuaData(content: string): LuaValue | undefined {
  let ast: Node;
  try {
    ast = parse(stripByteOrderMark(content), {
      comments: false,
      locations: false,
      luaVersion: "5.3"
    }) as unknown as Node;
  } catch {
    return undefined;
  }

  // Some resources declare the table as a local and return it afterwards, at
  // file scope or inside data(). Collect both levels before resolving.
  const locals = new Map<string, Node>();
  function collectLocals(body: Node[] | undefined): void {
    for (const statement of body ?? []) {
      if (statement.type !== "LocalStatement") continue;
      const variables = (statement["variables"] as Node[] | undefined) ?? [];
      const init = (statement["init"] as Node[] | undefined) ?? [];
      variables.forEach((variable, index) => {
        const value = init[index];
        if (typeof variable.name === "string" && value !== undefined) {
          locals.set(variable.name, value);
        }
      });
    }
  }

  collectLocals(ast.body);
  const dataFunction = ast.body?.find(
    (node) =>
      node.type === "FunctionDeclaration" &&
      (node.identifier as Node | null)?.name === "data"
  );
  collectLocals(dataFunction?.body);

  const returnStatement = (dataFunction?.body ?? ast.body)?.find(
    (node) => node.type === "ReturnStatement"
  );
  return evaluate(returnStatement?.arguments?.[0], locals);
}
