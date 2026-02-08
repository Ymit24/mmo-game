import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";

type TopbarMode = "landing" | "characterHub";

interface SiteTopbarProps {
  mode: TopbarMode;
}

interface MenuItem {
  label: string;
  to?: string;
  onClick?: () => void;
}

function UserMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onWindowClick(event: MouseEvent): void {
      if (!menuRef.current) {
        return;
      }
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      window.addEventListener("click", onWindowClick);
    }
    return () => {
      window.removeEventListener("click", onWindowClick);
    };
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 rounded-full border border-border bg-deep/85 px-2 py-1.5 hover:border-amber/60"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber font-mono text-xs font-bold text-void">
          P
        </span>
        <span className="text-xs text-text-bright">Profile</span>
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-44 rounded-lg border border-border bg-abyss p-1 shadow-xl">
          {items.map((item) =>
            item.to ? (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setOpen(false)}
                className="block rounded px-3 py-2 text-sm text-text hover:bg-deep"
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
                className="block w-full rounded px-3 py-2 text-left text-sm text-muted hover:bg-deep hover:text-text"
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export function SiteTopbar({ mode }: SiteTopbarProps) {
  const auth = useAuth();
  const navigate = useNavigate();

  const menuItems: MenuItem[] = [
    { label: "Home", to: "/" },
    { label: "Character Hub", to: "/play" },
    { label: "Sign out", onClick: auth.signout },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-10">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="flex h-8 w-8 items-center justify-center rounded border border-amber/40 bg-amber/10"
        >
          <span className="font-display text-sm font-bold leading-none text-amber">
            M
          </span>
        </Link>
        <span className="font-display text-sm font-semibold uppercase tracking-wide text-text-bright">
          MMO Game
        </span>
      </div>

      <div className="flex items-center gap-6 text-sm">
        {mode === "landing" ? (
          <>
            <a
              href="#about"
              className="text-muted transition-colors duration-200 hover:text-text-bright"
            >
              About
            </a>
            <a
              href="#features"
              className="text-muted transition-colors duration-200 hover:text-text-bright"
            >
              How it works
            </a>
          </>
        ) : (
          <Link
            to="/play"
            className="text-muted transition-colors duration-200 hover:text-text-bright"
          >
            Character Hub
          </Link>
        )}

        {auth.isAuthenticated ? (
          <UserMenu items={menuItems} />
        ) : (
          <button
            type="button"
            onClick={() => navigate("/signin")}
            className="font-display font-medium text-amber transition-colors duration-200 hover:text-amber-glow"
          >
            Log in
          </button>
        )}
      </div>
    </nav>
  );
}
