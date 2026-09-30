import { build } from "esbuild";

const fastApiBaseUrl = process.env.FINCASINRED_FASTAPI_BASE_URL ?? "";
const siarBaseUrl = process.env.FINCASINRED_SIAR_BASE_URL ?? "";

await build({
  entryPoints: ["src/browser/Paso7BrowserEntrypoint.ts"],
  bundle: true,
  format: "iife",
  globalName: "FincaSinRedPaso7",
  outfile: "dist/paso7-browser.js",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  define: {
    "process.env.FINCASINRED_FASTAPI_BASE_URL": JSON.stringify(fastApiBaseUrl),
    "process.env.FINCASINRED_SIAR_BASE_URL": JSON.stringify(siarBaseUrl),
  },
});