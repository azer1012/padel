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
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "")
      // Expand ${OTHER_VAR} references, as .env.example uses them
      .replace(/\$\{(\w+)\}/g, (_, name: string) => process.env[name] ?? "");
    process.env[key] ??= value;
  }
}

// Club times are always computed with CLUB_TIMEZONE explicitly (lib/club-time.ts), so the
// API does not depend on the host's clock zone. The process zone is still set to the
// club's so log timestamps and any plain Date formatting read as club time.
process.env.TZ ||= process.env.CLUB_TIMEZONE || "Africa/Tunis";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Optional: verify access tokens locally instead of calling Supabase Auth on every request
  SUPABASE_JWT_SECRET: z.string().optional(),
  CORS_ORIGIN: z.string().default("*"),
  FRONTEND_URL: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  // Club identity used in emails and push notifications (branding is per installation).
  // Operational rules (prices, duration, hours…) are NOT env: they live in club_settings.
  CLUB_NAME: z.string().default("Padel Club"),
  CLUB_TIMEZONE: z.string().default("Africa/Tunis"),
  CLUB_ADDRESS: z.string().optional(),
  // Email (Resend). When RESEND_API_KEY is missing, emails are logged instead of sent.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REPLY_TO: z.string().optional(),
  // Web push (generate once with: npx web-push generate-vapid-keys)
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  // Scheduled jobs (reminders, "match finished" emails)
  JOBS_ENABLED: z.enum(["true", "false"]).default("true"),
  CRON_SECRET: z.string().optional(),
  // Max write requests (POST/PATCH/DELETE) per IP per minute. 0 disables the limiter.
  RATE_LIMIT_WRITES_PER_MINUTE: z.coerce.number().int().min(0).default(60),
  // Set when the API runs behind a reverse proxy / load balancer (Render, Fly, Nginx…)
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
});

// Normalize environment variables
process.env.SUPABASE_URL ||= process.env.VITE_SUPABASE_URL;
process.env.SUPABASE_ANON_KEY ||= process.env.VITE_SUPABASE_ANON_KEY;

const parsed = envSchema.parse(process.env);

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  databaseUrl: parsed.DATABASE_URL,
  supabaseUrl: parsed.SUPABASE_URL,
  supabaseAnonKey: parsed.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
  supabaseJwtSecret: parsed.SUPABASE_JWT_SECRET || undefined,
  corsOrigin:
    parsed.CORS_ORIGIN === "*"
      ? true
      : parsed.CORS_ORIGIN.split(",").map((origin: string) => origin.trim()),
  frontendUrl: parsed.FRONTEND_URL,
  logLevel: parsed.LOG_LEVEL,
  clubName: parsed.CLUB_NAME,
  clubTimezone: parsed.CLUB_TIMEZONE,
  clubAddress: parsed.CLUB_ADDRESS,
  resendApiKey: parsed.RESEND_API_KEY,
  emailFrom: parsed.EMAIL_FROM ?? `${parsed.CLUB_NAME} <no-reply@example.com>`,
  emailReplyTo: parsed.EMAIL_REPLY_TO,
  vapidPublicKey: parsed.VAPID_PUBLIC_KEY,
  vapidPrivateKey: parsed.VAPID_PRIVATE_KEY,
  vapidSubject: parsed.VAPID_SUBJECT ?? "mailto:contact@example.com",
  jobsEnabled: parsed.JOBS_ENABLED === "true",
  cronSecret: parsed.CRON_SECRET,
  rateLimitWritesPerMinute: parsed.RATE_LIMIT_WRITES_PER_MINUTE,
  trustProxy: parsed.TRUST_PROXY === "true",
};
