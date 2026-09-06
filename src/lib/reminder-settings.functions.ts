import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_REMINDER_SETTINGS,
  type ReminderSettings,
  type BusinessPaymentSettings,
} from "./reminder-engine.server";

const reminderSettingsSchema = z.object({
  enabled: z.boolean(),
  daily_enabled: z.boolean(),
  reminder_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/),
  timezone: z.string().trim().min(1).max(100),
  friendly_start_day: z.number().int().min(0).max(365),
  friendly_end_day: z.number().int().min(0).max(365),
  firm_start_day: z.number().int().min(0).max(365),
  firm_end_day: z.number().int().min(0).max(365),
  serious_start_day: z.number().int().min(0).max(365),
});

const paymentSettingsSchema = z.object({
  bank_name: z.string().trim().max(200).nullable(),
  account_name: z.string().trim().max(200).nullable(),
  account_number: z.string().trim().max(100).nullable(),
  iban: z.string().trim().max(100).nullable(),
  swift_bic: z.string().trim().max(50).nullable(),
  payment_instructions: z.string().trim().max(1000).nullable(),
});

export type ReminderWorkspaceSettings = {
  reminder: ReminderSettings;
  payment: BusinessPaymentSettings | null;
};

export const getReminderSettingsFn = createServerFn({
  method: "GET",
})
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReminderWorkspaceSettings> => {
    const ownerId = context.userId;

    const [reminderResult, paymentResult] = await Promise.all([
      context.supabase
        .from("reminder_settings")
        .select(
          "enabled,daily_enabled,reminder_time,timezone,friendly_start_day,friendly_end_day,firm_start_day,firm_end_day,serious_start_day",
        )
        .eq("owner_id", ownerId)
        .maybeSingle(),

      context.supabase
        .from("business_payment_settings")
        .select(
          "bank_name,account_name,account_number,iban,swift_bic,payment_instructions",
        )
        .eq("owner_id", ownerId)
        .maybeSingle(),
    ]);

    if (reminderResult.error) {
      throw new Error(
        `Unable to load reminder settings: ${reminderResult.error.message}`,
      );
    }

    if (paymentResult.error) {
      throw new Error(
        `Unable to load payment settings: ${paymentResult.error.message}`,
      );
    }

    const reminderRow = reminderResult.data;

    const reminder: ReminderSettings = {
      ...DEFAULT_REMINDER_SETTINGS,
      ...(reminderRow
        ? {
            enabled: Boolean(reminderRow.enabled),
            daily_enabled: Boolean(reminderRow.daily_enabled),
            reminder_time:
              String(reminderRow.reminder_time ?? "10:00").slice(
                0,
                5,
              ),
            timezone: String(
              reminderRow.timezone ?? "Asia/Dubai",
            ),
            friendly_start_day: Number(
              reminderRow.friendly_start_day,
            ),
            friendly_end_day: Number(
              reminderRow.friendly_end_day,
            ),
            firm_start_day: Number(
              reminderRow.firm_start_day,
            ),
            firm_end_day: Number(
              reminderRow.firm_end_day,
            ),
            serious_start_day: Number(
              reminderRow.serious_start_day,
            ),
          }
        : {}),
    };

    return {
      reminder,
      payment: paymentResult.data
        ? {
            bank_name:
              paymentResult.data.bank_name ?? null,
            account_name:
              paymentResult.data.account_name ?? null,
            account_number:
              paymentResult.data.account_number ?? null,
            iban:
              paymentResult.data.iban ?? null,
            swift_bic:
              paymentResult.data.swift_bic ?? null,
            payment_instructions:
              paymentResult.data.payment_instructions ??
              null,
          }
        : null,
    };
  });

export const saveReminderSettingsFn = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => {
    const parsed =
      value as {
        reminder: unknown;
        payment: unknown;
      };

    return {
      reminder:
        reminderSettingsSchema.parse(parsed.reminder),
      payment:
        paymentSettingsSchema.parse(parsed.payment),
    };
  })
  .handler(async ({ data, context }) => {
    const ownerId = context.userId;

    if (
      data.reminder.friendly_start_day >
      data.reminder.friendly_end_day
    ) {
      throw new Error(
        "Friendly reminder range is invalid.",
      );
    }

    if (
      data.reminder.firm_start_day <=
      data.reminder.friendly_end_day
    ) {
      throw new Error(
        "Firm reminder stage must start after the friendly stage.",
      );
    }

    if (
      data.reminder.firm_start_day >
      data.reminder.firm_end_day
    ) {
      throw new Error(
        "Firm reminder range is invalid.",
      );
    }

    if (
      data.reminder.serious_start_day <=
      data.reminder.firm_end_day
    ) {
      throw new Error(
        "Serious reminder stage must start after the firm stage.",
      );
    }

    const [reminderResult, paymentResult] =
      await Promise.all([
        context.supabase
          .from("reminder_settings")
          .upsert(
            {
              owner_id: ownerId,
              enabled: data.reminder.enabled,
              daily_enabled:
                data.reminder.daily_enabled,
              reminder_time:
                data.reminder.reminder_time,
              timezone: data.reminder.timezone,
              friendly_start_day:
                data.reminder.friendly_start_day,
              friendly_end_day:
                data.reminder.friendly_end_day,
              firm_start_day:
                data.reminder.firm_start_day,
              firm_end_day:
                data.reminder.firm_end_day,
              serious_start_day:
                data.reminder.serious_start_day,
            },
            {
              onConflict: "owner_id",
            },
          )
          .select(
            "enabled,daily_enabled,reminder_time,timezone,friendly_start_day,friendly_end_day,firm_start_day,firm_end_day,serious_start_day",
          )
          .single(),

        context.supabase
          .from("business_payment_settings")
          .upsert(
            {
              owner_id: ownerId,
              bank_name:
                data.payment.bank_name || null,
              account_name:
                data.payment.account_name || null,
              account_number:
                data.payment.account_number || null,
              iban:
                data.payment.iban || null,
              swift_bic:
                data.payment.swift_bic || null,
              payment_instructions:
                data.payment.payment_instructions ||
                null,
            },
            {
              onConflict: "owner_id",
            },
          )
          .select(
            "bank_name,account_name,account_number,iban,swift_bic,payment_instructions",
          )
          .single(),
      ]);

    if (reminderResult.error) {
      throw new Error(
        `Unable to save reminder settings: ${reminderResult.error.message}`,
      );
    }

    if (paymentResult.error) {
      throw new Error(
        `Unable to save payment settings: ${paymentResult.error.message}`,
      );
    }

    return {
      success: true,
      reminder: reminderResult.data,
      payment: paymentResult.data,
    };
  });
