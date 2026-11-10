import pg from "pg";
import { readFileSync } from "node:fs";
export interface Database {
  query(
    text: string,
    values?: any[],
  ): Promise<{ rows: any[]; rowCount: number | null }>;
  transaction<T>(fn: (db: Database) => Promise<T>, userId?: number): Promise<T>;
}
export function userDatabase(db: Database, userId: number): Database {
  if (!Number.isSafeInteger(userId) || userId <= 0)
    throw new Error("Usuário inválido para transação.");
  return {
    query: (sql, values) =>
      db.transaction((tx) => tx.query(sql, values), userId),
    transaction: (fn) => db.transaction(fn, userId),
  };
}
export function connectDatabase() {
  if (!process.env.DATABASE_URL)
    throw new Error("Configure DATABASE_URL no arquivo .env.");
  const ca = process.env.DB_CA_FILE
    ? readFileSync(process.env.DB_CA_FILE, "utf8")
    : undefined;
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    ssl:
      process.env.DB_SSL === "true"
        ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) }
        : undefined,
  });
  const database: Database & { end: () => Promise<void> } = {
    query: (sql, values) => pool.query(sql, values),
    end: () => pool.end(),
    transaction: async (fn, userId) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (userId !== undefined) {
          await client.query("SET LOCAL ROLE cashflow_app");
          await client.query("SELECT set_config('app.user_id',$1,true)", [
            String(userId),
          ]);
        }
        const tx: Database = {
          query: (sql, values) => client.query(sql, values),
          transaction: async (cb) => cb(tx),
        };
        const result = await fn(tx);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
  return database;
}
