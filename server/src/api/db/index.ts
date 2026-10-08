import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type DB = ReturnType<typeof drizzle<typeof schema>>;

export function createDB(env: { DB: D1Database }): DB {
  return drizzle(env.DB, { schema });
}
