/**
 * Self-hosted Monaco: bundled by Vite instead of downloaded from a CDN, so the
 * editor works offline and under a strict Content-Security-Policy.
 */
import { loader } from "@monaco-editor/react";
import * as monaco from "@/components/editor/monacoCore";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker: (workerId: string, label: string) => Worker };
  }
}

window.MonacoEnvironment = {
  // Python needs no language worker; only the core editor worker is used.
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });

/** Reads a colour token from the active theme (single source: styles/themes). */
function token(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
  return toHex(raw);
}

function toHex(color: string): string {
  if (color.startsWith("#")) return color.length === 4 ? `#${[...color.slice(1)].map((c) => c + c).join("")}` : color;
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return "#000000";
  const [r, g, b, a = "1"] = m[1].split(",").map((s) => s.trim());
  const hex = (n: string) => Math.round(Number(n)).toString(16).padStart(2, "0");
  const alpha = Number(a) < 1 ? hex(String(Number(a) * 255)) : "";
  return `#${hex(r)}${hex(g)}${hex(b)}${alpha}`;
}

/** (Re)defines the editor theme from the current CSS tokens and returns its name. */
export function applyEditorTheme(mode: "dark" | "light"): string {
  const name = `pyarena-${mode}`;
  const isDark = mode === "dark";
  const accent = token("accent").replace("#", "");
  const primary = token("primary-text").replace("#", "");
  const muted = token("muted").replace("#", "");
  const success = token("success").replace("#", "");
  const warning = token("warning").replace("#", "");
  const danger = token("danger").replace("#", "");
  monaco.editor.defineTheme(name, {
    base: isDark ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: muted, fontStyle: "italic" },
      { token: "keyword", foreground: accent, fontStyle: "bold" },
      { token: "string", foreground: success },
      { token: "number", foreground: warning },
      { token: "type", foreground: primary },
      { token: "delimiter", foreground: muted },
      { token: "invalid", foreground: danger },
    ],
    colors: {
      "editor.background": token("editor-background"),
      "editor.foreground": token("text"),
      "editor.lineHighlightBackground": token("editor-line"),
      "editorLineNumber.foreground": token("editor-gutter"),
      "editorLineNumber.activeForeground": token("text"),
      "editorCursor.foreground": token("primary"),
      "editor.selectionBackground": token("selection"),
      "editorIndentGuide.background1": token("border"),
      "editorWidget.background": token("surface-raised"),
      "editorWidget.border": token("border"),
      "focusBorder": token("focus"),
    },
  });
  return name;
}

export { monaco };
