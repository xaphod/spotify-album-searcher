import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();

  if (session.accessToken && session.refreshToken) {
    redirect("/scan");
  }

  return (
    <main className="landing">
      <div className="landing-content">
        <h1>Spotify Album Searcher</h1>
        <p>
          Two tools for tidying your Spotify library: find albums you should
          save (where you&apos;ve liked 70%+ of the tracks), or follow the
          artists from albums you&apos;ve saved.
        </p>
        <a href="/api/auth/login" className="btn btn-primary btn-large">
          Login with Spotify
        </a>
      </div>
    </main>
  );
}
