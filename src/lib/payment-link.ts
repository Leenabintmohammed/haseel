import { z } from "zod";

function normalizeBlank(value: unknown) {
  if (value == null) return value;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export const optionalPaymentLinkSchema = z.preprocess(
  (value) => {
    const normalized = normalizeBlank(value);
    return normalized === null ? undefined : normalized;
  },
  z.string().url("Payment link must be a valid URL.").optional(),
);

export const updatablePaymentLinkSchema = z.preprocess(
  normalizeBlank,
  z.string().url("Payment link must be a valid URL.").nullable().optional(),
);

export function normalizePaymentLinkForCreate(value: unknown): string | null {
  return updatablePaymentLinkSchema.parse(value) ?? null;
}

export function normalizePaymentLinkForUpdate(
  value: unknown,
): string | null | undefined {
  return updatablePaymentLinkSchema.parse(value);
}
