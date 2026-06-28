import { defineConfig } from "drizzle-kit";
import { loadDatabaseEnvironment } from "./src/env";

loadDatabaseEnvironment();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
