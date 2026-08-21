import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "ar";

const dict = {
  en: {
    dashboard: "Dashboard",
    clients: "Clients",
    invoices: "Invoices",
    payments: "Payments",
    ai_activity: "AI Activity",
    settings: "Settings",
    duely_ai: "Haseel AI",
    online: "Online",
    ask_duely: "Ask Haseel about your invoices...",
    context: "Context",
    outstanding: "Outstanding",
    overdue: "Overdue",
    paid_this_month: "Paid this month",
    expected_this_month: "Expected this month",
    intelligence: "Haseel Intelligence",
    recent_ai: "Recent AI Activity",
    overdue_invoices: "Overdue Invoices",
    total_billed: "Total billed",
    total_paid: "Total paid",
    no_clients_title: "Your business starts here.",
    no_clients_body: "Tell Haseel who your first client is.",
    no_invoices_title: "Nothing billed yet.",
    no_invoices_body: "Tell Haseel what you billed and who you billed.",
    sign_out: "Sign out",
    approve: "Approve",
    modify: "Modify",
    cancel: "Cancel",
    all: "All",
    draft: "Draft",
    sent: "Sent",
    paid: "Paid",
    language: "Language",
  },
  ar: {
    dashboard: "لوحة التحكم",
    clients: "العملاء",
    invoices: "الفواتير",
    payments: "المدفوعات",
    ai_activity: "نشاط الذكاء",
    settings: "الإعدادات",
    duely_ai: "حصيل الذكي",
    online: "متصل",
    ask_duely: "اسأل حصيل أي شيء عن أعمالك…",
    context: "السياق",
    outstanding: "مستحق",
    overdue: "متأخر",
    paid_this_month: "المحصل هذا الشهر",
    expected_this_month: "المتوقع هذا الشهر",
    intelligence: "ذكاء حصيل",
    recent_ai: "آخر نشاط للذكاء",
    overdue_invoices: "الفواتير المتأخرة",
    total_billed: "إجمالي الفوترة",
    total_paid: "إجمالي المدفوع",
    no_clients_title: "أعمالك تبدأ من هنا.",
    no_clients_body: "أخبر حصيل عن أول عميل لك.",
    no_invoices_title: "لا توجد فواتير بعد.",
    no_invoices_body: "أخبر حصيل بما قمت بفوترته ولمن.",
    sign_out: "تسجيل الخروج",
    approve: "موافقة",
    modify: "تعديل",
    cancel: "إلغاء",
    all: "الكل",
    draft: "مسودة",
    sent: "مرسلة",
    paid: "مدفوعة",
    language: "اللغة",
  },
} as const;

export type TKey = keyof (typeof dict)["en"];

type Ctx = { lang: Lang; dir: "ltr" | "rtl"; setLang: (l: Lang) => void; t: (k: TKey) => string };

const I18nContext = createContext<Ctx>({ lang: "en", dir: "ltr", setLang: () => {}, t: (k) => dict.en[k] });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem("duely_lang") as Lang | null;
    if (stored === "ar" || stored === "en") setLangState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    window.localStorage.setItem("duely_lang", l);
  }, []);

  const t = useCallback((k: TKey) => dict[lang][k] ?? dict.en[k], [lang]);

  return (
    <I18nContext.Provider value={{ lang, dir: lang === "ar" ? "rtl" : "ltr", setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);