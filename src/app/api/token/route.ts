import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { TokenResponse } from "@/lib/types";

export async function GET() {
  const session = await getSession();

  if (!session.refreshToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Refresh if within 5 minutes of expiry
  if (session.expiresAt - Date.now() < 300_000) {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: session.refreshToken,
      }),
    });

    if (!tokenRes.ok) {
      // Refresh token revoked or expired — user must re-login
      session.destroy();
      return NextResponse.json(
        { error: "Token refresh failed" },
        { status: 401 }
      );
    }

    const data = await tokenRes.json();
    session.accessToken = data.access_token;
    session.expiresAt = Date.now() + data.expires_in * 1000;
    // Spotify may rotate the refresh token
    if (data.refresh_token) {
      session.refreshToken = data.refresh_token;
    }
    await session.save();
  }

  const response: TokenResponse = {
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
  };

  return NextResponse.json(response);
}
