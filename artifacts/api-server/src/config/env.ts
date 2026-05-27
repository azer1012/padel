import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const candidate of [
  resolve(process.cwd(), ".env.local"),
  resolve(process.cwd(), "../../.env.local"),
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
]) {
  if (!existsSync(candidate)) continue;

  for (const line of readFileSync(candidate, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] ??= value;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CORS_ORIGIN: z.string().default("*"),
  FRONTEND_URL: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
});

const parsed = envSchema.parse(process.env);

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  databaseUrl: parsed.DATABASE_URL,
  supabaseUrl: parsed.VITE_SUPABASE_URL,
  supabaseAnonKey: parsed.VITE_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
  corsOrigin: parsed.CORS_ORIGIN === "*" ? true : parsed.CORS_ORIGIN.split(",").map((origin: string) => origin.trim()),
  frontendUrl: parsed.FRONTEND_URL,
  logLevel: parsed.LOG_LEVEL,
};
