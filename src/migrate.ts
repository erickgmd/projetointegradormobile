import "dotenv/config";
import { readFile } from "node:fs/promises";
import { connectDatabase } from "./db.js";
const db = connectDatabase();
try {
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(8254132)");
    for (const file of [
      "001_schema.sql",
      "002_requisitos.sql",
      "003_google_lembrar.sql",
    ])
      await tx.query(
        await readFile(new URL("../database/" + file, import.meta.url), "utf8"),
      );
  });
  console.log("Migração concluída. Estrutura e políticas RLS atualizadas.");
} catch (error) {
  console.error(
    "Migração cancelada; alterações revertidas. Confira permissões do proprietário e duplicidades.",
    error,
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
