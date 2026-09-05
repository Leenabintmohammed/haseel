import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  LoaderCircle,
  RefreshCw,
  UserRound,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/duely/StatusBadge";
import {
  approveDiscountRequestFn,
  getPendingDiscountRequestsFn,
  rejectDiscountRequestFn,
  type OwnerDiscountRequest,
} from "@/lib/discount-request.functions";
import { formatDate, formatMoney } from "@/lib/format";
import { useDuely } from "@/lib/duely-context";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/discount-requests")({
  head: () => ({
    meta: [
      { title: "Discount Requests — Haseel" },
      {
        name: "description",
        content:
          "Review and resolve customer discount requests before Haseel changes an invoice.",
      },
    ],
  }),
  component: DiscountRequestsPage,
});

function DiscountRequestsPage() {
  const { lang } = useI18n();
  const { setPage } = useDuely();
  const queryClient = useQueryClient();

  const getPending = useServerFn(getPendingDiscountRequestsFn);
  const approve = useServerFn(approveDiscountRequestFn);
  const reject = useServerFn(rejectDiscountRequestFn);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const query = useQuery({
    queryKey: ["discount_requests", "pending"],
    queryFn: () => getPending({ data: {} }),
    staleTime: 15_000,
  });

  useEffect(() => {
    setPage("discount_requests");
  }, [setPage]);

  const requests = query.data ?? [];

  const resolve = async (
    request: OwnerDiscountRequest,
    decision: "approve" | "reject",
  ) => {
    setActiveId(request.id);
    setError("");
    setSuccess("");

    try {
      const ownerResponse = noteById[request.id]?.trim() || undefined;

      if (decision === "approve") {
        const result = await approve({
          data: {
            requestId: request.id,
            ...(ownerResponse ? { ownerResponse } : {}),
          },
        });

        await queryClient.invalidateQueries({
          queryKey: ["discount_requests", "pending"],
        });
        await queryClient.invalidateQueries({
          queryKey: ["invoices"],
        });
        await queryClient.invalidateQueries({
          queryKey: ["dashboard-analytics"],
        });

        setSuccess(
          lang === "ar"
            ? result.notification.success
              ? "تمت الموافقة على الطلب وتحديث الفاتورة وإبلاغ العميل عبر واتساب."
              : "تمت الموافقة وتحديث الفاتورة، لكن تعذر إرسال إشعار واتساب للعميل."
            : result.notification.success
              ? "Request approved, invoice updated, and the customer was notified on WhatsApp."
              : "Request approved and invoice updated, but the WhatsApp notification could not be sent.",
        );
      } else {
        const result = await reject({
          data: {
            requestId: request.id,
            ...(ownerResponse ? { ownerResponse } : {}),
          },
        });

        await queryClient.invalidateQueries({
          queryKey: ["discount_requests", "pending"],
        });

        setSuccess(
          lang === "ar"
            ? result.notification.success
              ? "تم رفض الطلب وإبلاغ العميل عبر واتساب."
              : "تم رفض الطلب، لكن تعذر إرسال إشعار واتساب للعميل."
            : result.notification.success
              ? "Request rejected and the customer was notified on WhatsApp."
              : "Request rejected, but the WhatsApp notification could not be sent.",
        );
      }

      setNoteById((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
    } catch (cause) {
      setError(toReadableError(cause, lang));
    } finally {
      setActiveId(null);
    }
  };

  return (
    <div className="space-y-6 p-5 sm:p-7 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-primary">
            {lang === "ar" ? "قرارات المالك" : "Owner decisions"}
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {lang === "ar" ? "طلبات الخصم" : "Discount requests"}
          </h1>

          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {lang === "ar"
              ? "راجع طلبات الخصم قبل أن يتغير أي مبلغ مالي. الموافقة فقط هي التي تحدث الفاتورة."
              : "Review customer discount requests before any financial amount changes. Only approval updates the invoice."}
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}

          {lang === "ar" ? "تحديث" : "Refresh"}
        </Button>
      </header>

      {error && (
        <MessageBox
          tone="error"
          icon={<AlertCircle className="size-4" />}
        >
          {error}
        </MessageBox>
      )}

      {success && (
        <MessageBox
          tone="success"
          icon={<CheckCircle2 className="size-4" />}
        >
          {success}
        </MessageBox>
      )}

      {query.isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-card p-10 text-center">
          <AlertCircle className="mx-auto size-8 text-destructive" />

          <p className="mt-3 font-medium">
            {lang === "ar"
              ? "تعذر تحميل طلبات الخصم."
              : "Unable to load discount requests."}
          </p>

          <Button
            className="mt-5"
            variant="outline"
            onClick={() => query.refetch()}
          >
            {lang === "ar" ? "إعادة المحاولة" : "Try again"}
          </Button>
        </div>
      ) : query.isLoading ? (
        <LoadingState />
      ) : requests.length === 0 ? (
        <EmptyState lang={lang} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="size-4 text-primary" />

            <span>
              {lang === "ar"
                ? `${requests.length} طلب بانتظار المراجعة`
                : `${requests.length} request${requests.length === 1 ? "" : "s"} awaiting review`}
            </span>
          </div>

          {requests.map((request) => {
            const busy = activeId === request.id;
            const note = noteById[request.id] ?? "";

            return (
              <article
                key={request.id}
                className={cn(
                  "overflow-hidden rounded-2xl border bg-card shadow-sm",
                  busy ? "border-primary/40" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <UserRound className="size-5" />
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {request.client_name ??
                          (lang === "ar"
                            ? "عميل غير معروف"
                            : "Unknown customer")}
                      </p>

                      <p className="truncate text-xs text-muted-foreground">
                        {request.client_phone ?? "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusBadge status={request.status} />

                    <span className="text-xs text-muted-foreground">
                      {formatDate(request.created_at, lang)}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
                  <InfoCell
                    icon={FileText}
                    label={lang === "ar" ? "الفاتورة" : "Invoice"}
                    value={
                      request.invoice_id
                        ? request.invoice_id.slice(0, 8)
                        : "—"
                    }
                  />

                  <InfoCell
                    icon={CircleDollarSign}
                    label={lang === "ar" ? "قيمة الفاتورة" : "Invoice amount"}
                    value={
                      request.invoice_amount === null
                        ? "—"
                        : formatMoney(
                            request.invoice_amount,
                            "AED",
                            lang,
                          )
                    }
                  />

                  <InfoCell
                    icon={CircleDollarSign}
                    label={lang === "ar" ? "المتبقي" : "Remaining"}
                    value={
                      request.invoice_remaining_balance === null
                        ? "—"
                        : formatMoney(
                            request.invoice_remaining_balance,
                            "AED",
                            lang,
                          )
                    }
                  />

                  <InfoCell
                    icon={CheckCircle2}
                    label={
                      lang === "ar"
                        ? "الخصم المطلوب"
                        : "Requested discount"
                    }
                    value={discountLabelFor(request, lang)}
                    emphasize
                  />
                </div>

                <div className="grid gap-4 border-t border-border p-5 sm:p-6 lg:grid-cols-[1fr_1.25fr]">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {lang === "ar"
                        ? "سبب الطلب"
                        : "Customer reason"}
                    </p>

                    <p className="mt-2 rounded-xl bg-secondary/40 p-3 text-sm leading-relaxed">
                      {request.reason ??
                        (lang === "ar"
                          ? "لم يذكر العميل سببًا."
                          : "No reason provided.")}
                    </p>
                  </div>

                  <div>
                    <label
                      className="text-xs font-medium text-muted-foreground"
                      htmlFor={`note-${request.id}`}
                    >
                      {lang === "ar"
                        ? "ملاحظة للقرار (اختياري)"
                        : "Decision note (optional)"}
                    </label>

                    <Textarea
                      id={`note-${request.id}`}
                      value={note}
                      onChange={(event) =>
                        setNoteById((current) => ({
                          ...current,
                          [request.id]: event.target.value,
                        }))
                      }
                      placeholder={
                        lang === "ar"
                          ? "مثال: وافقت لمرة واحدة."
                          : "Example: Approved as a one-time exception."
                      }
                      maxLength={1000}
                      rows={3}
                      disabled={busy}
                      className="mt-2 bg-background"
                    />

                    <p className="mt-1 text-end text-[11px] text-muted-foreground">
                      {note.length}/1000
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-secondary/20 px-5 py-4 sm:px-6">
                  <p className="text-xs text-muted-foreground">
                    {lang === "ar"
                      ? "الموافقة ستعيد حساب إجمالي الفاتورة وتبلغ العميل."
                      : "Approval recalculates the invoice totals and notifies the customer."}
                  </p>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => resolve(request, "reject")}
                      disabled={busy}
                    >
                      {busy ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <XCircle className="size-4" />
                      )}

                      {lang === "ar" ? "رفض" : "Reject"}
                    </Button>

                    <Button
                      onClick={() => resolve(request, "approve")}
                      disabled={busy}
                    >
                      {busy ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}

                      {lang === "ar" ? "موافقة" : "Approve"}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InfoCell({
  icon: Icon,
  label,
  value,
  emphasize = false,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" />
        <span>{label}</span>
      </div>

      <p
        className={cn(
          "mt-2 text-sm font-semibold",
          emphasize && "text-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MessageBox({
  tone,
  icon,
  children,
}: {
  tone: "error" | "success";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
        tone === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-success/30 bg-success/10 text-success",
      )}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((row) => (
        <div
          key={row}
          className="h-64 animate-pulse rounded-2xl border border-border bg-card"
        />
      ))}
    </div>
  );
}

function EmptyState({ lang }: { lang: "en" | "ar" }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-14 text-center">
      <CheckCircle2 className="mx-auto size-9 text-success" />

      <h2 className="mt-4 text-base font-semibold">
        {lang === "ar"
          ? "لا توجد طلبات خصم معلقة"
          : "No pending discount requests"}
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {lang === "ar"
          ? "عندما يطلب أحد العملاء خصمًا عبر واتساب سيظهر الطلب هنا قبل تغيير أي فاتورة."
          : "When a customer requests a discount through WhatsApp, the request will appear here before any invoice changes."}
      </p>
    </div>
  );
}

function discountLabelFor(
  request: OwnerDiscountRequest,
  lang: "en" | "ar",
) {
  if (request.requested_discount_percent !== null) {
    return `${request.requested_discount_percent}%`;
  }

  if (request.requested_discount_amount !== null) {
    return formatMoney(
      request.requested_discount_amount,
      "AED",
      lang,
    );
  }

  return lang === "ar" ? "غير محدد" : "Not specified";
}

function toReadableError(cause: unknown, lang: "en" | "ar") {
  const message =
    cause instanceof Error ? cause.message : String(cause ?? "");

  const normalized = message.toLowerCase();

  if (normalized.includes("already_resolved")) {
    return lang === "ar"
      ? "تمت معالجة هذا الطلب بالفعل."
      : "This request has already been resolved.";
  }

  if (
    normalized.includes(
      "amount_required_for_approval",
    )
  ) {
    return lang === "ar"
      ? "هذا الطلب لا يحتوي على نسبة أو مبلغ خصم محدد، لذلك لا يمكن الموافقة عليه بهذه الشاشة."
      : "This request has no specific discount amount or percentage, so it cannot be approved from this screen.";
  }

  if (normalized.includes("already_paid")) {
    return lang === "ar"
      ? "الفاتورة مدفوعة بالفعل ولا يمكن تطبيق الخصم عليها."
      : "The invoice is already paid and cannot receive this discount.";
  }

  return lang === "ar"
    ? "تعذر تنفيذ القرار. حاول مرة أخرى."
    : "Unable to complete the decision. Please try again.";
}
