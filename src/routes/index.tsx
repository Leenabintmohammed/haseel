import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Banknote,
  Bot,
  Building2,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileBarChart,
  FileText,
  Landmark,
  MessageSquare,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Haseel — Your AI Financial Employee",
      },
      {
        name: "description",
        content:
          "Haseel helps freelancers and small businesses manage invoices, payments, follow-ups and financial operations through natural language.",
      },
      {
        property: "og:title",
        content: "Haseel — Your AI Financial Employee",
      },
      {
        property: "og:description",
        content:
          "Tell Haseel what happened. It understands, acts and keeps your financial operations moving.",
      },
    ],
  }),
  component: Landing,
});

const availableFeatures = [
  {
    icon: FileText,
    number: "01",
    title: "Create & Send Invoices",
    description:
      "Create invoices using simple instructions and let Haseel handle the process.",
    items: [
      "Create invoices with natural language",
      "Automatically send invoices to customers",
      "Track invoice status",
    ],
  },
  {
    icon: MessageSquare,
    number: "02",
    title: "Automated WhatsApp Follow-ups",
    description:
      "Stop manually chasing unpaid invoices. Haseel follows up at the right time.",
    items: [
      "Automatically follow up on unpaid invoices",
      "Choose the right time to follow up",
      "Send personalized WhatsApp messages",
    ],
  },
  {
    icon: Sparkles,
    number: "03",
    title: "Understand Customer Replies",
    description:
      "Haseel understands what your customers mean and recommends the best next action.",
    items: [
      "Understand customer responses",
      "Identify what the customer means",
      "Recommend the best next action",
      "Suggest the right response",
    ],
  },
  {
    icon: BarChart3,
    number: "04",
    title: "Daily Business Summary",
    description:
      "Know what happened during the day and exactly what needs your attention.",
    items: [
      "See which invoices were paid",
      "Know which invoices are overdue",
      "See customer replies and pending follow-ups",
      "Get a clear list of what needs your attention",
    ],
  },
];

const comingSoon = [
  {
    icon: Landmark,
    title: "Banking Operations",
    description:
      "Connect your business banking and automate the financial work around your transactions.",
    items: [
      "Connect business bank accounts",
      "Track and categorize transactions",
      "Automatically match payments with invoices",
      "Automate bank reconciliation",
    ],
  },
  {
    icon: CreditCard,
    title: "Payments & Installments",
    description:
      "Give customers flexible ways to pay while keeping payment tracking automatic.",
    items: [
      "Payment links",
      "Recurring payments",
      "Flexible installment plans",
      "Automatic payment tracking",
    ],
  },
  {
    icon: Receipt,
    title: "Tax Management",
    description:
      "Keep tax information organized and turn tax compliance into an automated workflow.",
    items: [
      "VAT tracking",
      "Tax-ready reports",
      "Tax deadlines and reminders",
      "Automated tax workflows",
    ],
  },
  {
    icon: Wallet,
    title: "Cash Flow Intelligence",
    description:
      "Understand where your business stands today and what its financial future may look like.",
    items: [
      "Real-time cash flow overview",
      "Cash flow forecasting",
      "Predict upcoming cash shortages",
      "Identify financial risks",
    ],
  },
  {
    icon: TrendingUp,
    title: "AI Financial Advisor",
    description:
      "Go beyond reporting. Haseel analyzes your business and helps you make better financial decisions.",
    items: [
      "Analyze business financial activity",
      "Identify financial problems",
      "Recommend actions",
      "Provide financial insights",
    ],
  },
  {
    icon: Bot,
    title: "AI Employees",
    description:
      "Build a team of specialized AI employees that work together across your business.",
    items: [
      "AI Sales Employee",
      "AI Customer Support Employee",
      "AI Finance Employee",
      "AI Operations Employee",
    ],
  },
  {
    icon: FileBarChart,
    title: "Advanced Financial Reporting",
    description:
      "Turn business activity into financial intelligence with dashboards, KPIs and automated reporting.",
    items: [
      "Financial dashboards",
      "KPIs and performance insights",
      "Revenue and expense analysis",
      "Automated financial reports",
    ],
  },
  {
    icon: Building2,
    title: "Multi-Company Management",
    description:
      "Run multiple businesses and branches through one centralized AI financial system.",
    items: [
      "Manage multiple businesses",
      "Manage branches",
      "Centralized financial operations",
      "One AI system across your businesses",
    ],
  },
];

function Landing() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
    });
  }, []);

  const authPath = signedIn ? "/dashboard" : "/auth";

  return (
    <div className="min-h-screen overflow-hidden bg-[#040605] text-white">

      {/* ============================================================
          GLOBAL BACKGROUND
      ============================================================ */}

      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-28rem] h-[50rem] w-[50rem] -translate-x-1/2 rounded-full bg-emerald-400/[0.075] blur-[160px]" />
        <div className="absolute right-[-20rem] top-[70rem] h-[40rem] w-[40rem] rounded-full bg-emerald-500/[0.035] blur-[150px]" />
        <div className="absolute left-[-20rem] top-[130rem] h-[35rem] w-[35rem] rounded-full bg-emerald-400/[0.025] blur-[140px]" />
      </div>

      {/* ============================================================
          NAVIGATION
      ============================================================ */}

      <header className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-8">

        <Link to="/" className="flex items-center gap-3">

          <div className="flex size-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08]">
            <Sparkles className="size-4 text-emerald-400" />
          </div>

          <span className="text-xl font-semibold tracking-[-0.04em]">
          Haseel
          </span>

        </Link>

        <div className="flex items-center gap-3">

          <a
            href="#product"
            className="hidden text-sm text-white/40 transition hover:text-white sm:block"
          >
            Product
          </a>

          <a
            href="#roadmap"
            className="hidden text-sm text-white/40 transition hover:text-white sm:block"
          >
            Roadmap
          </a>

          <Button
            asChild
            variant="ghost"
            className="hidden text-white/50 hover:bg-white/5 hover:text-white sm:inline-flex"
          >
            <Link to="/auth">
              Sign in
            </Link>
          </Button>

          <Button
            asChild
            className="rounded-full bg-white px-5 text-black hover:bg-white/90"
          >
            <Link to={authPath}>
              {signedIn ? "Open Haseel" : "Start free"}
            </Link>
          </Button>

        </div>

      </header>

      <main>

        {/* ============================================================
            HERO
        ============================================================ */}

        <section className="mx-auto max-w-7xl px-6 pb-28 pt-20 lg:px-8 lg:pb-36 lg:pt-28">

          <div className="mx-auto max-w-5xl text-center">

            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.025] px-4 py-2 text-xs text-white/50">

              <span className="size-1.5 rounded-full bg-emerald-400" />

              Initial version

              <span className="text-white/20">·</span>

              AI-native financial operations

            </div>

            <h1 className="text-balance text-5xl font-semibold leading-[0.94] tracking-[-0.065em] sm:text-6xl lg:text-8xl">

              Your business has
              <br />

              a financial employee.

              <br />

              <span className="text-emerald-400">
                You just talk.
              </span>

            </h1>

            <p className="mx-auto mt-8 max-w-2xl text-balance text-base leading-7 text-white/50 sm:text-lg">

              Tell Haseel what happened — in English or Arabic — and it can
              create invoices, follow up with customers, understand replies
              and keep your financial operations moving.

            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">

              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-emerald-400 px-8 text-black hover:bg-emerald-300"
              >
                <Link to={authPath}>
                  {signedIn ? "Open your workspace" : "Start free"}
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>

              <a
                href="mailto:speak@gohaseel.com"
                className="text-sm text-white/35 transition hover:text-emerald-400"
              >
                Have an idea? Speak with us →
              </a>

            </div>

          </div>

          {/* ========================================================
              PRODUCT DEMO
          ======================================================== */}

          <div className="relative mx-auto mt-20 max-w-5xl">

            <div className="absolute inset-x-20 -bottom-16 h-40 rounded-full bg-emerald-400/[0.09] blur-[100px]" />

            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#090c0a] shadow-2xl shadow-black/60">

              {/* Browser bar */}

              <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">

                <div className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-white/10" />
                  <span className="size-2.5 rounded-full bg-white/10" />
                  <span className="size-2.5 rounded-full bg-white/10" />
                </div>

                <div className="flex items-center gap-2 text-[10px] tracking-[0.2em] text-white/20">
                  <Sparkles className="size-3 text-emerald-400/60" />
                  Haseel
                </div>

                <div className="w-10" />

              </div>

              <div className="grid min-h-[430px] md:grid-cols-[190px_1fr]">

                {/* Sidebar */}

                <div className="hidden border-r border-white/10 p-4 md:block">

                  <div className="mb-9 flex items-center gap-2">

                    <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-400/10">
                      <Sparkles className="size-3.5 text-emerald-400" />
                    </div>

                    <span className="text-sm font-semibold">
                    Haseel
                    </span>

                  </div>

                  <div className="space-y-1 text-xs">

                    <div className="rounded-lg bg-white/5 px-3 py-2 text-white">
                      Overview
                    </div>

                    <div className="px-3 py-2 text-white/25">
                      Invoices
                    </div>

                    <div className="px-3 py-2 text-white/25">
                      Customers
                    </div>

                    <div className="px-3 py-2 text-white/25">
                      Activity
                    </div>

                  </div>

                </div>

                {/* Main */}

                <div className="flex flex-col">

                  <div className="border-b border-white/10 px-5 py-4">

                    <div className="text-sm font-medium">
                      Good morning.
                    </div>

                    <div className="mt-1 text-xs text-white/30">
                      Here is what needs your attention.
                    </div>

                  </div>

                  <div className="flex-1 space-y-4 p-5">

                    {/* User */}

                    <div className="max-w-md rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.025] p-4">

                      <div className="text-[10px] uppercase tracking-wider text-white/20">
                        You
                      </div>

                      <p className="mt-2 text-sm leading-6 text-white/75">
                        Create an invoice for ABC for AED 12,000 due in
                        30 days.
                      </p>

                    </div>

                    {/* AI */}

                    <div className="ml-auto max-w-md rounded-2xl rounded-tr-md border border-emerald-400/20 bg-emerald-400/[0.055] p-4">

                      <div className="flex items-center gap-2 text-xs text-emerald-300">

                        <Sparkles className="size-3" />

                        Haseel

                      </div>

                      <p className="mt-2 text-sm leading-6 text-white/75">
                        Invoice INV-001 created for ABC for AED 12,000,
                        payable in 30 days.
                      </p>

                      <div className="mt-4 rounded-xl border border-emerald-400/15 bg-black/20 p-3">

                        <div className="flex items-center gap-2 text-xs text-emerald-300">

                          <ShieldCheck className="size-3.5" />

                          Approval required

                        </div>

                        <p className="mt-1 text-[11px] text-white/30">
                          Review before sending to your customer.
                        </p>

                      </div>

                    </div>

                  </div>

                  <div className="border-t border-white/10 p-4">

                    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3">

                      <span className="flex-1 text-xs text-white/20">
                        Tell Haseel what happened...
                      </span>

                      <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-400 text-black">
                        <ArrowRight className="size-3.5" />
                      </div>

                    </div>

                  </div>

                </div>

              </div>

            </div>

          </div>

        </section>

        {/* ============================================================
            POSITIONING
        ============================================================ */}

        <section className="border-y border-white/10 bg-white/[0.015]">

          <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-28">

            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">

              <div>

                <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
                  A different kind of software
                </p>

                <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">

                  Don't learn software.

                  <br />

                  <span className="text-white/35">
                    Tell your employee what to do.
                  </span>

                </h2>

              </div>

              <p className="max-w-xl text-lg leading-8 text-white/45">

                Traditional financial software gives you tools and asks you
                to operate them. Haseel is designed around a different model:
                you describe what happened or what you want, and the AI
                handles the work.

              </p>

            </div>

          </div>

        </section>

        {/* ============================================================
            AVAILABLE NOW
        ============================================================ */}

        <section
          id="product"
          className="mx-auto max-w-7xl px-6 py-28 lg:px-8 lg:py-36"
        >

          <div className="max-w-2xl">

            <div className="flex items-center gap-3">

              <span className="size-2 rounded-full bg-emerald-400" />

              <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
                Available now
              </p>

            </div>

            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">

              Financial operations,
              <br />

              without the busywork.

            </h2>

            <p className="mt-5 text-base leading-7 text-white/40">

            Haseel's initial version focuses on the repetitive financial
              operations that small businesses deal with every day.

            </p>

          </div>

          <div className="mt-16 grid gap-4 md:grid-cols-2">

            {availableFeatures.map((feature) => {

              const Icon = feature.icon;

              return (
                <div
                  key={feature.number}
                  className="group rounded-2xl border border-white/10 bg-white/[0.02] p-8 transition-all duration-300 hover:border-emerald-400/20 hover:bg-emerald-400/[0.025]"
                >

                  <div className="flex items-center justify-between">

                    <div className="flex size-11 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06]">
                      <Icon className="size-5 text-emerald-400" />
                    </div>

                    <span className="text-xs text-white/10">
                      {feature.number}
                    </span>

                  </div>

                  <h3 className="mt-7 text-xl font-medium">
                    {feature.title}
                  </h3>

                  <p className="mt-3 max-w-md text-sm leading-6 text-white/40">
                    {feature.description}
                  </p>

                  <div className="mt-7 space-y-3">

                    {feature.items.map((item) => (

                      <div
                        key={item}
                        className="flex items-start gap-3 text-sm text-white/60"
                      >

                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />

                        <span>
                          {item}
                        </span>

                      </div>

                    ))}

                  </div>

                </div>
              );

            })}

          </div>

        </section>

        {/* ============================================================
            HOW IT WORKS
        ============================================================ */}

        <section className="border-y border-white/10 bg-white/[0.015]">

          <div className="mx-auto max-w-7xl px-6 py-28 lg:px-8 lg:py-36">

            <div className="text-center">

              <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
                How it works
              </p>

              <h2 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">

                One conversation.
                <br />

                Your financial operations connected.

              </h2>

            </div>

            <div className="relative mt-16">

              <div className="absolute left-[12%] right-[12%] top-10 hidden h-px bg-white/10 md:block" />

              <div className="grid gap-10 md:grid-cols-4">

                {[
                  {
                    icon: MessageSquare,
                    number: "01",
                    title: "Tell",
                    text: "Describe what happened in natural language.",
                  },
                  {
                    icon: Sparkles,
                    number: "02",
                    title: "Understand",
                    text: "Haseel understands the context and intent.",
                  },
                  {
                    icon: Zap,
                    number: "03",
                    title: "Act",
                    text: "It creates and executes the required tasks.",
                  },
                  {
                    icon: ShieldCheck,
                    number: "04",
                    title: "Control",
                    text: "You approve actions that need your decision.",
                  },
                ].map((step) => {

                  const Icon = step.icon;

                  return (
                    <div
                      key={step.number}
                      className="relative text-center"
                    >

                      <div className="relative mx-auto flex size-20 items-center justify-center rounded-2xl border border-white/10 bg-[#080b09]">

                        <Icon className="size-5 text-emerald-400" />

                      </div>

                      <div className="mt-6 text-xs text-emerald-400">
                        {step.number}
                      </div>

                      <h3 className="mt-2 font-medium">
                        {step.title}
                      </h3>

                      <p className="mx-auto mt-2 max-w-[220px] text-sm leading-6 text-white/35">
                        {step.text}
                      </p>

                    </div>
                  );

                })}

              </div>

            </div>

          </div>

        </section>

        {/* ============================================================
            INITIAL VERSION
        ============================================================ */}

        <section className="mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">

          <div className="overflow-hidden rounded-3xl border border-emerald-400/10 bg-emerald-400/[0.025]">

            <div className="grid lg:grid-cols-[1.2fr_0.8fr]">

              <div className="p-8 sm:p-12 lg:p-16">

                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-1.5 text-xs text-emerald-300">

                  <Sparkles className="size-3" />

                  Initial version

                </div>

                <h2 className="mt-7 max-w-2xl text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">

                  We're building Haseel
                  <br />

                  <span className="text-emerald-400">
                    with you.
                  </span>

                </h2>

                <p className="mt-6 max-w-xl text-base leading-7 text-white/45">

                  This is an early version of Haseel. We are continuously
                  improving the product and expanding what your AI financial
                  employee can do.

                </p>

                <p className="mt-4 max-w-xl text-base leading-7 text-white/45">

                  Your feedback, ideas and suggestions will help shape what
                  Haseel becomes next.

                </p>

                <div className="mt-8">

                  <a
                    href="mailto:speak@gohaseel.com"
                    className="inline-flex items-center gap-2 text-sm font-medium text-emerald-400 transition hover:text-emerald-300"
                  >
                    speak@gohaseel.com
                    <ArrowRight className="size-4" />
                  </a>

                </div>

              </div>

              <div className="relative hidden min-h-[360px] overflow-hidden border-l border-emerald-400/10 lg:block">

                <div className="absolute inset-0 flex items-center justify-center">

                  <div className="relative">

                    <div className="absolute inset-[-70px] rounded-full bg-emerald-400/[0.07] blur-[70px]" />

                    <div className="relative flex size-32 items-center justify-center rounded-[2rem] border border-emerald-400/20 bg-[#07100b]">

                      <Sparkles className="size-10 text-emerald-400" />

                    </div>

                    <div className="mt-5 text-center">

                      <div className="text-sm font-medium">
                      Haseel
                      </div>

                      <div className="mt-1 text-xs text-white/25">
                        Building the future of business operations
                      </div>

                    </div>

                  </div>

                </div>

              </div>

            </div>

          </div>

        </section>

        
       
        {/* ============================================================
            AI EMPLOYEES
        ============================================================ */}

        <section className="border-y border-white/10 bg-white/[0.015]">

          <div className="mx-auto max-w-7xl px-6 py-28 lg:px-8 lg:py-36">

            <div className="grid gap-16 lg:grid-cols-2 lg:items-center">

              <div>

                <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
                  The bigger vision
                </p>

                <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">

                  One AI.

                  <br />

                  A team of employees.

                </h2>

                <p className="mt-6 max-w-xl text-base leading-7 text-white/40">

                Haseel is designed to evolve from a financial employee into
                  a broader AI workforce for your business — with specialized
                  employees that understand their role and work together.

                </p>

                <div className="mt-9 space-y-3">

                  {[
                    "AI Sales Employee",
                    "AI Customer Support Employee",
                    "AI Finance Employee",
                    "AI Operations Employee",
                  ].map((employee) => (

                    <div
                      key={employee}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
                    >

                      <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-400/10">

                        <Bot className="size-4 text-emerald-400" />

                      </div>

                      <span className="text-sm text-white/65">
                        {employee}
                      </span>

                      <span className="ml-auto text-[10px] uppercase tracking-wider text-white/15">
                        Soon
                      </span>

                    </div>

                  ))}

                </div>

              </div>

              <div className="relative">

                <div className="absolute inset-0 rounded-full bg-emerald-400/[0.05] blur-[100px]" />

                <div className="relative rounded-3xl border border-white/10 bg-[#080b09] p-7 sm:p-9">

                  <div className="flex flex-col items-center">

                    <div className="flex size-24 items-center justify-center rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.07]">

                      <Sparkles className="size-9 text-emerald-400" />

                    </div>

                    <div className="mt-5 text-sm font-medium">
                    Haseel AI
                    </div>

                    <div className="mt-1 text-xs text-white/20">
                      One intelligence layer
                    </div>

                    <div className="my-7 h-10 w-px bg-white/10" />

                    <div className="grid w-full grid-cols-2 gap-3">

                      {[
                        "Sales",
                        "Support",
                        "Finance",
                        "Operations",
                      ].map((name) => (

                        <div
                          key={name}
                          className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center"
                        >

                          <Bot className="mx-auto size-4 text-emerald-400/70" />

                          <div className="mt-3 text-xs text-white/45">
                            AI {name}
                          </div>

                        </div>

                      ))}

                    </div>

                  </div>

                </div>

              </div>

            </div>

          </div>

        </section>

        {/* ============================================================
            CONTROL
        ============================================================ */}

        <section className="mx-auto max-w-7xl px-6 py-28 lg:px-8 lg:py-36">

          <div className="mx-auto max-w-3xl text-center">

            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">

              <ShieldCheck className="size-5 text-emerald-400" />

            </div>

            <p className="mt-7 text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
              Built around control
            </p>

            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">

              AI can act.

              <br />

              You stay in control.

            </h2>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-white/40">

            Haseel is designed around controlled automation. Actions that
              communicate externally can wait for your approval before they
              are sent.

            </p>

            <div className="mt-10 inline-flex items-center gap-3 rounded-full border border-emerald-400/15 bg-emerald-400/[0.05] px-5 py-3 text-sm text-emerald-200">

              <ShieldCheck className="size-4 text-emerald-400" />

              Approval before external sending

            </div>

          </div>

        </section>

        {/* ============================================================
            LANGUAGE
        ============================================================ */}

        <section className="border-y border-white/10 bg-white/[0.015]">

          <div className="mx-auto max-w-7xl px-6 py-24 text-center lg:px-8 lg:py-28">

            <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
              Speak naturally
            </p>

            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">

              English or Arabic.

              <br />

              Just tell Haseel what happened.

            </h2>

            <div className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-2">

              <div className="rounded-2xl border border-white/10 bg-[#080b09] p-6 text-left">

                <div className="text-[10px] uppercase tracking-wider text-white/20">
                  English
                </div>

                <div className="mt-4 text-sm text-white/65">
                  “Create an invoice for ABC for AED 12,000.”
                </div>

              </div>

              <div
                dir="rtl"
                className="rounded-2xl border border-white/10 bg-[#080b09] p-6 text-right"
              >

                <div className="text-[10px] uppercase tracking-wider text-white/20">
                  العربية
                </div>

                <div className="mt-4 text-sm text-white/65">
                  “ABC دفع 5 آلاف درهم.”
                </div>

              </div>

            </div>

          </div>

        </section>

        {/* ============================================================
            FEEDBACK
        ============================================================ */}

        <section className="mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">

          <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/[0.02] p-8 text-center sm:p-12 lg:p-16">

            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-400/10">

              <MessageSquare className="size-5 text-emerald-400" />

            </div>

            <h2 className="mt-7 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">

              Help us build what comes next.

            </h2>

            <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-white/40 sm:text-base">

            Haseel is currently in its initial version. We are continuously
              improving the product, and we would love to hear your feedback,
              ideas and suggestions.

            </p>

            <a
              href="mailto:speak@gohaseel.com"
              className="mt-8 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-5 py-3 text-sm font-medium text-emerald-300 transition hover:bg-emerald-400/10"
            >

              speak@gohaseel.com

              <ArrowRight className="size-4" />

            </a>

          </div>

        </section>

        {/* ============================================================
            FINAL CTA
        ============================================================ */}

        <section className="relative mx-auto max-w-7xl px-6 py-28 lg:px-8 lg:py-40">

          <div className="absolute inset-x-1/4 top-1/2 -z-10 h-48 -translate-y-1/2 rounded-full bg-emerald-400/[0.07] blur-[110px]" />

          <div className="mx-auto max-w-3xl text-center">

            <Sparkles className="mx-auto size-7 text-emerald-400" />

            <h2 className="mt-7 text-5xl font-semibold leading-[0.98] tracking-[-0.06em] sm:text-6xl">

              Your business is busy.

              <br />

              Let Haseel handle
              <br />

              the busywork.

            </h2>

            <p className="mx-auto mt-7 max-w-xl text-base leading-7 text-white/40">

              Start with financial operations today.
              <br />
              Build toward an AI-powered business tomorrow.

            </p>

            <div className="mt-9">

              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-emerald-400 px-8 text-black hover:bg-emerald-300"
              >
                <Link to={authPath}>

                  {signedIn ? "Open your workspace" : "Start free"}

                  <ArrowRight className="ml-2 size-4" />

                </Link>
              </Button>

            </div>

          </div>

        </section>

      </main>

      {/* ==============================================================
          FOOTER
      ============================================================== */}

      <footer className="border-t border-white/10">

        <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8">

          <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">

            <div>

              <div className="flex items-center gap-3">

                <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-400/10">

                  <Sparkles className="size-4 text-emerald-400" />

                </div>

                <span className="font-medium">
                Haseel
                </span>

              </div>

              <p className="mt-3 max-w-sm text-xs leading-5 text-white/25">

                AI-native financial operations for freelancers and small
                businesses.

              </p>

            </div>

            <div className="flex flex-col gap-3 text-xs sm:items-end">

              <a
                href="mailto:speak@gohaseel.com"
                className="text-white/40 transition hover:text-emerald-400"
              >
                speak@gohaseel.com
              </a>

              <span className="text-white/20">
                We welcome your feedback and suggestions.
              </span>

            </div>

          </div>

          <div className="mt-10 flex flex-col gap-2 border-t border-white/5 pt-6 text-[11px] text-white/20 sm:flex-row sm:items-center sm:justify-between">

            <span>
              © {new Date().getFullYear()} Haseel
            </span>

            <span>
              Initial version · More coming soon
            </span>

          </div>

        </div>

      </footer>

    </div>
  );
}
