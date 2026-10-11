import { lazy, Suspense } from "react";

import type { CodeEditorProps } from "@/components/editor/CodeEditor";
import { Spinner } from "@/components/ui/Spinner";

// Monaco is large, so it loads only on pages that show an editor.
const CodeEditor = lazy(() => import("@/components/editor/CodeEditor"));

export function LazyCodeEditor(props: CodeEditorProps) {
  return (
    <Suspense
      fallback={
        <div className="code-editor code-editor--loading">
          <Spinner label="Loading editor" />
        </div>
      }
    >
      <CodeEditor {...props} />
    </Suspense>
  );
}
