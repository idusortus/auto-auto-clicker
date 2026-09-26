// web — thin Vite + TypeScript + vanilla DOM renderer.
//
// The renderer holds zero rules, zero balance numbers, and never mutates engine
// state directly; it only calls engine-core and renders what comes back.
//
// TODO (Phase 4): replace this boot placeholder with the real renderer.

// Side-effect import so the workspace package resolution is exercised by
// `npm run typecheck` (engine-core exports nothing yet — Phase 2).
import "@auto-auto-clicker/engine-core";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  app.textContent = "auto-auto-clicker — booting (scaffold)";
}

console.log("[auto-auto-clicker] web boot placeholder loaded");
