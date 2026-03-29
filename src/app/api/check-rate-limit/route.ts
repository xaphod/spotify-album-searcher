import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();

  if (!session.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Make a lightweight Spotify API call to check if we're rate limited
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "0", 10);
    return NextResponse.json({ rateLimited: true, retryAfter });
  }

  return NextResponse.json({ rateLimited: false });
}
