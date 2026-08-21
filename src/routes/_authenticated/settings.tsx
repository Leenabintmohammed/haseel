import { useEffect, type ReactNode } from "react";
import { createFileRoute, useRouteContext, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  ChevronRight,
  Globe,
  LogOut,
  Shield,
  Sparkle,
  UserRound,
} from "lucide-react";
import { useProfile, usePolicies, useAiActions } from "@/lib/queries";
import { getAiWorkspaceStatusFn } from "@/lib/settings.functions";
import { formatDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useDuely } from "@/lib/duely-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Haseel" },
      { name: "description", content: "Business profile, preferences, AI policies and account security." },
      { property: "og:title", content: "Settings — Haseel" },
      { property: "og:description", content: "Business profile, preferences, AI policies and account security." },
    ],
  }),
  component: SettingsPage,
});

const notificationEvents = [
  { key: "invoice_due_soon", en: "Payment reminders", ar: "تذكيرات الدفع" },
  { key: "invoice_overdue", en: "Overdue invoice alerts", ar: "تنبيهات الفواتير المتأخرة" },
  { key: "payment_received", en: "Payment received notifications", ar: "إشعارات استلام الدفعات" },
  { key: "installment_due_soon", en: "Payment plan reminders", ar: "تذكيرات خطة الدفع" },
  { key: "installment_overdue", en: "Overdue installment alerts", ar: "تنبيهات أقساط متأخرة" },
] as const;

function SettingsPage() {
  const { lang } = useI18n();
  const { setPage } = useDuely();
  const { user } = useRouteContext({ from: "/_authenticated" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const policies = usePolicies();
  const actions = useAiActions();
  const aiStatus = useQuery({
    queryKey: ["ai_workspace_status"],
    queryFn: () => getAiWorkspaceStatusFn(),
  });
  useEffect(() => setPage("settings"), [setPage]);

  const pendingApprovals = (actions.data ?? []).filter(
    (row) => row.status === "awaiting_approval",
  ).length;

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-5 sm:p-7 lg:p-8">
      <header>
        <p className="text-sm text-primary">
          {lang === "ar" ? "مركز الأعمال" : "Business workspace"}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {lang === "ar" ? "الإعدادات" : "Settings"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {lang === "ar"
            ? "هذا هو السياق التجاري الذي يعمل حصيل من أجله."
            : "This is the business context Haseel operates for."}
        </p>
      </header>

      {/* A. Company / Business Profile — primary, first-class section */}
      <section className="rounded-2xl border-2 border-primary/20 bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Building2 className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">
              {lang === "ar" ? "الملف التجاري" : "Company profile"}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {lang === "ar"
                ? "الشركة التي يعمل حصيل من أجلها."
                : "The business Haseel operates for."}
            </p>
          </div>
        </div>
        <dl className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label={lang === "ar" ? "اسم الشركة" : "Company name"} value={profile.data?.company_name} />
          <Field label={lang === "ar" ? "جهة الاتصال" : "Contact name"} value={profile.data?.full_name} />
          <Field label={lang === "ar" ? "البريد الإلكتروني" : "Business email"} value={profile.data?.email} />
          <Field label={lang === "ar" ? "الهاتف" : "Phone"} value={profile.data?.phone} />
          <Field
            label={lang === "ar" ? "العملة الافتراضية" : "Default currency"}
            value={profile.data?.currency ?? "AED"}
          />
          <Field
            label={lang === "ar" ? "لغة العمل" : "Workspace language"}
            value={profile.data?.preferred_language === "ar" ? "العربية" : "English"}
          />
        </dl>
        <p className="mt-4 rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          {lang === "ar"
            ? "حقول إضافية مثل الرقم الضريبي، الصناعة والعنوان غير مدعومة بعد في هذا الإصدار. لتحديث ما هو متاح، اطلب من حصيل في المحادثة."
            : "Extended fields (industry, tax/VAT number, registered address, website) aren't captured by the backend yet, so they aren't shown here. To update anything above, just ask Haseel in the chat."}
        </p>
      </section>

      {/* B. Business Preferences */}
      <SectionCard
        icon={<Globe className="size-5" />}
        title={lang === "ar" ? "تفضيلات العمل" : "Business preferences"}
        subtitle={
          lang === "ar"
            ? "كيف يعرض حصيل الأرقام والتواريخ."
            : "How Haseel presents numbers and dates for this workspace."
        }
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field
            label={lang === "ar" ? "العملة الافتراضية" : "Default currency"}
            value={profile.data?.currency ?? "AED"}
          />
          <Field
            label={lang === "ar" ? "اللغة" : "Language"}
            value={profile.data?.preferred_language === "ar" ? "العربية" : "English"}
          />
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          {lang === "ar"
            ? "تنسيق التاريخ، تنسيق الأرقام، السنة المالية وشروط الدفع الافتراضية غير مدعومة بعد."
            : "Date format, number format, fiscal year and default payment/invoice terms aren't configurable yet — this workspace currently uses sensible defaults."}
        </p>
      </SectionCard>

      {/* C. AI & Duely */}
      <SectionCard
        icon={<Sparkle className="size-5" />}
        title={lang === "ar" ? "الذكاء الاصطناعي وحصيل" : "AI & Haseel"}
        subtitle={
          lang === "ar"
            ? "حالة حصيل وسياسات التنفيذ."
            : "Haseel's status and how it's allowed to act on your behalf."
        }
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field
            label={lang === "ar" ? "حالة حصيل" : "Haseel AI status"}
            value={
              aiStatus.isLoading
                ? "…"
                : aiStatus.data?.configured
                  ? lang === "ar"
                    ? "متصل"
                    : "Online"
                  : lang === "ar"
                    ? "غير مهيأ"
                    : "Not configured"
            }
          />
          <Field
            label={lang === "ar" ? "النموذج الحالي" : "Configured model"}
            value={aiStatus.data?.model}
          />
          <Field
            label={lang === "ar" ? "إجراءات تلقائية" : "Automatic actions"}
            value={
              aiStatus.data
                ? `${aiStatus.data.autoActions.length} ${lang === "ar" ? "إجراء" : "actions"}`
                : undefined
            }
          />
          <Field
            label={lang === "ar" ? "إجراءات تتطلب موافقتك" : "Approval-required actions"}
            value={
              aiStatus.data
                ? `${aiStatus.data.approvalRequiredActions.length} ${lang === "ar" ? "إجراء" : "actions"}`
                : undefined
            }
          />
        </dl>
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {lang === "ar" ? "سياسات الشركة النشطة" : "Active company policies"}
          </p>
          {(policies.data ?? []).length ? (
            <ul className="space-y-1.5 text-sm">
              {(policies.data ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">{p.policy_key.replace(/_/g, " ")}</span>
                  <span className="font-medium">{String(p.policy_value)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {lang === "ar"
                ? "الإعدادات الافتراضية مفعلة: الإرسال يتطلب موافقتك."
                : "Running on safe defaults: sending needs your approval."}
            </p>
          )}
        </div>
        <Link
          to="/ai-activity"
          className="mt-5 flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm transition-colors hover:bg-secondary/50"
        >
          <span>
            {lang === "ar" ? "سجل نشاط الذكاء الاصطناعي" : "AI activity log"}
            {pendingApprovals > 0 && (
              <span className="ms-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">
                {pendingApprovals} {lang === "ar" ? "بانتظار الموافقة" : "pending approval"}
              </span>
            )}
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
        <p className="mt-3 text-xs text-muted-foreground">
          {lang === "ar"
            ? "عند تحديد عملاء أو فواتير أو مدفوعات، ينتقل هذا السياق مباشرة إلى محادثة حصيل."
            : "When you select clients, invoices or payments, that context flows directly into your conversation with Haseel."}
        </p>
      </SectionCard>

      {/* D. Notifications */}
      <SectionCard
        icon={<Bell className="size-5" />}
        title={lang === "ar" ? "الإشعارات" : "Notifications"}
        subtitle={
          lang === "ar"
            ? "الأحداث التي يرصدها حصيل تلقائيًا."
            : "Events Haseel automatically tracks for this business."
        }
      >
        <ul className="space-y-2 text-sm">
          {notificationEvents.map((event) => (
            <li key={event.key} className="flex items-center justify-between gap-4">
              <span>{lang === "ar" ? event.ar : event.en}</span>
              <span className="text-xs font-medium text-success">
                {lang === "ar" ? "مفعّل" : "Active"}
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-4">
            <span>{lang === "ar" ? "إشعارات الموافقة" : "Approval notifications"}</span>
            <span className="text-xs font-medium text-success">
              {lang === "ar" ? "مفعّل" : "Active"}
            </span>
          </li>
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          {lang === "ar"
            ? "تفضيلات الإشعارات القابلة للتخصيص (كتمها أو تغيير قنواتها) غير مدعومة بعد."
            : "Per-channel or opt-out notification controls aren't supported yet — these events are always tracked."}
        </p>
      </SectionCard>

      {/* E. Account / User */}
      <SectionCard
        icon={<UserRound className="size-5" />}
        title={lang === "ar" ? "الحساب" : "Account"}
        subtitle={
          lang === "ar" ? "ملفك الشخصي منفصل عن ملف الشركة." : "Your personal profile, kept separate from the company profile."
        }
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label={lang === "ar" ? "البريد الإلكتروني" : "Email"} value={user.email} />
          <Field
            label={lang === "ar" ? "حالة المصادقة" : "Authentication status"}
            value={lang === "ar" ? "تم تسجيل الدخول" : "Signed in"}
          />
          <Field
            label={lang === "ar" ? "حالة الحساب" : "Account status"}
            value={
              profile.data?.onboarded
                ? lang === "ar"
                  ? "مكتمل الإعداد"
                  : "Onboarded"
                : lang === "ar"
                  ? "قيد الإعداد"
                  : "Setting up"
            }
          />
          <Field
            label={lang === "ar" ? "عضو منذ" : "Member since"}
            value={profile.data?.created_at ? formatDate(profile.data.created_at, lang) : undefined}
          />
        </dl>
        <button
          onClick={signOut}
          className="mt-5 flex items-center gap-2 rounded-lg border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="size-4" />
          {lang === "ar" ? "تسجيل الخروج" : "Sign out"}
        </button>
      </SectionCard>

      {/* F. Security */}
      <SectionCard
        icon={<Shield className="size-5" />}
        title={lang === "ar" ? "الأمان" : "Security"}
        subtitle={
          lang === "ar"
            ? "معلومات الجلسة النشطة."
            : "Active session and authentication information."
        }
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field
            label={lang === "ar" ? "الجلسة" : "Session"}
            value={lang === "ar" ? "نشطة" : "Active"}
          />
          <Field
            label={lang === "ar" ? "مزود المصادقة" : "Auth provider"}
            value={(user.app_metadata?.["provider"] as string | undefined) ?? "email"}
          />
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          {lang === "ar"
            ? "لا يتم عرض بيانات الاعتماد أو المفاتيح السرية في هذه الصفحة أبدًا."
            : "Credentials, access tokens and service-role keys are never exposed in this UI."}
        </p>
        <button
          onClick={signOut}
          className="mt-5 flex items-center gap-2 rounded-lg border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="size-4" />
          {lang === "ar" ? "تسجيل الخروج من كل مكان" : "Sign out"}
        </button>
      </SectionCard>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value?: string | null | undefined }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 border-b border-border/60 py-2")}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}