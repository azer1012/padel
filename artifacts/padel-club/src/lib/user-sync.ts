import type { User } from "@supabase/supabase-js";
import { apiFetch } from "@/services/api";

export async function syncUser(authUser: User) {
  try {
    const fullName = authUser.user_metadata?.full_name as string | undefined;
    const [firstName, ...lastNameParts] = fullName?.split(" ") ?? [];

    await apiFetch("/api/users/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: authUser.email,
        firstName: (authUser.user_metadata?.first_name as string | undefined) ?? firstName,
        lastName: ((authUser.user_metadata?.last_name as string | undefined) ?? lastNameParts.join(" ")) || null,
        imageUrl: authUser.user_metadata?.avatar_url,
      }),
    });
  } catch {
  }
}
