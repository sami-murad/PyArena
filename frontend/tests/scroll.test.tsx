import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lenisInstances: { destroyed: boolean; scrollTo: ReturnType<typeof vi.fn> }[] = [];
vi.mock("lenis", () => ({
  default: class FakeLenis {
    destroyed = false;
    scrollTo = vi.fn();
    constructor() {
      lenisInstances.push(this);
    }
    destroy() {
      this.destroyed = true;
    }
  },
}));
vi.mock("lenis/dist/lenis.css", () => ({}));

import { activeParallaxCount, Parallax } from "@/features/scroll/Parallax";
import { Reveal } from "@/features/scroll/Reveal";
import { handleOf, MAX_PARALLAX_PER_PAGE } from "@/features/scroll/scrollRoutes";
import { ScrollReset } from "@/features/scroll/ScrollReset";
import { SmoothScroll, useLenis } from "@/features/scroll/SmoothScroll";

function mockReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes("reduce"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;
let observerCallbacks: ObserverCallback[] = [];

beforeEach(() => {
  lenisInstances.length = 0;
  observerCallbacks = [];
  mockReducedMotion(false);
  window.IntersectionObserver = class {
    constructor(cb: ObserverCallback) {
      observerCallbacks.push(cb);
    }
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Reveal", () => {
  it("stays hidden until it scrolls into view, then reveals once", () => {
    render(<Reveal>hello</Reveal>);
    const el = screen.getByTestId("reveal");
    expect(el).not.toHaveClass("is-revealed");
    expect(el).toHaveTextContent("hello"); // content is in the DOM for screen readers
    act(() => observerCallbacks[0]([{ isIntersecting: true }]));
    expect(el).toHaveClass("is-revealed");
  });

  it("shows content immediately with reduced motion", () => {
    mockReducedMotion(true);
    render(<Reveal>calm</Reveal>);
    expect(screen.getByTestId("reveal")).toHaveClass("is-revealed");
    expect(observerCallbacks).toHaveLength(0);
  });
});

describe("Parallax", () => {
  it(`moves at most ${MAX_PARALLAX_PER_PAGE} layers per page`, () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container, unmount } = render(
      <>
        {[1, 2, 3, 4].map((n) => (
          <Parallax key={n}>
            <span>{n}</span>
          </Parallax>
        ))}
      </>,
    );
    expect(activeParallaxCount()).toBe(MAX_PARALLAX_PER_PAGE);
    const states = [...container.querySelectorAll("[data-parallax]")].map((n) => n.getAttribute("data-parallax"));
    expect(states).toEqual(["on", "on", "on", "off"]);
    unmount();
    expect(activeParallaxCount()).toBe(0);
  });

  it("does nothing with reduced motion", () => {
    mockReducedMotion(true);
    render(
      <Parallax>
        <span>still</span>
      </Parallax>,
    );
    expect(activeParallaxCount()).toBe(0);
  });
});

function LenisProbe() {
  return <span data-testid="lenis">{useLenis() ? "on" : "off"}</span>;
}

describe("SmoothScroll", () => {
  it("creates Lenis only when enabled and destroys it when turned off", () => {
    const { rerender } = render(
      <SmoothScroll enabled={false}>
        <LenisProbe />
      </SmoothScroll>,
    );
    expect(lenisInstances).toHaveLength(0);
    expect(screen.getByTestId("lenis")).toHaveTextContent("off");

    rerender(
      <SmoothScroll enabled>
        <LenisProbe />
      </SmoothScroll>,
    );
    expect(lenisInstances).toHaveLength(1);
    expect(screen.getByTestId("lenis")).toHaveTextContent("on");

    rerender(
      <SmoothScroll enabled={false}>
        <LenisProbe />
      </SmoothScroll>,
    );
    expect(lenisInstances[0].destroyed).toBe(true);
    expect(screen.getByTestId("lenis")).toHaveTextContent("off");
  });

  it("never starts with reduced motion", () => {
    mockReducedMotion(true);
    render(
      <SmoothScroll enabled>
        <LenisProbe />
      </SmoothScroll>,
    );
    expect(lenisInstances).toHaveLength(0);
  });
});

describe("ScrollReset", () => {
  it("scrolls to the top on a new route but not for anchor links", async () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    const router = createMemoryRouter(
      [
        {
          path: "*",
          element: <ScrollReset />,
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    scrollTo.mockClear();
    await act(async () => router.navigate("/about"));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    await act(async () => router.navigate("/about#contact"));
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});

describe("route handles", () => {
  it("reads marketing and workspace flags safely", () => {
    expect(handleOf({ handle: { marketing: true } }).marketing).toBe(true);
    expect(handleOf({ handle: undefined })).toEqual({});
    expect(handleOf({ handle: "x" })).toEqual({});
  });
});
