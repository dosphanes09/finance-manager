import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import {
  getDatabaseEnvironmentInfo,
  loadDatabaseEnvironment,
  sanitizeDatabaseUrl,
} from "./env";

const { Pool } = pg;

export const databaseEnvironment = loadDatabaseEnvironment();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export async function checkDatabaseConnection() {
  const result = await pool.query(
    "select current_database() as database, current_user as user_name, inet_server_port() as port",
  );
  const tableResult = await pool.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  );

  return {
    connected: true,
    environment: getDatabaseEnvironmentInfo(),
    server: {
      database: result.rows[0]?.database,
      user: result.rows[0]?.user_name,
      port: result.rows[0]?.port,
    },
    tables: tableResult.rows.map((row) => row.table_name),
  };
}

export { getDatabaseEnvironmentInfo, sanitizeDatabaseUrl };
export * from "./schema";
