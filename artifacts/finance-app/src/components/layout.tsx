import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ReceiptText, Upload, PieChart, Wallet, Lightbulb,
  Settings, Tag, Menu,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/upload", label: "Upload Statements", icon: Upload },
  { href: "/categories", label: "Categories & Rules", icon: Tag },
  { href: "/budgets", label: "Budgets", icon: Wallet },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  return (
    <nav className="flex-1 px-3 space-y-0.5 py-2">
      {links.map((link) => {
        const isActive =
          location === link.href ||
          (link.href !== "/" && location.startsWith(link.href));
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium ${
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            }`}
            data-testid={`nav-link-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBrand() {
  return (
    <div className="p-5 flex items-center gap-3 border-b border-sidebar-border/50">
      <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
        <PieChart className="w-5 h-5" />
      </div>
      <span className="font-bold text-lg tracking-tight">FinanceAnalyzerPro</span>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 border-r bg-sidebar text-sidebar-foreground flex-col shrink-0">
        <SidebarBrand />
        <NavLinks />
        <div className="p-4 text-xs text-sidebar-foreground/30 font-mono border-t border-sidebar-border/30">
          FinanceAnalyzerPro v2.0.0
        </div>
      </aside>

      {/* Mobile header + sheet */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b bg-sidebar text-sidebar-foreground shrink-0">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent/50">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-60 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
              <SidebarBrand />
              <NavLinks onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1 rounded-md">
              <PieChart className="w-4 h-4" />
            </div>
            <span className="font-bold tracking-tight">FinanceAnalyzerPro</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-muted/20">
          {children}
        </main>
      </div>
    </div>
  );
}
