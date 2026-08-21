export function formatMoney(amount: number | string | null | undefined, currency = "AED", locale = "en") {
  const n = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString()}`;
  }
}

export function daysBetween(a: string | Date, b: string | Date = new Date()) {
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  return Math.floor((d2 - d1) / 86_400_000);
}

export function daysOverdue(dueDate: string) {
  return Math.max(0, daysBetween(dueDate));
}

export function formatDate(d: string | Date | null | undefined, locale = "en") {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}