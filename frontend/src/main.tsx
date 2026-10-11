import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/app/App";
// Self-hosted variable fonts (no third-party font requests).
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";
import "@/styles/main.scss";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
