import { Outlet, useMatches } from "react-router-dom";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";

interface RouteHandle {
  /** Full-height workspace pages (editors) hide the footer. */
  workspace?: boolean;
}

export function MainLayout() {
  const matches = useMatches();
  const workspace = matches.some((m) => (m.handle as RouteHandle | undefined)?.workspace);
  return (
    <div className={workspace ? "app app--workspace" : "app"}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header />
      <main id="main" className="main" tabIndex={-1}>
        <Outlet />
      </main>
      {!workspace && <Footer />}
    </div>
  );
}
