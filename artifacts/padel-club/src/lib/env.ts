import { z } from "zod";

const clientEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
});

const rawEnv = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || import.meta.env.EXPO_PUBLIC_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
};

export const env = clientEnvSchema.parse(rawEnv);
