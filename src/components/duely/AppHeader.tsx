import type { User } from "@supabase/supabase-js";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Menu, Sparkle } from "lucide-react";
import { useI18n, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { NotificationMenu } from "./NotificationMenu";
import { UserMenu } from "./UserMenu";

type NavItem = { to: string; label: string; key: TKey };

const primaryNav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", key: "dashboard" },
  { to: "/invoices", label: "Invoices", key: "invoices" },
  { to: "/clients", label: "Clients", key: "clients" },
  { to: "/payments", label: "Payments", key: "payments" },
  { to: "/settings", label: "Settings", key: "settings" },
];

const futureNav = ["Plans", "Approvals", "Reports"];

function Navigation({ onNavigate, mobile = false }: { onNavigate?: () => void; mobile?: boolean }) {
  const { t } = useI18n();

  return (
    <nav
      aria-label="Primary navigation"
      className={cn("flex gap-1", mobile ? "flex-col items-stretch" : "items-center")}
    >
      {primaryNav.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: true }}
          activeProps={{
            className:
              "text-foreground after:absolute after:inset-x-2 after:-bottom-[1px] after:h-0.5 after:bg-primary",
          }}
          onClick={onNavigate}
          className={cn(
            "relative whitespace-nowrap px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            mobile ? "rounded-lg py-3 hover:bg-secondary" : "py-5",
          )}
        >
          {t(item.key)}
        </Link>
      ))}
      <details className="group relative">
        <summary
          className={cn(
            "flex cursor-pointer list-none items-center gap-1 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            mobile ? "rounded-lg py-3 hover:bg-secondary" : "py-5",
          )}
        >
          More <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="absolute end-0 top-full z-40 min-w-40 rounded-xl border border-border bg-popover p-1.5 shadow-xl">
          {futureNav.map((label) => (
            <span
              key={label}
              className="block rounded-lg px-3 py-2 text-sm text-muted-foreground/60"
            >
              {label} <span className="text-[10px] uppercase tracking-wide">Soon</span>
            </span>
          ))}
        </div>
      </details>
    </nav>
  );
}

export function MobileNav({ onNavigate }: { onNavigate: () => void }) {
  return <Navigation onNavigate={onNavigate} mobile />;
}

export function AppHeader({
  user,
  onMenuClick,
  onSignOut,
}: {
  user: User;
  onMenuClick: () => void;
  onSignOut: () => void;
}) {
  const { lang, setLang } = useI18n();

  return (
    <header className="relative z-40 flex h-16 shrink-0 items-center border-b border-border bg-surface/95 px-4 backdrop-blur-md lg:h-[76px] lg:px-7">
      <button
        onClick={onMenuClick}
        aria-label="Open navigation"
        className="me-3 rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
      >
        <Menu className="size-5" />
      </button>
      <Link
        to="/dashboard"
        className="me-6 flex shrink-0 items-center gap-2.5"
        aria-label="Haseel dashboard"
      >
        <span className="flex size-8 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-[0_0_20px_var(--primary-glow)]">
          <Sparkle className="size-4" />
        </span>
        <span className="text-base font-bold tracking-[0.18em]">Haseel</span>
      </Link>
      <div className="hidden min-w-0 flex-1 lg:block">
        <Navigation />
      </div>
      <div className="ms-auto flex items-center gap-2">
        <div className="hidden items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1 sm:flex">
          {(["en", "ar"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setLang(value)}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                lang === value
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </div>
        <NotificationMenu />
        <UserMenu user={user} onSignOut={onSignOut} />
      </div>
    </header>
  );
}
