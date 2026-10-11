import { Outlet, useMatches } from "react-router-dom";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { handleOf } from "@/features/scroll/scrollRoutes";
import { ScrollReset } from "@/features/scroll/ScrollReset";
import { SmoothScroll } from "@/features/scroll/SmoothScroll";

export function MainLayout() {
  const matches = useMatches();
  const workspace = matches.some((m) => handleOf(m).workspace);
  const marketing = !workspace && matches.some((m) => handleOf(m).marketing);
  return (
    <SmoothScroll enabled={marketing}>
      <ScrollReset />
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
    </SmoothScroll>
  );
}
