import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";

export function CharacterHubTopbar() {
  const auth = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-void/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 md:px-8">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="group flex items-center gap-2 rounded border border-border/70 bg-deep/80 px-2.5 py-1.5 hover:border-amber/60"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded border border-amber/40 bg-amber/10 font-display text-xs font-bold text-amber">
              M
            </span>
            <span className="font-display text-xs uppercase tracking-[0.12em] text-text-bright">
              MMO Game
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <p className="hidden max-w-52 truncate text-xs text-muted sm:block">
            {auth.user?.email}
          </p>
          <button
            type="button"
            onClick={() => {
              auth.signout();
              navigate("/", { replace: true });
            }}
            className="rounded border border-border px-3 py-1.5 text-xs text-text hover:border-amber/60 hover:text-text-bright"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
