import { useState } from "react";
import { Bell, Check, Clock3 } from "lucide-react";
import { useNotifications } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";

export function NotificationMenu() {
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const rows = notifications.data ?? [];

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    await notifications.refetch();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${rows.length ? `, ${rows.length} unread` : ""}`}
        aria-expanded={open}
        className="relative rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="size-[18px]" />
        {rows.length > 0 && (
          <span className="absolute end-2 top-2 size-1.5 rounded-full bg-primary ring-2 ring-surface" />
        )}
      </button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-2 shadow-xl">
          <div className="flex items-center justify-between px-3 py-2">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <span className="text-[11px] text-muted-foreground">{rows.length} unread</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {rows.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <Check className="mx-auto size-5 text-primary" />
                <p className="mt-2 text-sm text-muted-foreground">You are all caught up.</p>
              </div>
            ) : (
              rows.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => markRead(notification.id)}
                  className="block w-full rounded-xl px-3 py-3 text-start transition-colors hover:bg-secondary"
                >
                  <div className="flex gap-3">
                    <span className="mt-0.5 size-2 shrink-0 rounded-full bg-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        {notification.title}
                      </span>
                      {notification.body && (
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                          {notification.body}
                        </span>
                      )}
                      <span className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock3 className="size-3" />
                        {new Date(notification.created_at).toLocaleDateString()}
                      </span>
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
