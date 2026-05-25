export async function syncUser(clerkUser: { id: string; primaryEmailAddress?: { emailAddress: string } | null; firstName?: string | null; lastName?: string | null; imageUrl?: string }) {
  try {
    await fetch("/api/users/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: clerkUser.primaryEmailAddress?.emailAddress,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
      }),
    });
  } catch {
  }
}
