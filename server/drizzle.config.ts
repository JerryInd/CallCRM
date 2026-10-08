import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/api/db/schema.ts",
  out: "./src/api/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "./local.db",
  },
});
