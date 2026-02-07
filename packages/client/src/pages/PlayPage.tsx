import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { WorldGrid } from "../components/WorldGrid";

export function PlayPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  return (
    <div className="noise-overlay relative min-h-dvh overflow-hidden">
      <WorldGrid />
      <div className="relative z-10 px-6 py-6 md:px-10">
        <div className="max-w-4xl mx-auto border border-border rounded-xl bg-deep/80 backdrop-blur-sm p-7 md:p-10">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan mb-4">Authenticated</p>
          <h1 className="font-display text-3xl md:text-4xl text-text-bright mb-4">Play Client Coming Soon</h1>
          <p className="text-muted mb-6 leading-relaxed max-w-2xl">
            Your auth flow is live. Next step is wiring the actual realtime game client and WS session handshake.
          </p>
          <div className="grid gap-4 md:grid-cols-[1fr_auto] items-end">
            <div className="rounded-md border border-border bg-abyss p-4">
              <span className="block text-xs font-mono uppercase tracking-[0.15em] text-muted mb-1">
                Signed in as
              </span>
              <span className="text-text-bright">{auth.user?.email ?? "Unknown user"}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/"
                className="rounded-md border border-border px-4 py-2 text-sm text-text hover:text-text-bright hover:border-amber/40 transition-colors duration-200"
              >
                Back to landing
              </Link>
              <button
                type="button"
                onClick={() => {
                  auth.signout();
                  navigate("/signin", { replace: true });
                }}
                className="rounded-md bg-amber px-4 py-2 text-sm font-display font-semibold text-void hover:bg-amber-glow transition-colors duration-200"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
