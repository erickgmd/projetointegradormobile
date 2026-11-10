import { mkdir, copyFile } from "node:fs/promises";
<<<<<<< HEAD
import { build } from "esbuild";
=======
>>>>>>> d9bf11a4561965d4e81f4674fbd3672dba96aef6
await mkdir("public/vendor", { recursive: true });
for (const [from, to] of [
  ["node_modules/chart.js/dist/chart.umd.min.js", "chart.umd.min.js"],
  ["node_modules/jspdf/dist/jspdf.umd.min.js", "jspdf.umd.min.js"],
])
  await copyFile(from, "public/vendor/" + to);
<<<<<<< HEAD
await build({
  entryPoints: ["public/firebase-auth-entry.js"],
  outfile: "public/vendor/firebase-auth.js",
  bundle: true, minify: true, format: "iife", platform: "browser", target: "es2020",
  legalComments: "eof",
});
=======
>>>>>>> d9bf11a4561965d4e81f4674fbd3672dba96aef6
for (const [from, to] of [
  ["node_modules/chart.js/LICENSE.md", "chart-LICENSE.md"],
  ["node_modules/jspdf/LICENSE", "jspdf-LICENSE.txt"],
])
  await copyFile(from, "public/vendor/" + to);
