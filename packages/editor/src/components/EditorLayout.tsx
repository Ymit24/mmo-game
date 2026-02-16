import { NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/enemies", label: "Enemies", icon: "\u2694" },
  { to: "/items", label: "Items", icon: "\u2666" },
  { to: "/levels", label: "Levels", icon: "\u25B2" },
  { to: "/maps", label: "Maps", icon: "\u25A6" },
] as const;

export function EditorLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden scanlines">
      {/* Sidebar */}
      <aside className="flex flex-col w-52 shrink-0 bg-abyss border-r border-border">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-border">
          <h1 className="font-display text-vec-green text-sm tracking-wider text-glow-green">
            REALM EDITOR
          </h1>
          <p className="text-muted text-[10px] mt-1 uppercase tracking-widest">
            Content Tools
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              <span className="text-xs uppercase tracking-wider">
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Status bar */}
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-vec-green animate-pulse" />
            <span className="text-muted text-[10px] uppercase tracking-wider">
              Dev Server
            </span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col bg-void">
        <Outlet />
      </main>
    </div>
  );
}
