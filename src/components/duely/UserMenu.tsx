import type { User } from "@supabase/supabase-js";
import { ChevronDown, LogOut, Settings, Shield, UserRound } from "lucide-react";

export function UserMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const name = (user.user_metadata?.["full_name"] as string | undefined)?.trim() || "Haseel user";
  const email = user.email ?? "";
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl p-1.5 transition-colors hover:bg-secondary">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
          {initials}
        </span>
        <span className="hidden max-w-36 text-start sm:block">
          <span className="block truncate text-xs font-semibold text-foreground">{name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{email}</span>
        </span>
        <ChevronDown className="hidden size-3.5 text-muted-foreground transition-transform group-open:rotate-180 sm:block" />
      </summary>
       <div className="absolute end-0 top-full z-50 mt-2 w-52 rounded-xl border border-border bg-popover p-1.5 shadow-xl">
        <div className="border-b border-border px-3 py-2 sm:hidden">
          <p className="text-xs font-semibold">{name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{email}</p>
        </div>
        {/* {[
          [UserRound, "Profile"],
          [UserRound, "Company"],
          [Settings, "Settings"],
          [Shield, "Security"],
        ].map(([Icon, label]) => {
          const MenuIcon = Icon as typeof UserRound;
          return (
            <button
              key={label as string}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <MenuIcon className="size-4" />
              {label as string}
            </button>
          );
        })}  */}
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
        >
          <LogOut className="size-4" />
          Log out
        </button>
      </div>
    </details>
  );
}
