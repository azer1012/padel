import type { User } from "@supabase/supabase-js";
import { syncProfile } from "@workspace/api-client-react";

/**
 * After sign-in: lets the API fill an empty profile from the provider's metadata
 * (Google name and avatar). The e-mail is never sent: the API takes it from the token.
 */
export async function syncUser(authUser: User) {
  const meta = authUser.user_metadata ?? {};
  const [firstName, ...rest] = ((meta.full_name as string | undefined) ?? "").split(" ");
  try {
    await syncProfile({
      firstName: (meta.first_name as string | undefined) ?? firstName,
      lastName: ((meta.last_name as string | undefined) ?? rest.join(" ")) || null,
      imageUrl: meta.avatar_url as string | undefined,
    });
  } catch {
    // Non-blocking: the database already creates the profile at signup, and the
    // sync runs again on the next sign-in.
  }
}
