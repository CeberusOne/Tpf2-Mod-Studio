import type { AiAssistSettings, Diagnostic, LogGroup } from "./types.js";

/** Empty by design: AI is optional and fully user-chosen (any OpenAI-compatible API). */
export const DEFAULT_AI_SETTINGS: AiAssistSettings = {
  enabled: false,
  baseUrl: "",
  apiKey: "",
  model: ""
};

export function isAiConfigured(settings: AiAssistSettings): boolean {
  return (
    settings.enabled &&
    settings.apiKey.trim().length > 0 &&
    settings.baseUrl.trim().length > 0 &&
    settings.model.trim().length > 0
  );
}

function trim(text: string, max = 4_000): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…[truncated]`;
}

export function buildLogAssistPrompt(group: LogGroup, language: "de" | "en"): string {
  const lang =
    language === "de"
      ? "Antworte auf Deutsch, klar und praxisnah für Transport-Fever-2-Modder."
      : "Answer in English, clearly and practically for Transport Fever 2 modders.";
  return [
    "You are assisting with Transport Fever 2 mod troubleshooting.",
    lang,
    "Use only the provided log evidence. Do not invent stack frames or files.",
    "Structure: 1) likely cause 2) concrete fix steps 3) what to re-check after a restart.",
    "",
    `Severity: ${group.severity}`,
    `Cause status: ${group.causeStatus}`,
    `Cause code: ${group.causeCode ?? "none"}`,
    `Mod: ${group.modId ?? "unknown"}`,
    `File: ${group.file ?? "unknown"}${group.sourceLine === undefined ? "" : `:${group.sourceLine}`}`,
    `Message: ${trim(group.message, 800)}`,
    `Technical cause: ${group.technicalCause ?? "n/a"}`,
    `Recommended fix: ${group.recommendedFix ?? "n/a"}`,
    group.stackTrace.length > 0
      ? `Stack:\n${group.stackTrace.map((frame) => frame.raw).join("\n")}`
      : "Stack: none",
    group.affectedFiles.length > 0
      ? `Affected files: ${group.affectedFiles.slice(0, 12).join(", ")}`
      : ""
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

export function buildDiagnosticAssistPrompt(
  diagnostic: Diagnostic,
  language: "de" | "en"
): string {
  const lang =
    language === "de"
      ? "Antworte auf Deutsch für TF2-Mod-Entwicklung."
      : "Answer in English for TF2 mod development.";
  return [
    "You are assisting with static validation findings in Tpf2 Mod Studio.",
    lang,
    "Explain the finding and how to fix it without inventing missing files.",
    "",
    `Code: ${diagnostic.code}`,
    `Severity: ${diagnostic.severity}`,
    `Title: ${diagnostic.title}`,
    `Description: ${diagnostic.description}`,
    `Technical cause: ${diagnostic.technicalCause}`,
    `Recommended fix: ${diagnostic.recommendedFix}`,
    `File: ${diagnostic.file ?? "n/a"}`,
    `Line: ${diagnostic.line ?? "n/a"}`
  ].join("\n");
}

/**
 * Call a user-provided OpenAI-compatible Chat Completions API.
 * No provider is preselected; callers must supply base URL, key and model.
 */
export async function requestAiAssistance(
  settings: AiAssistSettings,
  prompt: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  if (!isAiConfigured(settings)) {
    throw new Error(
      "AI assist is optional and not configured. Enable it only if you want help, then enter your own API base URL, key and model."
    );
  }
  const base = settings.baseUrl.replace(/\/+$/u, "");
  const endpoint = `${base}/chat/completions`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey.trim()}`
    },
    body: JSON.stringify({
      model: settings.model.trim(),
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You help Transport Fever 2 mod authors interpret logs and validation findings. Be concise and actionable."
        },
        { role: "user", content: prompt }
      ]
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `AI request failed (${response.status}): ${body.slice(0, 400) || response.statusText}`
    );
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    output_text?: string;
  };
  const content =
    data.choices?.[0]?.message?.content?.trim() ||
    data.output_text?.trim() ||
    "";
  if (content.length === 0) {
    throw new Error("AI response did not contain text content.");
  }
  return content;
}
