import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mic, Send, Sparkle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  duelyChat,
  resolveAction,
  type PendingAction,
} from "@/lib/ai.functions";
import { useDuely } from "@/lib/duely-context";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Msg =
  | {
      id: string;
      role: "user" | "assistant";
      text: string;
    }
  | {
      id: string;
      role: "action";
      action: PendingAction;
      state: "pending" | "approved" | "rejected";
    };

function newId() {
  return Math.random().toString(36).slice(2);
}

export function CommandCenter({
  className,
}: {
  className?: string;
}) {
  const { t, lang } = useI18n();

  const {
    focus,
    selection,
    page,
    prefill,
    setPrefill,
    setSelection,
  } = useDuely();

  const queryClient = useQueryClient();

  const chat = useServerFn(duelyChat);
  const resolve = useServerFn(resolveAction);

  const [sessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (prefill) {
      setInput(prefill);
      setPrefill("");
      inputRef.current?.focus();
    }
  }, [prefill, setPrefill]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const invalidate = () =>
    queryClient.invalidateQueries().catch(() => {
      /* ignore */
    });

  const send = useMutation({
    mutationFn: async (text: string) =>
      chat({
        data: {
          message: text,
          session_id: sessionId,
          page,
          focus: focus
            ? {
                type: focus.type,
                id: focus.id,
                summary: focus.summary,
              }
            : null,
          selection: selection.map((s) => ({
            type: s.type,
            id: s.id,
          })),
        },
      }),

    onSuccess: (result) => {
      setMessages((m) => [
        ...m,
        {
          id: newId(),
          role: "assistant",
          text: result.reply,
        },
        ...result.pending.map(
          (a) =>
            ({
              id: newId(),
              role: "action",
              action: a,
              state: "pending",
            }) as Msg,
        ),
      ]);

      invalidate();
    },

    onError: () => {
      setMessages((m) => [
        ...m,
        {
          id: newId(),
          role: "assistant",
          text: "I couldn't reach Haseel AI just now. Please try again.",
        },
      ]);
    },
  });

  const submit = () => {
    const text = input.trim();

    if (!text || send.isPending) return;

    setMessages((m) => [
      ...m,
      {
        id: newId(),
        role: "user",
        text,
      },
    ]);

    setInput("");

    send.mutate(text);

    requestAnimationFrame(() =>
      inputRef.current?.focus(),
    );
  };

  const decide = async (
    msgId: string,
    action: PendingAction,
    decision: "approve" | "reject",
  ) => {
    setMessages((m) =>
      m.map((x) =>
        x.id === msgId && x.role === "action"
          ? {
              ...x,
              state:
                decision === "approve"
                  ? "approved"
                  : "rejected",
            }
          : x,
      ),
    );

    try {
      const result = await resolve({
        data: {
          action_id: action.id,
          decision,
        },
      });

      invalidate();

      if (decision === "approve") {
        let text: string;

        if (result.status === "failed") {
          text = `Invoice was not sent: ${result.message}`;
        } else if (result.status === "completed") {
          text = `Invoice action completed: ${result.message}`;
        } else {
          text =
            result.message ||
            "Invoice action completed.";
        }

        setMessages((m) => [
          ...m,
          {
            id: newId(),
            role: "assistant",
            text,
          },
        ]);
      }
    } catch (error) {
      if (decision === "approve") {
        setMessages((m) => [
          ...m,
          {
            id: newId(),
            role: "assistant",
            text:
              error instanceof Error
                ? `Invoice was not sent: ${error.message}`
                : "Invoice was not sent.",
          },
        ]);
      }
    }
  };

  const suggestions =
    lang === "ar"
      ? [
          "مين عليه فلوس؟",
          "أنشئ عميل جديد",
          "الفواتير المتأخرة",
        ]
      : [
          "Who owes me money?",
          "Create a client called ABC Company",
          "Which invoices are overdue?",
        ];

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-sidebar",
        className,
      )}
    >
      <header className="flex items-center gap-3 border-b border-sidebar-border px-5 py-4">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sparkle className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-sidebar-foreground">
            {t("duely_ai")}
          </p>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            {t("online")}
          </p>
        </div>
      </header>

      {focus && (
        <div className="border-b border-sidebar-border bg-primary-soft/60 px-5 py-2 text-xs text-primary">
          {t("context")}:{" "}
          <span className="font-medium">
            {focus.summary}
          </span>
        </div>
      )}

      {selection.length > 0 && (
        <div className="border-b border-sidebar-border bg-primary-soft/40 px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-primary">
              Selected context
            </p>

            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setSelection([])}
            >
              Clear
            </button>
          </div>

          <div className="mt-2 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
            {selection.map((item) => (
              <button
                key={`${item.type}:${item.id}`}
                title={
                  item.subtitle
                    ? `${item.label ?? item.type}: ${item.subtitle}`
                    : `${item.type}: ${item.id}`
                }
                onClick={() =>
                  setSelection(
                    selection.filter(
                      (current) => current !== item,
                    ),
                  )
                }
                className="flex max-w-full items-center gap-1 rounded-full border border-sidebar-border bg-card px-2 py-1 text-[11px] text-sidebar-foreground"
              >
                <span className="max-w-28 truncate">
                  {item.label ??
                    `${item.type.replace(
                      "_",
                      " ",
                    )} · ${item.id.slice(0, 8)}`}
                </span>

                <X className="size-3 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="duely-scroll flex-1 space-y-4 overflow-y-auto px-5 py-5"
      >
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {lang === "ar"
                ? "أنا حصيل. أدير عملاءك وفواتيرك ومدفوعاتك. اطلب مني أي شيء."
                : "I'm Haseel. I run your clients, invoices and payments. Just tell me what you need."}
            </p>

            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInput(s);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border border-sidebar-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "action" ? (
            <div
              key={m.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {m.action.title}
              </p>

              <dl className="mt-3 space-y-1.5">
                {m.action.fields.map((f) => (
                  <div
                    key={f.label}
                    className="flex gap-3 text-sm"
                  >
                    <dt className="w-28 shrink-0 text-muted-foreground">
                      {f.label}
                    </dt>

                    <dd className="min-w-0 flex-1 break-words text-card-foreground">
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                Autonomy: approval required
              </p>

              {m.state === "pending" ? (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      decide(
                        m.id,
                        m.action,
                        "approve",
                      )
                    }
                  >
                    {t("approve")}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setInput(
                        lang === "ar"
                          ? "عدّل: "
                          : "Modify: ",
                      );
                      inputRef.current?.focus();
                    }}
                  >
                    {t("modify")}
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      decide(
                        m.id,
                        m.action,
                        "reject",
                      )
                    }
                  >
                    {t("cancel")}
                  </Button>
                </div>
              ) : (
                <p className="mt-3 text-xs font-medium text-muted-foreground">
                  {m.state === "approved"
                    ? "Approved"
                    : "Cancelled"}
                </p>
              )}
            </div>
          ) : (
            <div
              key={m.id}
              className={cn(
                "flex",
                m.role === "user"
                  ? "justify-end"
                  : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap text-sm leading-relaxed",
                  m.role === "user"
                    ? "rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground"
                    : "text-foreground",
                )}
              >
                {m.text}
              </div>
            </div>
          ),
        )}

        {send.isPending && (
          <p className="animate-pulse text-sm text-muted-foreground">
            {lang === "ar"
              ? "أفكر…"
              : "Thinking…"}
          </p>
        )}
      </div>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-end gap-2 rounded-xl border border-input bg-card p-2">
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(
                e.target.scrollHeight,
                140,
              )}px`;
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey
              ) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={t("ask_duely")}
            className="duely-scroll max-h-36 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />

          <Button
            size="icon"
            variant="ghost"
            disabled
            title="Voice input coming soon"
            className="size-9 shrink-0"
          >
            <Mic className="size-4" />
          </Button>

          <Button
            size="icon"
            onClick={submit}
            disabled={
              send.isPending || !input.trim()
            }
            className="size-9 shrink-0"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
