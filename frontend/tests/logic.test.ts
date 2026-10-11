import { safeRedirect } from "@/features/auth/LoginPage";
import { validateRegistration } from "@/features/auth/RegisterPage";
import { validateRun } from "@/features/playground/services/executionService";
import { api, ApiError, newIdempotencyKey } from "@/services/apiClient";
import { formatClock, formatDuration, formatSeconds } from "@/utils/format";
import { jsonResponse } from "./helpers";

describe("validation", () => {
  it("checks run requests before sending them", () => {
    expect(validateRun("", "")).toMatch(/Write some code/);
    expect(validateRun("print(1)", "")).toBeNull();
    expect(validateRun("x".repeat(20_001), "")).toMatch(/limited/);
  });

  it("validates registration fields", () => {
    expect(validateRegistration("ab", "x", "short")).toEqual({
      username: expect.any(String),
      email: expect.any(String),
      password: expect.any(String),
    });
    expect(validateRegistration("ada_l", "ada@example.org", "long-enough")).toEqual({});
  });

  it("only redirects to same-site paths after sign-in", () => {
    expect(safeRedirect("/snippets")).toBe("/snippets");
    expect(safeRedirect("https://evil.example")).toBe("/playground");
    expect(safeRedirect("//evil.example")).toBe("/playground");
    expect(safeRedirect(undefined)).toBe("/playground");
  });
});

describe("apiClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends JSON with credentials and parses the reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.post("/execute", { code: "x" })).resolves.toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/execute");
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("sends an Idempotency-Key when given one", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.post("/competitions/1/submissions", { code: "x" }, { idempotencyKey: "click-123456" });
    expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe("click-123456");
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });

  it("turns server errors into readable messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "Room is full.", code: "full" }, 409)));
    const err = (await api.get("/x").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Room is full.");
    expect(err.code).toBe("full");
  });

  it("keeps the server's request id for error reports", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "boom" }), { status: 500, headers: { "X-Request-ID": "req-abc-123" } }),
      ),
    );
    const err = (await api.get("/x").catch((e: unknown) => e)) as ApiError;
    expect(err.requestId).toBe("req-abc-123");
  });

  it("explains FastAPI validation errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ detail: [{ loc: ["body", "email"], msg: "value is not a valid email" }] }, 422)),
    );
    await expect(api.get("/x")).rejects.toThrow("email: value is not a valid email");
  });

  it("reports network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = (await api.get("/x").catch((e: unknown) => e)) as ApiError;
    expect(err.isNetwork).toBe(true);
  });
});

describe("formatting", () => {
  it("formats clocks and durations", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(-3)).toBe("0:00");
    expect(formatDuration(42)).toBe("42 ms");
    expect(formatDuration(1500)).toBe("1.50 s");
    expect(formatSeconds(38.25)).toBe("38.3 s");
    expect(formatSeconds(125)).toBe("2 min 5 s");
  });
});
