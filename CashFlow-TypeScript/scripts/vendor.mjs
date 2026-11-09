import { mkdir, copyFile } from "node:fs/promises";
await mkdir("public/vendor", { recursive: true });
for (const [from, to] of [
  ["node_modules/chart.js/dist/chart.umd.min.js", "chart.umd.min.js"],
  ["node_modules/jspdf/dist/jspdf.umd.min.js", "jspdf.umd.min.js"],
])
  await copyFile(from, "public/vendor/" + to);
for (const [from, to] of [
  ["node_modules/chart.js/LICENSE.md", "chart-LICENSE.md"],
  ["node_modules/jspdf/LICENSE", "jspdf-LICENSE.txt"],
])
  await copyFile(from, "public/vendor/" + to);
