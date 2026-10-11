import { render, screen } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";

import { Providers } from "@/app/providers";
import { RouteError } from "@/app/RouteError";

function Boom(): never {
  throw new Error("kaboom");
}

describe("route error boundary", () => {
  it("shows the error inside the layout, so navigation keeps working", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined); // React logs caught errors
    const router = createMemoryRouter(
      [
        {
          element: (
            <div>
              <nav>site navigation</nav>
              <Outlet />
            </div>
          ),
          children: [{ path: "/", element: <Boom />, errorElement: <RouteError /> }],
        },
      ],
      { initialEntries: ["/"] },
    );
    render(
      <Providers>
        <RouterProvider router={router} />
      </Providers>,
    );
    expect(screen.getByTestId("route-error")).toHaveTextContent("This page hit an unexpected error");
    expect(screen.getByText("site navigation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
