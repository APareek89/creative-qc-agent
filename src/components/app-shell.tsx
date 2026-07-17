"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, CircleHelp, Command, Images, LayoutDashboard, Plus, Settings2, Sparkles, WandSparkles } from "lucide-react";
import type { ReactNode } from "react";

export function AppShell({ children, demoMode }: { children: ReactNode; demoMode: boolean }) {
  const pathname = usePathname();
  const nav = [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/new", label: "New batch", icon: Plus },
    ...(demoMode ? [
      { href: "/batches/demo-autumn-drop", label: "Production", icon: Images },
      { href: "/batches/demo-autumn-drop?recipe=1", label: "Recipes", icon: WandSparkles },
    ] : []),
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="Creative QC home">
          <span className="brand-mark"><Sparkles size={19} /></span>
          <span className="brand-word">frame<span>wise</span></span>
        </Link>
        <nav className="main-nav" aria-label="Primary navigation">
          <p className="nav-label">Workspace</p>
          {nav.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/"
              ? pathname === "/"
              : item.label === "Production"
                ? pathname.startsWith("/batches/")
              : item.label === "Recipes"
                ? false
                : pathname.startsWith(item.href.split("?")[0]!);
            return (
              <Link href={item.href} className={`nav-item ${active ? "active" : ""}`} key={item.label}>
                <Icon size={18} />
                <span>{item.label}</span>
                {item.label === "Production" && <span className="nav-live-dot" />}
              </Link>
            );
          })}
          <p className="nav-label nav-label-lower">System</p>
          <Link href="/architecture" className={`nav-item ${pathname === "/architecture" ? "active" : ""}`}>
            <Boxes size={18} /><span>Agent flow</span>
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item ghost-button" type="button"><CircleHelp size={18} /><span>Help center</span></button>
          <button className="nav-item ghost-button" type="button"><Settings2 size={18} /><span>Settings</span></button>
          <div className="user-card">
            <div className="avatar">AP</div>
            <div><strong>Anand</strong><span>Portfolio workspace</span></div>
            <Command size={15} />
          </div>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
