import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { Sparkle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CommandCenter } from "./CommandCenter";
import { AppHeader, MobileNav } from "./AppHeader";
import { useDuely } from "@/lib/duely-context";
import { Button } from "@/components/ui/button";

export function AppShell({ children, user }: { children: ReactNode; user: User }) {
  const { aiOpen, setAiOpen } = useDuely();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
      <AppHeader
        user={user}
        onMenuClick={() => setMobileNavOpen((open) => !open)}
        onSignOut={signOut}
      />

      {mobileNavOpen && (
        <div className="absolute inset-x-0 top-16 z-30 border-b border-border bg-surface/98 p-3 shadow-xl lg:hidden">
          <MobileNav onNavigate={() => setMobileNavOpen(false)} />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
        <main className="duely-scroll min-h-0 min-w-0 overflow-y-auto pb-24 lg:pb-0">
          {children}
        </main>

        <aside className="hidden min-h-0 min-w-0 border-s border-border bg-surface lg:block">
          <CommandCenter className="h-full" />
        </aside>
      </div>

      <Button
        onClick={() => setAiOpen(true)}
        className="fixed bottom-5 end-5 z-40 h-12 gap-2 rounded-full px-5 shadow-lg lg:hidden"
      >
        <Sparkle className="size-4" />
        Haseel AI
      </Button>

      {aiOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-foreground/30 lg:hidden">
          <div className="h-[85vh] overflow-hidden rounded-t-2xl bg-surface shadow-2xl">
            <div className="flex justify-end px-4 pt-3">
              <button onClick={() => setAiOpen(false)} aria-label="Close assistant">
                <X className="size-5 text-muted-foreground" />
              </button>
            </div>
            <CommandCenter className="h-[calc(85vh-2.5rem)]" />
          </div>
        </div>
      )}
    </div>
  );
}
