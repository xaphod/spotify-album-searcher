import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const session = await getSession();

  const state = crypto.randomUUID();
  session.oauthState = state;
  await session.save();

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")!;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");
  const origin = `${proto}://${host}`;
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${origin}/api/auth/callback`,
    scope: "user-library-read user-library-modify user-follow-read user-follow-modify",
    state,
    show_dialog: "true",
  });

  return NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params.toString()}`
  );
}
