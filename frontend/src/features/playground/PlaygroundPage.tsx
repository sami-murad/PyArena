import { Copy, Download, Eraser, Play, RotateCcw, Save, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { LazyCodeEditor } from "@/components/editor/LazyCodeEditor";
import { useToast } from "@/components/feedback/Toast";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { appConfig } from "@/config/appConfig";
import { features } from "@/config/features";
import { routes } from "@/config/navigation";
import { useAuth } from "@/features/auth/AuthContext";
import { OutputConsole } from "@/features/playground/components/OutputConsole";
import { useCodeRunner } from "@/features/playground/hooks/useCodeRunner";
import { SaveSnippetModal } from "@/features/snippets/components/SaveSnippetModal";
import { snippetService } from "@/features/snippets/services/snippetService";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { errorMessage } from "@/services/apiClient";
import type { Snippet } from "@/types/api";
import { copyText, downloadText } from "@/utils/download";

export default function PlaygroundPage() {
  useDocumentTitle("Playground");
  const { user } = useAuth();
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useLocalStorage(appConfig.storageKeys.playgroundDraft, appConfig.defaultPlaygroundCode);
  const [stdin, setStdin] = useLocalStorage(appConfig.storageKeys.playgroundStdin, "");
  const [snippet, setSnippet] = useState<Snippet | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const runner = useCodeRunner();

  const snippetId = Number(params.get("snippet")) || null;

  useEffect(() => {
    if (!snippetId || !user) return;
    const controller = new AbortController();
    snippetService
      .get(snippetId, controller.signal)
      .then((s) => {
        setSnippet(s);
        setCode(s.code);
        setStdin(s.stdin);
        runner.clear();
      })
      .catch((err) => {
        if (!controller.signal.aborted) notify(errorMessage(err), "danger");
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snippetId, user]);

  const run = useCallback(() => {
    if (runner.phase !== "running") void runner.run(code, stdin);
  }, [runner, code, stdin]);

  function reset() {
    setCode(snippet?.code ?? appConfig.defaultPlaygroundCode);
    runner.clear();
  }

  function newFile() {
    setSnippet(null);
    setParams({});
    setCode("");
    setStdin("");
    runner.clear();
  }

  async function copy() {
    notify((await copyText(code)) ? "Code copied to the clipboard." : "Copy failed. Select the code and copy it manually.",
      "info");
  }

  async function save(title: string) {
    const input = { title, code, stdin };
    const saved = snippet ? await snippetService.update(snippet.id, input) : await snippetService.create(input);
    setSnippet(saved);
    setParams({ snippet: String(saved.id) });
    notify(snippet ? "Snippet updated." : "Snippet saved.", "success");
  }

  const running = runner.phase === "running";
  const errorLine = runner.result?.explanation?.line ?? null;
  const fileName = snippet ? `${snippet.title}` : "main.py";

  return (
    <div className="workspace playground">
      <div className="toolbar">
        <div className="toolbar__group">
          <span className="lang-chip" title="Python 3">
            <span className="lang-chip__dot" aria-hidden /> Python 3
          </span>
          <span className="toolbar__file" title={fileName}>
            {fileName}
          </span>
        </div>
        <div className="toolbar__group toolbar__group--actions">
          <Tooltip content="Reset to the last saved version">
            <button type="button" className="icon-btn" onClick={reset} aria-label="Reset code">
              <RotateCcw size={17} aria-hidden />
            </button>
          </Tooltip>
          <Tooltip content="Start an empty file">
            <button type="button" className="icon-btn" onClick={newFile} aria-label="Clear editor">
              <Eraser size={17} aria-hidden />
            </button>
          </Tooltip>
          <Tooltip content="Copy code">
            <button type="button" className="icon-btn" onClick={copy} aria-label="Copy code">
              <Copy size={17} aria-hidden />
            </button>
          </Tooltip>
          <Tooltip content="Download as .py">
            <button
              type="button"
              className="icon-btn"
              onClick={() => downloadText(fileName.endsWith(".py") ? fileName : `${fileName}.py`, code)}
              aria-label="Download code"
            >
              <Download size={17} aria-hidden />
            </button>
          </Tooltip>
          {features.snippets &&
            (user ? (
              <Button size="sm" variant="ghost" icon={<Save size={16} aria-hidden />} onClick={() => setSaveOpen(true)}>
                {snippet ? "Update" : "Save"}
              </Button>
            ) : (
              <Link to={routes.login} state={{ from: routes.playground }} className="toolbar__hint">
                Sign in to save snippets
              </Link>
            ))}
          {running ? (
            <Button variant="danger" icon={<Square size={15} aria-hidden />} onClick={runner.stop}>
              Stop
            </Button>
          ) : (
            <Button variant="primary" icon={<Play size={16} aria-hidden />} onClick={run}>
              Run
            </Button>
          )}
        </div>
      </div>

      <div className="playground__grid">
        <section className="panel playground__editor" aria-label="Editor">
          <LazyCodeEditor value={code} onChange={setCode} onRun={run} errorLine={errorLine} path="playground/main.py" />
        </section>
        <div className="playground__side">
          <section className="panel stdin">
            <header className="panel__header">
              <h2 className="panel__title">
                <label htmlFor="stdin">Input</label>
              </h2>
              <span className="panel__hint">Read with input(), one line per call</span>
            </header>
            <textarea
              id="stdin"
              className="stdin__field"
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              spellCheck={false}
              placeholder="Type the program's standard input here"
              maxLength={appConfig.maxStdinChars}
            />
          </section>
          <OutputConsole phase={runner.phase} result={runner.result} error={runner.error} />
        </div>
      </div>

      {saveOpen && (
        <SaveSnippetModal
          mode={snippet ? "update" : "create"}
          initialTitle={snippet?.title ?? "Untitled snippet"}
          onClose={() => setSaveOpen(false)}
          onSave={save}
        />
      )}
    </div>
  );
}
