import {
  useEffect,
  useState,
} from "react";
import {
  Bell,
  Check,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getReminderSettingsFn,
  saveReminderSettingsFn,
  type ReminderWorkspaceSettings,
} from "@/lib/reminder-settings.functions";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const TIMEZONES = [
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Bahrain",
  "UTC",
];

export function ReminderSettingsCard() {
  const { lang } = useI18n();
  const queryClient = useQueryClient();

const settingsQuery = useQuery({
  queryKey: ["reminder_settings"],
  queryFn: () =>
    getReminderSettingsFn({
      data: {},
    }),
});

  const saveMutation = useMutation({
    mutationFn: (data: ReminderWorkspaceSettings) =>
      saveReminderSettingsFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["reminder_settings"],
      });
    },
  });

  const [form, setForm] =
    useState<ReminderWorkspaceSettings | null>(
      null,
    );

  useEffect(() => {
    if (settingsQuery.data) {
      setForm(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  if (settingsQuery.isLoading || !form) {
    return (
      <section className="rounded-2xl border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          {lang === "ar"
            ? "جارٍ تحميل إعدادات التذكير..."
            : "Loading reminder settings..."}
        </p>
      </section>
    );
  }

  const updateReminder = (
    patch: Partial<ReminderWorkspaceSettings["reminder"]>,
  ) => {
    setForm((current) =>
      current
        ? {
            ...current,
            reminder: {
              ...current.reminder,
              ...patch,
            },
          }
        : current,
    );
  };

  const updatePayment = (
    patch: Partial<
      NonNullable<
        ReminderWorkspaceSettings["payment"]
      >
    >,
  ) => {
    setForm((current) =>
      current
        ? {
            ...current,
            payment: {
              bank_name: null,
              account_name: null,
              account_number: null,
              iban: null,
              swift_bic: null,
              payment_instructions: null,
              ...(current.payment ?? {}),
              ...patch,
            },
          }
        : current,
    );
  };

  const save = () => {
    saveMutation.mutate(form);
  };

  return (
    <section className="rounded-2xl border-2 border-primary/20 bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Bell className="size-5" />
        </span>

        <div className="min-w-0">
          <h2 className="text-lg font-semibold">
            {lang === "ar"
              ? "تذكيرات الدفع"
              : "Payment reminders"}
          </h2>

          <p className="mt-0.5 text-sm text-muted-foreground">
            {lang === "ar"
              ? "يتابع حصيل الفواتير المتأخرة ويرسل تذكيرات تلقائيًا عبر واتساب."
              : "Haseel follows overdue invoices and sends automatic WhatsApp reminders."}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-5">
        <label className="flex items-center justify-between gap-4 rounded-xl border p-4">
          <div>
            <p className="text-sm font-medium">
              {lang === "ar"
                ? "تفعيل التذكيرات"
                : "Enable reminders"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {lang === "ar"
                ? "السماح لحصيل بإرسال التذكيرات تلقائيًا."
                : "Allow Haseel to send reminders automatically."}
            </p>
          </div>

          <input
            type="checkbox"
            checked={form.reminder.enabled}
            onChange={(event) =>
              updateReminder({
                enabled:
                  event.target.checked,
              })
            }
            className="size-5 accent-primary"
          />
        </label>

        <label className="flex items-center justify-between gap-4 rounded-xl border p-4">
          <div>
            <p className="text-sm font-medium">
              {lang === "ar"
                ? "التذكير اليومي"
                : "Daily reminders"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {lang === "ar"
                ? "إرسال التذكير مرة واحدة يوميًا لكل فاتورة."
                : "Send at most one reminder per invoice per day."}
            </p>
          </div>

          <input
            type="checkbox"
            checked={
              form.reminder.daily_enabled
            }
            onChange={(event) =>
              updateReminder({
                daily_enabled:
                  event.target.checked,
              })
            }
            className="size-5 accent-primary"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">
              {lang === "ar"
                ? "وقت التذكير"
                : "Reminder time"}
            </label>

            <input
              type="time"
              value={
                form.reminder.reminder_time
              }
              onChange={(event) =>
                updateReminder({
                  reminder_time:
                    event.target.value,
                })
              }
              className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium">
              {lang === "ar"
                ? "المنطقة الزمنية"
                : "Timezone"}
            </label>

            <select
              value={
                form.reminder.timezone
              }
              onChange={(event) =>
                updateReminder({
                  timezone:
                    event.target.value,
                })
              }
              className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm"
            >
              {TIMEZONES.map((timezone) => (
                <option
                  key={timezone}
                  value={timezone}
                >
                  {timezone}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium">
            {lang === "ar"
              ? "مراحل التذكير"
              : "Reminder stages"}
          </p>

          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <StageCard
              title={
                lang === "ar"
                  ? "ودي"
                  : "Friendly"
              }
              start={
                form.reminder
                  .friendly_start_day
              }
              end={
                form.reminder
                  .friendly_end_day
              }
              onStartChange={(value) =>
                updateReminder({
                  friendly_start_day:
                    value,
                })
              }
              onEndChange={(value) =>
                updateReminder({
                  friendly_end_day:
                    value,
                })
              }
            />

            <StageCard
              title={
                lang === "ar"
                  ? "حازم"
                  : "Firm"
              }
              start={
                form.reminder.firm_start_day
              }
              end={
                form.reminder.firm_end_day
              }
              onStartChange={(value) =>
                updateReminder({
                  firm_start_day: value,
                })
              }
              onEndChange={(value) =>
                updateReminder({
                  firm_end_day: value,
                })
              }
            />

            <div className="rounded-xl border p-4">
              <p className="text-sm font-medium">
                {lang === "ar"
                  ? "جدي"
                  : "Serious"}
              </p>

              <label className="mt-3 block text-xs text-muted-foreground">
                {lang === "ar"
                  ? "يبدأ من اليوم"
                  : "Starts from day"}
              </label>

              <input
                type="number"
                min={0}
                max={365}
                value={
                  form.reminder
                    .serious_start_day
                }
                onChange={(event) =>
                  updateReminder({
                    serious_start_day:
                      Number(
                        event.target.value,
                      ),
                  })
                }
                className="mt-1 h-9 w-full rounded-lg border bg-background px-3 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="border-t pt-5">
          <p className="text-sm font-medium">
            {lang === "ar"
              ? "بيانات الدفع"
              : "Payment details"}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            {lang === "ar"
              ? "تُضاف إلى التذكير عندما لا توجد وصلة دفع للفواتير."
              : "These are included when an invoice does not have a payment link."}
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <InputField
              label={
                lang === "ar"
                  ? "اسم البنك"
                  : "Bank name"
              }
              value={
                form.payment?.bank_name ??
                ""
              }
              onChange={(value) =>
                updatePayment({
                  bank_name:
                    value || null,
                })
              }
            />

            <InputField
              label={
                lang === "ar"
                  ? "اسم الحساب"
                  : "Account name"
              }
              value={
                form.payment?.account_name ??
                ""
              }
              onChange={(value) =>
                updatePayment({
                  account_name:
                    value || null,
                })
              }
            />

            <InputField
              label={
                lang === "ar"
                  ? "رقم الحساب"
                  : "Account number"
              }
              value={
                form.payment
                  ?.account_number ?? ""
              }
              onChange={(value) =>
                updatePayment({
                  account_number:
                    value || null,
                })
              }
            />

            <InputField
              label="IBAN"
              value={
                form.payment?.iban ?? ""
              }
              onChange={(value) =>
                updatePayment({
                  iban: value || null,
                })
              }
            />

            <InputField
              label="SWIFT / BIC"
              value={
                form.payment?.swift_bic ??
                ""
              }
              onChange={(value) =>
                updatePayment({
                  swift_bic:
                    value || null,
                })
              }
            />

            <InputField
              label={
                lang === "ar"
                  ? "تعليمات الدفع"
                  : "Payment instructions"
              }
              value={
                form.payment
                  ?.payment_instructions ??
                ""
              }
              onChange={(value) =>
                updatePayment({
                  payment_instructions:
                    value || null,
                })
              }
            />
          </div>
        </div>

        {saveMutation.error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {saveMutation.error instanceof
            Error
              ? saveMutation.error.message
              : String(
                  saveMutation.error,
                )}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          {saveMutation.isSuccess && (
            <span className="flex items-center gap-1.5 text-sm text-success">
              <Check className="size-4" />
              {lang === "ar"
                ? "تم الحفظ"
                : "Saved"}
            </span>
          )}

          <button
            type="button"
            onClick={save}
            disabled={saveMutation.isPending}
            className={cn(
              "rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity",
              saveMutation.isPending &&
                "opacity-60",
            )}
          >
            {saveMutation.isPending
              ? lang === "ar"
                ? "جارٍ الحفظ..."
                : "Saving..."
              : lang === "ar"
                ? "حفظ إعدادات التذكيرات"
                : "Save reminder settings"}
          </button>
        </div>
      </div>
    </section>
  );
}

function InputField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium">
        {props.label}
      </label>
      <input
        type="text"
        value={props.value}
        onChange={(event) =>
          props.onChange(
            event.target.value,
          )
        }
        className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm"
      />
    </div>
  );
}

function StageCard(props: {
  title: string;
  start: number;
  end: number;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
}) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm font-medium">
        {props.title}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">
            From
          </label>
          <input
            type="number"
            min={0}
            max={365}
            value={props.start}
            onChange={(event) =>
              props.onStartChange(
                Number(event.target.value),
              )
            }
            className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">
            To
          </label>
          <input
            type="number"
            min={0}
            max={365}
            value={props.end}
            onChange={(event) =>
              props.onEndChange(
                Number(event.target.value),
              )
            }
            className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
