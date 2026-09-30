import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.join(projectRoot, "dist");

const htmlPages = [
  "index.html",
  "portada-v12-responsive-ajustada.html",
  "PASO.1.html",
  "PASO.2.html",
  "PASO.3.html",
  "PASO.4.html",
  "PASO.5.html",
  "PASO.6.html",
  "PASO.7.html",
  "PASO.PAGO.html",
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const page of htmlPages) {
  await cp(path.join(projectRoot, page), path.join(outputDirectory, page));
}

await cp(
  path.join(projectRoot, "assets"),
  path.join(outputDirectory, "assets"),
  { recursive: true },
);
await cp(
  path.join(projectRoot, "Portada v12 Image 28 ago.png"),
  path.join(outputDirectory, "Portada v12 Image 28 ago.png"),
);

process.chdir(projectRoot);
process.env.FINCASINRED_FASTAPI_BASE_URL ||= "https://fincasinred.onrender.com";
await import("./esbuild.paso7.mjs");
await access(path.join(outputDirectory, "paso7-browser.js"));

console.log(`Static Site prepared in ${path.relative(projectRoot, outputDirectory)}`);