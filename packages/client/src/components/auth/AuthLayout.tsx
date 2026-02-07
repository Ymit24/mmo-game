import type { PropsWithChildren, ReactNode } from "react";

import { Link } from "react-router-dom";
import { WorldGrid } from "../WorldGrid";

interface AuthLayoutProps extends PropsWithChildren {
  title: string;
  subtitle: string;
  footer: ReactNode;
}

export function AuthLayout({ title, subtitle, footer, children }: AuthLayoutProps) {
  return (
    <div className="noise-overlay relative min-h-dvh overflow-hidden">
      <WorldGrid />
      <header className="relative z-10 px-6 py-5 md:px-10">
        <Link
          to="/"
          className="inline-flex items-center gap-3 text-sm text-muted hover:text-text-bright transition-colors duration-200"
        >
          <span className="w-8 h-8 rounded border border-amber/40 bg-amber/10 flex items-center justify-center">
            <span className="font-display font-bold text-amber text-sm leading-none">M</span>
          </span>
          <span className="font-display tracking-wide uppercase">MMO Game</span>
        </Link>
      </header>
      <main className="relative z-10 flex items-center justify-center px-6 pb-10 md:px-10 md:pb-16">
        <div className="w-full max-w-md rounded-xl border border-border bg-deep/80 backdrop-blur-sm p-7 md:p-9 glow-cyan">
          <h1 className="font-display text-3xl text-text-bright leading-tight mb-2">{title}</h1>
          <p className="text-muted text-sm mb-6">{subtitle}</p>
          {children}
          <div className="mt-6 pt-5 border-t border-border/70 text-sm text-muted">{footer}</div>
        </div>
      </main>
    </div>
  );
}
