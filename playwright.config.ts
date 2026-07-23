import { defineConfig } from "@playwright/test";

// Config minimale (T-009). L'app testée reste zero-dependency (EX-020) ;
// Playwright est une dépendance de TEST uniquement (devDependency, package.json).
// OPENTOUR_PROJECT = racine du projet analysé servi pendant l'e2e
// (le spec e2e actuel dépend des use cases d'un projet interne — fixture générique à prévoir).
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  webServer: {
    command: `python tools/serve.py "${process.env.OPENTOUR_PROJECT ?? ""}" 8642`,
    url: "http://127.0.0.1:8642/",
    reuseExistingServer: true,
    timeout: 15_000,
  },
  use: {
    baseURL: "http://127.0.0.1:8642/",
  },
});
