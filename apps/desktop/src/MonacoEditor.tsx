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
    return new editorWorker();
  }
};

loader.config({ monaco });

interface MonacoEditorProps {
  expert: boolean;
  language: string;
  onChange: (value: string | undefined) => void;
  path: string;
  theme: "dark" | "light";
  value: string;
}

export default function MonacoEditor({
  expert,
  language,
  onChange,
  path,
  theme,
  value
}: MonacoEditorProps) {
  return (
    <Editor
      beforeMount={configureLuaLanguage}
      language={language}
      onChange={onChange}
      options={{
        automaticLayout: true,
        fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
        fontSize: 13,
        lineHeight: 21,
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
