import { useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { WorldGrid } from "./components/WorldGrid";
import { SiteTopbar } from "./components/navigation/SiteTopbar";

const GAME_FEATURES = [
  {
    icon: "~",
    title: "Persistent World",
    desc: "One shared world. What you build stays. What you break stays broken. Every player shares the same map, economy, and timeline.",
  },
  {
    icon: ">",
    title: "Browser Native",
    desc: "No downloads, no launcher, no 40GB patch. Open a tab, connect, play. Works on any machine with a browser.",
  },
  {
    icon: "#",
    title: "Real Players",
    desc: "No NPCs pretending to be interesting. Trade, fight, ally, or betray actual humans making actual decisions.",
  },
] as const;

function StatusDot({ status }: { status: "online" | "offline" | "starting" }) {
  const colors = {
    online: "bg-success",
    offline: "bg-danger",
    starting: "bg-amber",
  };
  return (
    <span className="relative flex items-center gap-2">
      <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />
      <span
        className={`absolute inline-block w-2 h-2 rounded-full ${colors[status]} animate-ping opacity-75`}
      />
    </span>
  );
}

function Hero() {
  const [hovered, setHovered] = useState(false);
  const auth = useAuth();

  return (
    <section className="relative z-10 flex flex-col items-center justify-center min-h-[100dvh] px-6 text-center">
      {/* Status bar */}
      <div
        className="animate-fade-in-up flex items-center gap-2 mb-8 px-4 py-1.5 rounded-full border border-border bg-deep/80 backdrop-blur-sm text-xs font-mono text-muted"
        style={{ animationDelay: "0.1s" }}
      >
        <StatusDot status="online" />
        <span>
          Server online <span className="text-cyan mx-1">&middot;</span>{" "}
          <span className="text-text">127</span> players connected
        </span>
      </div>

      {/* Title */}
      <h1
        className="animate-fade-in-up font-display font-bold text-5xl md:text-7xl lg:text-8xl text-text-bright leading-[0.95] tracking-tight mb-6"
        style={{ animationDelay: "0.25s" }}
      >
        <span className="block">Enter the</span>
        <span className="block text-amber text-glow-amber">World</span>
      </h1>

      {/* Subhead */}
      <p
        className="animate-fade-in-up max-w-md text-muted text-base md:text-lg leading-relaxed mb-10"
        style={{ animationDelay: "0.4s" }}
      >
        A multiplayer world running in your browser.
        <br />
        No install. No waiting. Just connect.
      </p>

      {/* CTA */}
      <div
        className="animate-fade-in-up flex flex-col items-center gap-4"
        style={{ animationDelay: "0.55s" }}
      >
        <Link
          to={auth.isAuthenticated ? "/play" : "/signup"}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={`
            group relative font-display font-semibold text-lg px-10 py-3.5 rounded-md
            bg-amber text-void cursor-pointer
            transition-all duration-300 ease-out
            hover:bg-amber-glow hover:scale-[1.03]
            active:scale-[0.98]
            ${hovered ? "glow-amber" : ""}
          `}
        >
          <span className="relative z-10 flex items-center gap-2">
            {auth.isAuthenticated ? "Continue" : "Play Now"}
            <svg
              aria-hidden="true"
              focusable="false"
              className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </span>
        </Link>
        <span className="text-xs text-muted font-mono">
          Free to play &middot; No account required to spectate
        </span>
      </div>

      {/* Scroll indicator */}
      <div
        className="animate-fade-in absolute bottom-8 flex flex-col items-center gap-2 text-muted/50"
        style={{ animationDelay: "1.2s" }}
      >
        <span className="text-[10px] font-mono uppercase tracking-[0.2em]">
          Scroll
        </span>
        <div className="w-px h-8 bg-gradient-to-b from-muted/30 to-transparent" />
      </div>
    </section>
  );
}

function About() {
  return (
    <section
      id="about"
      className="relative z-10 px-6 md:px-10 py-24 md:py-32 max-w-4xl mx-auto"
    >
      <div className="grid md:grid-cols-[1fr_1.5fr] gap-12 md:gap-16 items-start">
        {/* Label */}
        <div>
          <span className="font-mono text-xs text-amber uppercase tracking-[0.2em] block mb-3">
            What is this
          </span>
          <h2 className="font-display font-bold text-2xl md:text-3xl text-text-bright leading-tight">
            A 2D MMO that lives in your browser
          </h2>
        </div>

        {/* Content */}
        <div className="space-y-4 text-muted leading-relaxed">
          <p>
            This is a multiplayer game where everyone shares one persistent
            world. It runs entirely in your browser &mdash; no client to
            download, no launcher to update, no hardware requirements beyond
            "can open a webpage."
          </p>
          <p>
            The world is real-time. Other players are real. The economy, the
            map, and the consequences of your actions are all shared across
            every connected session.
          </p>
          <p className="text-text text-sm font-mono border-l-2 border-amber/30 pl-4">
            Currently in active development. Core systems are being built.
            Follow along or jump in early.
          </p>
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section
      id="features"
      className="relative z-10 px-6 md:px-10 py-24 md:py-32 max-w-5xl mx-auto"
    >
      <span className="font-mono text-xs text-cyan uppercase tracking-[0.2em] block mb-3">
        How it works
      </span>
      <h2 className="font-display font-bold text-2xl md:text-3xl text-text-bright leading-tight mb-16">
        No gimmicks. Here&apos;s what you get.
      </h2>

      <div className="grid md:grid-cols-3 gap-6">
        {GAME_FEATURES.map((feature, i) => (
          <div
            key={feature.title}
            className="group p-6 rounded-lg border border-border bg-deep/60 backdrop-blur-sm hover:border-amber/20 hover:bg-surface/50 transition-all duration-300"
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <div className="w-10 h-10 rounded border border-border bg-surface flex items-center justify-center mb-4 font-mono text-amber text-lg group-hover:border-amber/30 transition-colors duration-300">
              {feature.icon}
            </div>
            <h3 className="font-display font-semibold text-text-bright text-lg mb-2">
              {feature.title}
            </h3>
            <p className="text-muted text-sm leading-relaxed">{feature.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TechStack() {
  const items = [
    { label: "Client", value: "Browser canvas (2D)" },
    { label: "Network", value: "WebSocket (real-time)" },
    { label: "Tick rate", value: "20 tps server-authoritative" },
    { label: "Auth", value: "JWT-based sessions" },
    { label: "Platform", value: "Any modern browser" },
    { label: "Cost", value: "Free" },
  ];

  return (
    <section className="relative z-10 px-6 md:px-10 py-24 md:py-32 max-w-4xl mx-auto">
      <span className="font-mono text-xs text-muted uppercase tracking-[0.2em] block mb-3">
        Technical
      </span>
      <h2 className="font-display font-bold text-2xl md:text-3xl text-text-bright leading-tight mb-12">
        Under the hood
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-border/50 rounded-lg overflow-hidden border border-border">
        {items.map((item) => (
          <div
            key={item.label}
            className="bg-deep p-5 hover:bg-surface/30 transition-colors duration-200"
          >
            <span className="block text-[10px] font-mono text-muted uppercase tracking-[0.15em] mb-1">
              {item.label}
            </span>
            <span className="text-text-bright text-sm font-medium">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function BottomCTA() {
  const auth = useAuth();

  return (
    <section className="relative z-10 px-6 md:px-10 py-32 md:py-40 text-center">
      {/* Separator line */}
      <div className="w-px h-16 bg-gradient-to-b from-transparent via-amber/30 to-transparent mx-auto mb-12" />

      <h2 className="font-display font-bold text-3xl md:text-5xl text-text-bright mb-4">
        Ready?
      </h2>
      <p className="text-muted mb-10 max-w-sm mx-auto">
        The world is running right now. Pick a name and you&apos;re in.
      </p>
      <Link
        to={auth.isAuthenticated ? "/play" : "/signup"}
        className="font-display font-semibold text-lg px-10 py-3.5 rounded-md bg-amber text-void cursor-pointer transition-all duration-300 ease-out hover:bg-amber-glow hover:scale-[1.03] active:scale-[0.98] glow-amber"
      >
        {auth.isAuthenticated ? "Return to World" : "Enter the World"}
      </Link>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 px-6 md:px-10 py-8 border-t border-border/50">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted font-mono">
        <span>MMO Game &middot; In development</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <StatusDot status="online" />
            Systems operational
          </span>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="noise-overlay">
      <WorldGrid />
      <SiteTopbar mode="landing" />
      <Hero />
      <About />
      <Features />
      <TechStack />
      <BottomCTA />
      <Footer />
    </div>
  );
}
