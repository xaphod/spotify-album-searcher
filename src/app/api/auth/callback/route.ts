import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { SpotifyUser } from "@/lib/types";

export async function GET(request: NextRequest) {
  console.log("[oauth] callback route hit");
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")!;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");
  const origin = `${proto}://${host}`;

  if (error) {
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/?error=missing_params`);
  }

  // Validate CSRF state
  const session = await getSession();
  const savedState = session.oauthState;
  if (state !== savedState) {
    return NextResponse.redirect(`${origin}/?error=state_mismatch`);
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}/api/auth/callback`,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error("Token exchange failed:", body);
    return NextResponse.redirect(`${origin}/?error=token_exchange_failed`);
  }

  const tokenData = await tokenRes.json();
  console.log("[oauth] granted scopes:", tokenData.scope);

  const grantedScopes: string[] = (tokenData.scope ?? "").split(" ");
  const required = [
    "user-library-read",
    "user-library-modify",
    "user-follow-read",
    "user-follow-modify",
  ];
  const missing = required.filter((s) => !grantedScopes.includes(s));
  if (missing.length > 0) {
    return NextResponse.redirect(
      `${origin}/?error=missing_scopes:${missing.join(",")}`
    );
  }

  // Fetch user profile for display name
  let userName: string | undefined;
  try {
    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (meRes.ok) {
      const user: SpotifyUser = await meRes.json();
      userName = user.display_name ?? user.id;
    }
  } catch {
    // Non-critical, continue without display name
  }

  // Save session
  session.accessToken = tokenData.access_token;
  session.refreshToken = tokenData.refresh_token;
  session.expiresAt = Date.now() + tokenData.expires_in * 1000;
  session.userName = userName;
  delete session.oauthState;
  await session.save();

  return NextResponse.redirect(`${origin}/scan`);
}
