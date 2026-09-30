import { build } from "esbuild";

await build({
  entryPoints: ["src/server/SiarDataHttpServer.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/siar-data-server.mjs",
  sourcemap: true,
});