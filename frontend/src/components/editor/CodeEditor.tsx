import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";

import { useTheme } from "@/app/ThemeContext";
import { Spinner } from "@/components/ui/Spinner";
import { applyEditorTheme, monaco } from "@/components/editor/monacoSetup";

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  /** Ctrl/Cmd + Enter */
  onRun?: () => void;
  readOnly?: boolean;
  /** 1-based line to highlight as an error. */
  errorLine?: number | null;
  ariaLabel?: string;
  /** Distinct paths keep separate undo histories per document. */
  path?: string;
}

export default function CodeEditor({
  value,
  onChange,
  onRun,
  readOnly = false,
  errorLine = null,
  ariaLabel = "Python code editor",
  path,
}: CodeEditorProps) {
  const { theme } = useTheme();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const onRunRef = useRef(onRun);

  useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);

  useEffect(() => {
    monaco.editor.setTheme(applyEditorTheme(theme));
  }, [theme]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    decorations.current?.clear();
    if (errorLine && errorLine > 0 && errorLine <= (editor.getModel()?.getLineCount() ?? 0)) {
      decorations.current = editor.createDecorationsCollection([
        {
          range: new monaco.Range(errorLine, 1, errorLine, 1),
          options: { isWholeLine: true, className: "editor-error-line", linesDecorationsClassName: "editor-error-gutter" },
        },
      ]);
    }
  }, [errorLine, value]);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRunRef.current?.());
  };

  return (
    <div className="code-editor">
      <Editor
        language="python"
        path={path}
        value={value}
        theme={applyEditorTheme(theme)}
        onChange={(v) => onChange?.(v ?? "")}
        onMount={handleMount}
        loading={<Spinner label="Loading editor" />}
        options={{
          readOnly,
          ariaLabel,
          fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--font-code") || "monospace",
          fontSize: 14,
          lineHeight: 22,
          fontLigatures: false,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          tabSize: 4,
          insertSpaces: true,
          detectIndentation: false,
          renderLineHighlight: "line",
          padding: { top: 14, bottom: 14 },
          smoothScrolling: true,
          automaticLayout: true,
          wordWrap: "off",
          bracketPairColorization: { enabled: true },
          guides: { indentation: true },
          stickyScroll: { enabled: false },
          accessibilitySupport: "auto",
          tabFocusMode: false,
        }}
      />
    </div>
  );
}
