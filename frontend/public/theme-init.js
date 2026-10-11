// Applies the saved (or system) colour theme before the first paint, so the
// page never flashes the wrong theme. Kept as a file so a strict
// Content-Security-Policy (script-src 'self') can stay in place.
(function () {
  try {
    var saved = localStorage.getItem("pyarena-theme");
    var theme =
      saved === "light" || saved === "dark"
        ? saved
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();
