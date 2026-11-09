import "dotenv/config";
import { createWorker } from "tesseract.js";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const cachePath = process.env.OCR_CACHE_PATH ?? join(tmpdir(), "cashflow-ocr");
await mkdir(cachePath, { recursive: true });
const worker = await createWorker("por", undefined, {
  cachePath,
  cacheMethod: "write",
});
await worker.terminate();
console.log(
  "Modelo OCR português preparado. Nenhuma imagem de usuário foi processada.",
);
