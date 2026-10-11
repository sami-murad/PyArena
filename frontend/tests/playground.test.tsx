import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PlaygroundPage from "@/features/playground/PlaygroundPage";
import { jsonResponse, mockFetch, renderWithApp } from "./helpers";

// Monaco does not run in jsdom; a textarea stands in for the editor.
vi.mock("@/components/editor/LazyCodeEditor", () => ({
  LazyCodeEditor: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea aria-label="Python code editor" value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

describe("PlaygroundPage", () => {
  beforeEach(() => localStorage.clear());

  it("sends the editor code and stdin to the backend and shows the real result", async () => {
    const calls = mockFetch({
      "POST /execute": () =>
        jsonResponse({
          status: "OK",
          stdout: "hello Ada\n",
          stderr: "",
          exit_code: 0,
          duration_ms: 18,
          truncated: false,
          error_type: null,
          kill_reason: null,
          explanation: null,
        }),
    });
    const user = userEvent.setup();
    renderWithApp(<PlaygroundPage />, "/playground");

    const editor = screen.getByLabelText("Python code editor");
    await user.clear(editor);
    await user.type(editor, "print('hello', input())");
    await user.type(screen.getByLabelText("Input"), "Ada");
    await user.click(screen.getByRole("button", { name: "Run" }));

    expect(await screen.findByText("hello Ada")).toBeInTheDocument();
    const run = calls.find((c) => c.path === "/execute");
    expect(run?.body).toEqual({ code: "print('hello', input())", stdin: "Ada" });
    expect(screen.getByText("Finished")).toBeInTheDocument();
  });

  it("shows a clear message when the runner is unavailable", async () => {
    mockFetch({ "POST /execute": () => jsonResponse({ detail: "The code runner is unavailable right now." }, 503) });
    renderWithApp(<PlaygroundPage />, "/playground");
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The code runner is unavailable right now."));
  });

  it("asks guests to sign in before saving snippets", async () => {
    mockFetch({});
    renderWithApp(<PlaygroundPage />, "/playground");
    expect(await screen.findByRole("link", { name: "Sign in to save snippets" })).toBeInTheDocument();
  });
});

describe("PlaygroundPage error details", () => {
  beforeEach(() => localStorage.clear());

  it("passes the worker's development detail through to the console", async () => {
    mockFetch({
      "POST /execute": () =>
        jsonResponse({ detail: "The code runner is unavailable right now. (auth: invalid worker token)" }, 503),
    });
    renderWithApp(<PlaygroundPage />, "/playground");
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("auth: invalid worker token"));
  });
});
