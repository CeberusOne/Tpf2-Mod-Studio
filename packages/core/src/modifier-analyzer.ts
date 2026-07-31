import { parse } from "luaparse";

import { isTf2RegistrationCategory } from "./tf2-knowledge.js";
import type {
  Diagnostic,
  Tf2Registration,
  Tf2RegistrationKind
} from "./types.js";

type LuaNode = {
  type?: string;
  name?: string;
  raw?: string;
  value?: unknown;
  identifier?: LuaNode | null;
  base?: LuaNode;
  expression?: LuaNode;
  arguments?: LuaNode[];
  parameters?: LuaNode[];
  body?: LuaNode[];
  fields?: LuaNode[];
  variables?: LuaNode[];
  init?: LuaNode[];
  key?: LuaNode;
  loc?: { start?: { line?: number; column?: number } };
  [key: string]: unknown;
};

export interface Tf2RegistrationAnalysis {
  registrations: Tf2Registration[];
  diagnostics: Diagnostic[];
}

function diagnostic(
  code: string,
  severity: Diagnostic["severity"],
  certainty: Diagnostic["certainty"],
  title: string,
  description: string,
  technicalCause: string,
  recommendedFix: string,
  line: number
): Diagnostic {
  return {
    id: `${code}:mod.lua:${line}`,
    code,
    severity,
    certainty,
    title,
    description,
    technicalCause,
    recommendedFix,
    file: "mod.lua",
    line
  };
}

function tableField(table: LuaNode | undefined, name: string): LuaNode | undefined {
  if (table?.type !== "TableConstructorExpression") return undefined;
  return table.fields?.find((field) => {
    if (field.type === "TableKeyString") return field.key?.name === name;
    if (field.type === "TableKey") {
      return field.key?.value === name || field.key?.name === name;
    }
    return false;
  });
}

function fieldValue(field: LuaNode | undefined): LuaNode | undefined {
  return field && typeof field.value === "object" && field.value !== null
    ? (field.value as LuaNode)
    : undefined;
}

function findDataTable(ast: LuaNode): LuaNode | undefined {
  const dataFunction = ast.body?.find(
    (node) =>
      node.type === "FunctionDeclaration" &&
      node.identifier?.name === "data"
  );
  const returnStatement = dataFunction?.body?.find(
    (node) => node.type === "ReturnStatement"
  );
  return returnStatement?.arguments?.[0];
}

function stringLiteral(node: LuaNode | undefined): string | undefined {
  if (node?.type !== "StringLiteral") return undefined;
  if (typeof node.value === "string") return node.value;
  if (typeof node.raw !== "string" || node.raw.length < 2) return undefined;
  const quote = node.raw.at(0);
  if (
    (quote !== `"` && quote !== `'`) ||
    node.raw.at(-1) !== quote
  ) {
    return undefined;
  }
  return node.raw.slice(1, -1);
}

function namedFunctions(ast: LuaNode): Map<string, LuaNode> {
  const functions = new Map<string, LuaNode>();
  for (const node of ast.body ?? []) {
    if (
      node.type === "FunctionDeclaration" &&
      node.identifier?.type === "Identifier" &&
      typeof node.identifier.name === "string"
    ) {
      functions.set(node.identifier.name, node);
      continue;
    }
    if (node.type !== "LocalStatement") continue;
    for (let index = 0; index < (node.variables?.length ?? 0); index += 1) {
      const variable = node.variables?.[index];
      const value = node.init?.[index];
      if (
        variable?.type === "Identifier" &&
        typeof variable.name === "string" &&
        value?.type === "FunctionDeclaration"
      ) {
        functions.set(variable.name, value);
      }
    }
  }
  return functions;
}

function registrationsIn(
  node: LuaNode | undefined,
  insideRunFn: boolean
): Array<{ call: LuaNode; insideRunFn: boolean }> {
  const calls: Array<{ call: LuaNode; insideRunFn: boolean }> = [];

  function visit(candidate: LuaNode, nestedFunctionDepth: number): void {
    if (
      candidate.type === "CallExpression" &&
      candidate.base?.type === "Identifier" &&
      (candidate.base.name === "addModifier" ||
        candidate.base.name === "addFileFilter")
    ) {
      calls.push({
        call: candidate,
        insideRunFn: insideRunFn && nestedFunctionDepth === 0
      });
    }
    for (const [key, value] of Object.entries(candidate)) {
      if (key === "loc" || key === "comments") continue;
      if (Array.isArray(value)) {
        for (const child of value) {
          if (typeof child !== "object" || child === null) continue;
          const childNode = child as LuaNode;
          visit(
            childNode,
            nestedFunctionDepth +
              (childNode.type === "FunctionDeclaration" ? 1 : 0)
          );
        }
      } else if (typeof value === "object" && value !== null) {
        const childNode = value as LuaNode;
        visit(
          childNode,
          nestedFunctionDepth +
            (childNode.type === "FunctionDeclaration" ? 1 : 0)
        );
      }
    }
  }

  if (node !== undefined) {
    visit(node, 0);
  }
  return calls;
}

function returnsIn(callback: LuaNode): LuaNode[] {
  const returns: LuaNode[] = [];

  function visit(node: LuaNode): void {
    if (node !== callback && node.type === "FunctionDeclaration") return;
    if (node.type === "ReturnStatement") returns.push(node);
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "comments") continue;
      if (Array.isArray(value)) {
        for (const child of value) {
          if (typeof child === "object" && child !== null) {
            visit(child as LuaNode);
          }
        }
      } else if (typeof value === "object" && value !== null) {
        visit(value as LuaNode);
      }
    }
  }

  visit(callback);
  return returns;
}

function callbackFor(
  expression: LuaNode | undefined,
  functions: Map<string, LuaNode>
): { callback?: LuaNode; name?: string } {
  if (expression?.type === "FunctionDeclaration") {
    return { callback: expression, name: "<inline>" };
  }
  if (
    expression?.type === "Identifier" &&
    typeof expression.name === "string"
  ) {
    const callback = functions.get(expression.name);
    return {
      name: expression.name,
      ...(callback === undefined ? {} : { callback })
    };
  }
  return {};
}

function validateCallback(
  kind: Tf2RegistrationKind,
  callback: LuaNode | undefined,
  callbackName: string | undefined,
  line: number
): Diagnostic[] {
  if (callback === undefined) {
    return [
      diagnostic(
        "TF2_CALLBACK_UNRESOLVED",
        "warning",
        "heuristic",
        "Modifier callback could not be resolved statically",
        `The callback ${callbackName ?? "expression"} is registered, but its function body is not statically available.`,
        "The callback may be imported or constructed dynamically, so its parameter and return contract cannot be proven.",
        "Open the callback definition or add an analyzable local function with `(fileName, data)` parameters.",
        line
      )
    ];
  }

  const diagnostics: Diagnostic[] = [];
  if ((callback.parameters?.length ?? 0) < 2) {
    diagnostics.push(
      diagnostic(
        "TF2_CALLBACK_PARAMETERS",
        "error",
        "confirmed",
        "Invalid TF2 callback signature",
        `${kind === "modifier" ? "Modifier" : "File-filter"} callbacks receive both \`fileName\` and \`data\`.`,
        "The registered function declares fewer than the two documented callback inputs.",
        "Declare two parameters, for example `function(fileName, data)`.",
        line
      )
    );
  }

  const returns = returnsIn(callback);
  if (returns.length === 0) {
    diagnostics.push(
      diagnostic(
        kind === "modifier"
          ? "TF2_MODIFIER_RETURN_MISSING"
          : "TF2_FILTER_RETURN_MISSING",
        "error",
        "confirmed",
        kind === "modifier"
          ? "Modifier does not return resource data"
          : "File filter does not return a decision",
        kind === "modifier"
          ? "A resource modifier must return the unchanged or modified `data` value."
          : "A file filter must return `true` to keep or `false` to deactivate the resource.",
        "Control reaches the end of the statically resolved callback without any return statement.",
        kind === "modifier"
          ? "Return `data` after applying the intended changes."
          : "Return an explicit boolean for every intended filter outcome.",
        line
      )
    );
    return diagnostics;
  }

  for (const statement of returns) {
    const value = statement.arguments?.[0];
    const returnLine = statement.loc?.start?.line ?? line;
    if (
      kind === "modifier" &&
      (value === undefined ||
        value.type === "NilLiteral" ||
        value.type === "BooleanLiteral")
    ) {
      diagnostics.push(
        diagnostic(
          "TF2_MODIFIER_RETURN_INVALID",
          "error",
          "confirmed",
          "Modifier breaks the resource-data chain",
          "This return cannot provide the loaded resource data to the next modifier or native repository.",
          "The modifier returns no value, nil or a boolean instead of a resource data table.",
          "Return the callback's `data` value after applying changes.",
          returnLine
        )
      );
    }
    if (
      kind === "file-filter" &&
      value?.type === "NilLiteral"
    ) {
      diagnostics.push(
        diagnostic(
          "TF2_FILTER_RETURN_INVALID",
          "error",
          "confirmed",
          "File filter returns nil",
          "The documented file-filter contract requires a boolean decision.",
          "Nil does not explicitly keep or deactivate the resource.",
          "Return `true` to keep the resource or `false` to deactivate it.",
          returnLine
        )
      );
    }
  }
  return diagnostics;
}

export function analyzeTf2Registrations(
  content: string
): Tf2RegistrationAnalysis {
  let ast: LuaNode;
  try {
    ast = parse(content, {
      comments: false,
      locations: true,
      luaVersion: "5.3"
    }) as unknown as LuaNode;
  } catch {
    return { registrations: [], diagnostics: [] };
  }

  const dataTable = findDataTable(ast);
  const runFn = fieldValue(tableField(dataTable, "runFn"));
  const functions = namedFunctions(ast);
  const inside = registrationsIn(runFn, true);
  const insideCalls = new Set(inside.map(({ call }) => call));
  const all = registrationsIn(ast, false);
  const calls = [
    ...inside,
    ...all.filter(({ call }) => !insideCalls.has(call))
  ].sort(
    (left, right) =>
      (left.call.loc?.start?.line ?? 0) - (right.call.loc?.start?.line ?? 0)
  );

  const diagnostics: Diagnostic[] = [];
  const registrations: Tf2Registration[] = [];

  for (const [index, entry] of calls.entries()) {
    const baseName = entry.call.base?.name;
    const kind: Tf2RegistrationKind =
      baseName === "addModifier" ? "modifier" : "file-filter";
    const category = stringLiteral(entry.call.arguments?.[0]);
    const line = entry.call.loc?.start?.line ?? 1;
    const callbackExpression = entry.call.arguments?.[1];
    const resolved = callbackFor(callbackExpression, functions);
    registrations.push({
      kind,
      line,
      order: index + 1,
      insideRunFn: entry.insideRunFn,
      ...(category === undefined ? {} : { category }),
      ...(resolved.name === undefined ? {} : { callback: resolved.name })
    });

    if (!entry.insideRunFn) {
      diagnostics.push(
        diagnostic(
          "TF2_REGISTRATION_OUTSIDE_RUNFN",
          "error",
          "confirmed",
          "TF2 resource hook is registered outside runFn",
          "`addModifier` and `addFileFilter` registrations belong in the `runFn` returned by `mod.lua`.",
          "The registration is not inside the documented mod-load callback.",
          "Move this registration into the returned `runFn = function(settings, modParams) ... end`.",
          line
        )
      );
    }

    if (category === undefined) {
      diagnostics.push(
        diagnostic(
          "TF2_CATEGORY_DYNAMIC",
          "warning",
          "heuristic",
          "TF2 resource category is not statically known",
          "The registration category is not a string literal, so its resource type cannot be verified.",
          "Dynamic category construction prevents comparison with the documented vanilla categories.",
          "Use a documented literal category or verify the generated value in a real TF2 run.",
          line
        )
      );
    } else if (!isTf2RegistrationCategory(kind, category)) {
      diagnostics.push(
        diagnostic(
          kind === "modifier"
            ? "TF2_MODIFIER_CATEGORY_UNKNOWN"
            : "TF2_FILTER_CATEGORY_UNKNOWN",
          "error",
          "confirmed",
          "Unknown vanilla TF2 resource category",
          `\`${category}\` is not a documented ${kind === "modifier" ? "addModifier" : "addFileFilter"} category.`,
          "Transport Fever 2 cannot attach this hook to a known vanilla resource repository.",
          "Replace it with the documented category matching the intended resource type.",
          line
        )
      );
    }

    diagnostics.push(
      ...validateCallback(
        kind,
        resolved.callback,
        resolved.name,
        line
      )
    );
  }

  return { registrations, diagnostics };
}
