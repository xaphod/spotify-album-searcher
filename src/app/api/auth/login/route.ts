import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const session = await getSession();

  const state = crypto.randomUUID();
  session.oauthState = state;
  await session.save();

  const origin = request.nextUrl.origin;
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${origin}/api/auth/callback`,
    scope: "user-library-read user-library-modify user-follow-read user-follow-modify",
    state,
  });

  return NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params.toString()}`
  );
}
