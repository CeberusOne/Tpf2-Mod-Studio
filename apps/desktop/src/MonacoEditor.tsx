import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor/editor.api";
import editorWorker from "monaco-editor/editor/editor.worker?worker";

import { configureLuaLanguage } from "./lua-language";

type MonacoEnvironment = {
  getWorker(moduleId: string, label: string): Worker;
};

(globalThis as typeof globalThis & {
  MonacoEnvironment: MonacoEnvironment;
}).MonacoEnvironment = {
  getWorker() {
    // Diagnostics only: worker startup failures are otherwise invisible in a
    // packaged build. The error is still propagated to Monaco unchanged.
    try {
      return new editorWorker();
    } catch (error) {
      console.error("Monaco worker failed to start", error);
      throw error;
    }
  }
};

loader.config({ monaco });

interface MonacoEditorProps {
  expert: boolean;
  fontSize?: number;
  language: string;
  onChange: (value: string | undefined) => void;
  path: string;
  theme: "dark" | "light";
  value: string;
}

export default function MonacoEditor({
  expert,
  fontSize = 14,
  language,
  onChange,
  path,
  theme,
  value
}: MonacoEditorProps) {
  const resolvedFontSize = Math.max(11, Math.min(22, fontSize));
  return (
    <Editor
      beforeMount={configureLuaLanguage}
      language={language}
      onChange={onChange}
      options={{
        automaticLayout: true,
        fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
        fontSize: resolvedFontSize,
        lineHeight: Math.round(resolvedFontSize * 1.55),
        minimap: { enabled: expert },
        padding: { top: 14 },
        renderWhitespace: expert ? "selection" : "none",
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        tabSize: 2,
        wordWrap: "off"
      }}
      path={path}
      theme={theme === "dark" ? "vs-dark" : "light"}
      value={value}
    />
  );
}
