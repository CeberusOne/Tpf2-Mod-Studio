import type { Monaco } from "@monaco-editor/react";
import type { editor, Position } from "monaco-editor";

let configured = false;

/**
 * Monarch grammar for Lua. Exported so its `@name` references can be checked
 * without booting Monaco: an unresolved one aborts compilation at runtime.
 */
export const LUA_MONARCH_LANGUAGE = {
    defaultToken: "",
    tokenPostfix: ".lua",
    keywords: [
      "and",
      "break",
      "do",
      "else",
      "elseif",
      "end",
      "false",
      "for",
      "function",
      "goto",
      "if",
      "in",
      "local",
      "nil",
      "not",
      "or",
      "repeat",
      "return",
      "then",
      "true",
      "until",
      "while"
    ],
    // The tokenizer references `@symbols` below. Monarch resolves an `@name`
    // against a top-level attribute of the same name and aborts compilation
    // with "language definition does not contain attribute 'symbols'" when it
    // is missing — which threw while opening any Lua file and took the whole
    // window down with it.
    symbols: /[=><!~?:&|+\-*/^%#.]+/u,
    operators: [
      "+",
      "-",
      "*",
      "/",
      "%",
      "^",
      "#",
      "==",
      "~=",
      "<=",
      ">=",
      "<",
      ">",
      "=",
      ";",
      ":",
      ",",
      ".",
      "..",
      "..."
    ],
    tokenizer: {
      root: [
        [/[a-zA-Z_]\w*/u, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
        { include: "@whitespace" },
        [/[{}()[\]]/u, "@brackets"],
        [/[<>](?!@symbols)/u, "@brackets"],
        [/@symbols/u, { cases: { "@operators": "operator", "@default": "" } }],
        [/\d*\.\d+([eE][+-]?\d+)?/u, "number.float"],
        [/0[xX][0-9a-fA-F]+/u, "number.hex"],
        [/\d+/u, "number"],
        [/[;,.]/u, "delimiter"],
        [/"([^"\\]|\\.)*$/u, "string.invalid"],
        [/'([^'\\]|\\.)*$/u, "string.invalid"],
        [/"/u, "string", "@string_double"],
        [/'/u, "string", "@string_single"]
      ],
      whitespace: [
        [/[ \t\r\n]+/u, "white"],
        [/--\[\[/u, "comment", "@comment"],
        [/--.*$/u, "comment"]
      ],
      comment: [
        [/[^\]]+/u, "comment"],
        [/\]\]/u, "comment", "@pop"],
        [/./u, "comment"]
      ],
      string_double: [
        [/[^\\"]+/u, "string"],
        [/\\./u, "string.escape.invalid"],
        [/"/u, "string", "@pop"]
      ],
      string_single: [
        [/[^\\']+/u, "string"],
        [/\\./u, "string.escape.invalid"],
        [/'/u, "string", "@pop"]
      ]
    }
  };

export function configureLuaLanguage(monaco: Monaco): void {
  if (configured) return;
  configured = true;

  monaco.languages.register({ id: "lua" });
  monaco.languages.setMonarchTokensProvider("lua", LUA_MONARCH_LANGUAGE);

  monaco.languages.registerCompletionItemProvider("lua", {
    provideCompletionItems(model: editor.ITextModel, position: Position) {
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: model.getWordUntilPosition(position).startColumn,
        endColumn: position.column
      };
      return {
        suggestions: [
          {
            label: "data",
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: "function data()\n  return {\n    $0\n  }\nend",
            insertTextRules:
              monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Documented Transport Fever 2 configuration entry point.",
            range
          },
          {
            label: "runFn",
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: "runFn = function(settings, modParams)\n  $0\nend,",
            insertTextRules:
              monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Documented TF2 mod load callback. It may run more than once.",
            range
          },
          {
            label: "postRunFn",
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: "postRunFn = function(settings, params)\n  $0\nend,",
            insertTextRules:
              monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Documented callback after all active mods have run.",
            range
          },
          {
            label: "getCurrentModId",
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: "getCurrentModId()",
            documentation: "Documented helper used to address the current mod parameters.",
            range
          }
        ]
      };
    }
  });
}
