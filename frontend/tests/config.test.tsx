import { screen } from "@testing-library/react";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { primaryNavigation } from "@/config/navigation";
import { hasContactEmail, pageTitle, websitesInfo } from "@/config/websitesInfo";
import { mockFetch, renderWithApp } from "./helpers";

describe("centralized website information", () => {
  beforeEach(() => {
    mockFetch({});
  });

  it("header and footer read the name and tagline from websitesInfo", async () => {
    renderWithApp(
      <>
        <Header />
        <Footer />
      </>,
    );
    expect(screen.getByRole("link", { name: `${websitesInfo.name} home` })).toBeInTheDocument();
    expect(screen.getByText(websitesInfo.tagline)).toBeInTheDocument();
    expect(screen.getByText(`Version ${websitesInfo.version}`)).toBeInTheDocument();
  });

  it("does not render the placeholder contact address", () => {
    expect(websitesInfo.email.startsWith("REPLACE_WITH")).toBe(true);
    expect(hasContactEmail).toBe(false);
    renderWithApp(<Footer />);
    expect(screen.queryByText("Contact")).not.toBeInTheDocument();
  });

  it("builds page titles from the site name", () => {
    expect(pageTitle("Playground")).toBe(`Playground | ${websitesInfo.name}`);
    expect(pageTitle()).toContain(websitesInfo.tagline);
  });

  it("hides sign-in-only links from the navigation config", () => {
    const snippets = primaryNavigation.find((n) => n.label === "Snippets");
    expect(snippets?.requiresAuth).toBe(true);
  });
});
