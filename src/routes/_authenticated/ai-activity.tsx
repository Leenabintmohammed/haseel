import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/duely/StatusBadge";
import { useAiActions } from "@/lib/queries";
import { resolveAction } from "@/lib/ai.functions";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useDuely } from "@/lib/duely-context";

export const Route = createFileRoute("/_authenticated/ai-activity")({
  head: () => ({
    meta: [
      { title: "AI Activity — Haseel" },
      { name: "description", content: "Audit every action Haseel took, approved or awaiting your decision." },
      { property: "og:title", content: "AI Activity — Haseel" },
      { property: "og:description", content: "Audit every action Haseel took, approved or awaiting your decision." },
    ],
  }),
  component: AiActivityPage,
});

function AiActivityPage() {
  const { t, lang } = useI18n();
  const { setPage } = useDuely();
  const actions = useAiActions();
  const resolve = useServerFn(resolveAction);
  const queryClient = useQueryClient();
  useEffect(() => setPage("ai_activity"), [setPage]);

  const decide = async (id: string, decision: "approve" | "reject") => {
    await resolve({ data: { action_id: id, decision } });
    await queryClient.invalidateQueries();
  };

  return (
    <div className="space-y-5 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("ai_activity")}</h1>
        <p className="text-sm text-muted-foreground">
          {lang === "ar"
            ? "كل إجراء نفذه حصيل أو ينتظر موافقتك."
            : "Every action Haseel executed, and anything waiting on you."}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <ul className="divide-y divide-border">
          {(actions.data ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.intent || a.tool_name}</p>
                <p className="text-xs text-muted-foreground">
                  {a.tool_name} · {a.autonomy_level} · {formatDate(a.created_at, lang)}
                </p>
              </div>
              <StatusBadge status={a.status} />
              {a.status === "awaiting_approval" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => decide(a.id, "approve")}>
                    {t("approve")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => decide(a.id, "reject")}>
                    {t("cancel")}
                  </Button>
                </div>
              )}
            </li>
          ))}
          {(actions.data ?? []).length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">
              {lang === "ar" ? "لا يوجد نشاط بعد." : "No AI activity yet."}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}