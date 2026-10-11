import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/app/App";
// Self-hosted fonts (no third-party font requests), all SIL Open Font License:
// Fredoka (display), Inter (body), JetBrains Mono (code), Comic Neue (mascot bubbles only).
import "@fontsource-variable/fredoka";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/comic-neue/400.css";
import "@fontsource/comic-neue/700.css";
import "@/styles/main.scss";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
