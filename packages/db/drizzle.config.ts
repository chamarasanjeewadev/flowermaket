import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Use the session-mode (port 5432) connection string for migrations.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
  // Never let drizzle-kit touch Supabase-managed schemas.
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
});
