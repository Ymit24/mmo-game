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
        className="flex items-center gap-2 border border-border px-2 py-1 text-xs text-muted hover:border-vec-green/40 hover:text-vec-green transition-colors duration-150"
      >
        <span className="font-display text-[10px] text-vec-green">P</span>
        <span>Menu</span>
      </button>

      {open ? (
        <div className="absolute right-0 mt-1 w-36 border border-border bg-surface p-1 shadow-lg">
          {items.map((item) =>
            item.to ? (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setOpen(false)}
                className="block px-3 py-1.5 text-xs text-text hover:bg-deep hover:text-vec-green transition-colors duration-100"
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
                className="block w-full px-3 py-1.5 text-left text-xs text-muted hover:bg-deep hover:text-vec-green transition-colors duration-100"
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
    { label: "Characters", to: "/play" },
    { label: "Sign out", onClick: auth.signout },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-border/50 bg-void/90 px-4 py-2 md:px-6">
      <Link
        to="/"
        className="flex items-center gap-2 text-vec-green hover:text-vec-green text-glow-green transition-colors duration-150"
      >
        <span className="font-display text-xs md:text-sm tracking-wider">
          RoV
        </span>
      </Link>

      <div className="flex items-center gap-4 text-xs">
        {mode === "characterHub" ? (
          <Link
            to="/play"
            className="text-muted hover:text-vec-green transition-colors duration-150"
          >
            Characters
          </Link>
        ) : null}

        {auth.isAuthenticated ? (
          <UserMenu items={menuItems} />
        ) : (
          <button
            type="button"
            onClick={() => navigate("/signin")}
            className="text-vec-green/70 hover:text-vec-green transition-colors duration-150"
          >
            Sign In
          </button>
        )}
      </div>
    </nav>
  );
}
