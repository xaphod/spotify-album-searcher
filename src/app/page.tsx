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
          Discover albums you should save to your library. This app scans your
          liked songs and finds albums where you&apos;ve liked 70% or more of
          the tracks but haven&apos;t saved the album itself.
        </p>
        <a href="/api/auth/login" className="btn btn-primary btn-large">
          Login with Spotify
        </a>
      </div>
    </main>
  );
}
