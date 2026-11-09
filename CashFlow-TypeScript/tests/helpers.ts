import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { Database } from "../src/db.js";
export async function testDatabase() {
  const pg = new PGlite();
  for (const f of [
    "001_schema.sql",
    "002_requisitos.sql",
    "003_google_lembrar.sql",
  ])
    await pg.exec(await readFile("database/" + f, "utf8"));
  const wrap = (client: any): Database => ({
    query: async (sql: string, params: any[] = []) => {
      const r = await client.query(sql, params);
      return { rows: r.rows as any[], rowCount: r.affectedRows ?? 0 };
    },
    transaction: async (fn) => fn(wrap(client)),
  });
  const db = wrap(pg);
  db.transaction = (fn, userId) =>
    pg.transaction(async (client) => {
      if (userId !== undefined) {
        await client.exec("SET LOCAL ROLE cashflow_app");
        await client.query("SELECT set_config('app.user_id',$1,true)", [
          String(userId),
        ]);
      }
      return fn(wrap(client));
    });
  return { pg, db };
}
