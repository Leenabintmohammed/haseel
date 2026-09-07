import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
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
          "Haseel helps businesses create invoices, collect payments, follow up with customers and run financial operations through AI.",
      },
      {
        property: "og:title",
        content: "Haseel — Your AI Financial Employee",
      },
      {
        property: "og:description",
        content:
          "Create. Collect. Follow up. Let Haseel run your financial operations.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
    });
  }, []);

  const authPath = signedIn ? "/dashboard" : "/auth";

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050706] text-white selection:bg-emerald-400/20">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-22rem] h-[46rem] w-[46rem] -translate-x-1/2 rounded-full bg-emerald-400/[0.09] blur-[150px]" />
        <div className="absolute right-[-15rem] top-[45rem] h-[32rem] w-[32rem] rounded-full bg-emerald-500/[0.035] blur-[140px]" />
        <div className="absolute left-[-18rem] top-[105rem] h-[34rem] w-[34rem] rounded-full bg-emerald-400/[0.025] blur-[140px]" />
      </div>

      {/* ──────────────────────────────────────────────────────────────
          NAV
      ────────────────────────────────────────────────────────────── */}
      <header className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08]">
            <Sparkles className="size-4 text-emerald-400" />
          </div>

          <span className="text-xl font-semibold tracking-[-0.045em]">
            Haseel
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <a
            href="#how-it-works"
            className="text-sm text-white/40 transition hover:text-white"
          >
            How it works
          </a>

          <a
            href="#product"
            className="text-sm text-white/40 transition hover:text-white"
          >
            Product
          </a>

          <a
            href="#future"
            className="text-sm text-white/40 transition hover:text-white"
          >
            The future
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/auth"
            className="hidden text-sm text-white/45 transition hover:text-white sm:block"
          >
            Sign in
          </Link>

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
        {/* ──────────────────────────────────────────────────────────────
            HERO
        ────────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-6 pb-28 pt-20 lg:px-8 lg:pb-36 lg:pt-28">
          <div className="mx-auto max-w-5xl text-center">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.025] px-4 py-2 text-xs text-white/45">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              AI-native financial operations
              <span className="text-white/20">·</span>
              Built for small businesses
            </div>

            <h1 className="text-balance text-5xl font-semibold leading-[0.92] tracking-[-0.07em] sm:text-6xl lg:text-8xl">
              Get paid.
              <br />
              <span className="text-white/95">Without chasing.</span>
              <br />
              <span className="text-emerald-400">Haseel handles it.</span>
            </h1>

            <p className="mx-auto mt-8 max-w-2xl text-balance text-base leading-7 text-white/50 sm:text-lg">
              Haseel is your AI financial employee. Create invoices, track
              payments, follow up with customers, understand their replies
              and keep your receivables moving — through one simple
              conversation.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-emerald-400 px-8 text-black shadow-[0_0_40px_rgba(52,211,153,0.14)] hover:bg-emerald-300"
              >
                <Link to={authPath}>
                  {signedIn ? "Open your workspace" : "Start free"}
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>

              <a
                href="#how-it-works"
                className="inline-flex items-center gap-1 text-sm text-white/35 transition hover:text-white"
              >
                See how it works
                <ChevronRight className="size-4" />
              </a>
            </div>
          </div>

          {/* Hero product mockup */}
          <div className="relative mx-auto mt-20 max-w-6xl">
            <div className="absolute inset-x-20 -bottom-16 h-44 rounded-full bg-emerald-400/[0.08] blur-[110px]" />

            <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#090d0b] shadow-2xl shadow-black/60">
              <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
                <div className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-white/10" />
                  <span className="size-2.5 rounded-full bg-white/10" />
                  <span className="size-2.5 rounded-full bg-white/10" />
                </div>

                <div className="flex items-center gap-2 text-[10px] tracking-[0.22em] text-white/20">
                  <Sparkles className="size-3 text-emerald-400/60" />
                  HASEEL
                </div>

                <div className="w-12" />
              </div>

              <div className="grid min-h-[500px] lg:grid-cols-[210px_1fr]">
                {/* Sidebar */}
                <div className="hidden border-r border-white/10 p-5 lg:block">
                  <div className="mb-10 flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-400/10">
                      <Sparkles className="size-4 text-emerald-400" />
                    </div>

                    <span className="text-sm font-semibold">Haseel</span>
                  </div>

                  <div className="space-y-1">
                    {[
                      "Overview",
                      "Invoices",
                      "Customers",
                      "Payments",
                      "AI activity",
                    ].map((item, index) => (
                      <div
                        key={item}
                        className={`rounded-lg px-3 py-2.5 text-xs ${
                          index === 0
                            ? "bg-white/5 text-white"
                            : "text-white/25"
                        }`}
                      >
                        {item}
                      </div>
                    ))}
                  </div>

                  <div className="mt-10 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.035] p-3">
                    <div className="flex items-center gap-2 text-[11px] text-emerald-300">
                      <ShieldCheck className="size-3.5" />
                      AI controls active
                    </div>

                    <p className="mt-2 text-[10px] leading-5 text-white/25">
                      Sensitive actions require your approval.
                    </p>
                  </div>
                </div>

                {/* Main UI */}
                <div className="flex min-w-0 flex-col">
                  <div className="border-b border-white/10 px-5 py-5 sm:px-7">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Good morning.</p>
                        <p className="mt-1 text-xs text-white/30">
                          Here is what needs your attention today.
                        </p>
                      </div>

                      <div className="hidden items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-1.5 text-[10px] text-emerald-300 sm:flex">
                        <span className="size-1.5 rounded-full bg-emerald-400" />
                        AI online
                      </div>
                    </div>
                  </div>

                  <div className="grid flex-1 gap-4 p-5 sm:p-7 lg:grid-cols-[1fr_250px]">
                    {/* Conversation */}
                    <div className="space-y-4">
                      <div className="max-w-lg rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.025] p-4">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/20">
                          You
                        </div>

                        <p className="mt-2 text-sm leading-6 text-white/75">
                          Create an invoice for ABC for AED 12,000. Payment is
                          due in 30 days.
                        </p>
                      </div>

                      <div className="ml-auto max-w-lg rounded-2xl rounded-tr-md border border-emerald-400/20 bg-emerald-400/[0.045] p-4">
                        <div className="flex items-center gap-2 text-xs text-emerald-300">
                          <Sparkles className="size-3.5" />
                          Haseel
                        </div>

                        <p className="mt-2 text-sm leading-6 text-white/75">
                          Done. I created invoice{" "}
                          <span className="text-white">INV-001</span> for
                          AED 12,000, due in 30 days.
                        </p>

                        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                          <div className="flex items-center gap-2 text-xs text-white/60">
                            <FileText className="size-3.5 text-emerald-400" />
                            Invoice ready
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                            <div>
                              <div className="text-white/20">Customer</div>
                              <div className="mt-1 text-white/60">ABC</div>
                            </div>

                            <div>
                              <div className="text-white/20">Amount</div>
                              <div className="mt-1 text-white/60">
                                AED 12,000
                              </div>
                            </div>

                            <div>
                              <div className="text-white/20">Due</div>
                              <div className="mt-1 text-white/60">30 days</div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.035] p-3">
                          <div className="flex items-center gap-2 text-xs text-emerald-300">
                            <ShieldCheck className="size-3.5" />
                            Approval required
                          </div>

                          <p className="mt-1 text-[11px] text-white/25">
                            Haseel will wait for your approval before sending.
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-7 items-center justify-center rounded-lg bg-white/5">
                            <Sparkles className="size-3.5 text-white/30" />
                          </div>

                          <span className="flex-1 text-xs text-white/20">
                            Tell Haseel what happened...
                          </span>

                          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-400 text-black">
                            <ArrowRight className="size-3.5" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right rail */}
                    <div className="hidden space-y-3 lg:block">
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-white/20">
                          Receivables
                        </div>

                        <div className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                          AED 48.2k
                        </div>

                        <div className="mt-1 text-[11px] text-white/30">
                          outstanding
                        </div>

                        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
                          <div className="h-full w-[68%] rounded-full bg-emerald-400/70" />
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                        <div className="flex items-center gap-2 text-[11px] text-white/45">
                          <MessageSquare className="size-3.5 text-emerald-400" />
                          WhatsApp
                        </div>

                        <p className="mt-2 text-[11px] leading-5 text-white/25">
                          3 customer conversations need attention.
                        </p>

                        <div className="mt-3 space-y-2">
                          <div className="rounded-lg bg-white/[0.025] px-3 py-2 text-[10px] text-white/35">
                            “I can pay next Tuesday.”
                          </div>

                          <div className="rounded-lg bg-white/[0.025] px-3 py-2 text-[10px] text-white/35">
                            “Can we split this invoice?”
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                        <div className="flex items-center gap-2 text-[11px] text-white/45">
                          <TrendingUp className="size-3.5 text-emerald-400" />
                          Today
                        </div>

                        <div className="mt-3 space-y-2 text-[10px]">
                          <div className="flex justify-between">
                            <span className="text-white/25">Paid</span>
                            <span className="text-white/60">
                              AED 8,420
                            </span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-white/25">Overdue</span>
                            <span className="text-white/60">7</span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-white/25">
                              Follow-ups
                            </span>
                            <span className="text-emerald-300">12</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            LOGO / TRUST STRIP
        ────────────────────────────────────────────────────────────── */}
        <section className="border-y border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 py-8 text-center sm:flex-row sm:text-left lg:px-8">
            <p className="max-w-xl text-sm leading-6 text-white/30">
              Built for the everyday financial work that steals time from
              business owners.
            </p>

            <div className="flex flex-wrap justify-center gap-x-7 gap-y-3 text-xs uppercase tracking-[0.2em] text-white/15">
              <span>Invoices</span>
              <span>Collections</span>
              <span>WhatsApp</span>
              <span>Payments</span>
              <span>AI</span>
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            PROBLEM → SOLUTION
        ────────────────────────────────────────────────────────────── */}
        <section
          id="how-it-works"
          className="mx-auto max-w-7xl px-6 py-28 lg:px-8 lg:py-36"
        >
          <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <div className="mb-5 text-xs font-medium uppercase tracking-[0.22em] text-emerald-400/80">
                The problem
              </div>

              <h2 className="max-w-xl text-4xl font-semibold leading-[1] tracking-[-0.055em] sm:text-5xl">
                Running a business should not mean chasing money.
              </h2>

              <p className="mt-6 max-w-xl text-base leading-7 text-white/40">
                Invoices are created manually. Payments get missed. Customers
                need follow-ups. Someone has to remember who promised to pay,
                who asked for more time and who is becoming a risk.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  icon: Clock3,
                  title: "Hours disappear",
                  text: "Manual reminders, payment tracking and repetitive follow-ups.",
                },
                {
                  icon: Users,
                  title: "Customer context gets lost",
                  text: "Important conversations and payment behavior live in different places.",
                },
                {
                  icon: CircleDollarSign,
                  title: "Cash arrives late",
                  text: "Small delays become bigger receivables problems.",
                },
                {
                  icon: Bot,
                  title: "Too much depends on you",
                  text: "The financial work keeps coming back to the owner.",
                },
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:border-emerald-400/15 hover:bg-emerald-400/[0.025]"
                  >
                    <div className="flex size-10 items-center justify-center rounded-xl bg-white/5">
                      <Icon className="size-4 text-emerald-400" />
                    </div>

                    <h3 className="mt-5 text-base font-medium">
                      {item.title}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-white/30">
                      {item.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            HOW IT WORKS
        ────────────────────────────────────────────────────────────── */}
        <section className="border-y border-white/10 bg-white/[0.015]">
          <div className="mx-auto max-w-7xl px-6 py-28 lg:px-8 lg:py-36">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mb-5 text-xs font-medium uppercase tracking-[0.22em] text-emerald-400/80">
                How Haseel works
              </div>

              <h2 className="text-4xl font-semibold leading-[1] tracking-[-0.055em] sm:text-5xl">
                One conversation.
                <br />
                Your financial operations move.
              </h2>

              <p className="mt-6 text-base leading-7 text-white/35">
                You tell Haseel what you want. Haseel understands the context,
                performs the work and keeps you in control of important
                decisions.
              </p>
            </div>

            <div className="mt-16 grid gap-4 md:grid-cols-4">
              {[
                {
                  number: "01",
                  icon: MessageSquare,
                  title: "Tell",
                  text: "“Create an invoice for ABC for AED 12,000.”",
                },
                {
                  number: "02",
                  icon: Zap,
                  title: "Act",
                  text: "Haseel creates the invoice, calculates totals and prepares it.",
                },
                {
                  number: "03",
                  icon: ShieldCheck,
                  title: "Control",
                  text: "Sensitive actions can require your approval before execution.",
                },
                {
                  number: "04",
                  icon: TrendingUp,
                  title: "Keep moving",
                  text: "Haseel continues tracking the customer and payment journey.",
                },
              ].map((step) => {
                const Icon = step.icon;

                return (
                  <div
                    key={step.number}
                    className="relative rounded-2xl border border-white/10 bg-[#090c0a] p-6"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium tracking-[0.2em] text-white/20">
                        {step.number}
                      </span>

                      <Icon className="size-4 text-emerald-400" />
                    </div>

                    <h3 className="mt-8 text-lg font-medium">{step.title}</h3>

                    <p className="mt-2 text-sm leading-6 text-white/30">
                      {step.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            PRODUCT
        ────────────────────────────────────────────────────────────── */}
        <section
          id="product"
          className="mx-auto max-w-7xl px-6 py-28 lg:px-8 lg:py-36"
        >
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-5 text-xs font-medium uppercase tracking-[0.22em] text-emerald-400/80">
              What Haseel handles
            </div>

            <h2 className="text-4xl font-semibold leading-[1] tracking-[-0.055em] sm:text-5xl">
              The work behind getting paid.
              <br />
              In one place.
            </h2>
          </div>

          <div className="mt-16 grid gap-4 lg:grid-cols-3">
            <FeatureCard
              icon={FileText}
              eyebrow="01"
              title="Invoices"
              description="Create, calculate, organize and track invoices without repetitive admin work."
              items={[
                "Create invoices with natural language",
                "Line items, discounts and tax",
                "PDF generation",
                "Invoice lifecycle tracking",
              ]}
            />

            <FeatureCard
              icon={MessageSquare}
              eyebrow="02"
              title="Collections"
              description="Follow up automatically and keep customer conversations connected to the money they owe."
              items={[
                "WhatsApp follow-ups",
                "Overdue reminders",
                "Customer replies",
                "Payment promises",
              ]}
            />

            <FeatureCard
              icon={BarChart3}
              eyebrow="03"
              title="Financial visibility"
              description="Know what is paid, overdue, at risk and what deserves your attention today."
              items={[
                "Outstanding balances",
                "Payment history",
                "Customer risk signals",
                "Daily financial summary",
              ]}
            />
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            WHATSAPP + CUSTOMER AI
        ────────────────────────────────────────────────────────────── */}
        <section className="border-y border-white/10">
          <div className="mx-auto max-w-7xl px-6 py-28 lg:px-8 lg:py-36">
            <div className="grid gap-14 lg:grid-cols-[1fr_0.9fr] lg:items-center">
              <div>
                <div className="mb-5 text-xs font-medium uppercase tracking-[0.22em] text-emerald-400/80">
                  The conversation continues
                </div>

                <h2 className="max-w-2xl text-4xl font-semibold leading-[1] tracking-[-0.055em] sm:text-5xl">
                  Your customer does not need another portal.
                  <br />
                  <span className="text-emerald-400">They already have WhatsApp.</span>
                </h2>

                <p className="mt-6 max-w-xl text-base leading-7 text-white/40">
                  Haseel can take the financial conversation directly to where
                  your customers already communicate. It can send invoices,
                  follow up, understand replies and capture payment promises
                  or requests for flexibility.
                </p>

                <div className="mt-8 space-y-3">
                  {[
                    "Invoice delivered through WhatsApp",
                    "Personalized payment reminders",
                    "Understand customer responses",
                    "Capture promises and payment requests",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-3 text-sm text-white/55"
                    >
                      <div className="flex size-5 items-center justify-center rounded-full bg-emerald-400/10">
                        <Check className="size-3 text-emerald-400" />
                      </div>

                      {item}
                    </div>
                  ))}
                </div>
              </div>

              {/* WhatsApp mockup */}
              <div className="mx-auto w-full max-w-md">
                <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#080b09] shadow-2xl shadow-black/50">
                  <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                    <div className="flex size-9 items-center justify-center rounded-full bg-emerald-400/10">
                      <MessageSquare className="size-4 text-emerald-400" />
                    </div>

                    <div>
                      <div className="text-sm font-medium">Haseel</div>
                      <div className="text-[10px] text-white/20">
                        financial assistant
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-5">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-white/[0.035] p-4">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-white/20">
                        Haseel
                      </div>

                      <p className="mt-2 text-sm leading-6 text-white/60">
                        Hi Ahmed. Invoice INV-014 for AED 8,500 is due today.
                        Would you like the payment link?
                      </p>
                    </div>

                    <div className="ml-auto max-w-[75%] rounded-2xl rounded-tr-md bg-emerald-400/[0.08] p-4">
                      <p className="text-sm leading-6 text-white/65">
                        I can pay next Tuesday.
                      </p>
                    </div>

                    <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-white/[0.035] p-4">
                      <div className="flex items-center gap-2 text-[10px] text-emerald-300">
                        <Sparkles className="size-3" />
                        Haseel understands
                      </div>

                      <p className="mt-2 text-sm leading-6 text-white/60">
                        Got it. I recorded your payment promise for Tuesday
                        and will keep the invoice on track.
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/20">
                        Customer memory
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-[10px] text-white/20">
                            Payment behavior
                          </div>
                          <div className="mt-1 text-xs text-white/45">
                            Usually pays within 5 days
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] text-white/20">
                            Current promise
                          </div>
                          <div className="mt-1 text-xs text-emerald-300">
                            Tuesday
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            AI CONTROL
        ────────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-6 py-28 lg:px-8 lg:py-36">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <div className="mb-5 text-xs font-medium uppercase tracking-[0.22em] text-emerald-400/80">
                AI, with guardrails
              </div>

              <h2 className="text-4xl font-semibold leading-[1] tracking-[-0.055em] sm:text-5xl">
                Give AI the work.
                <br />
                Keep the control.
              </h2>

              <p className="mt-6 max-w-xl text-base leading-7 text-white/40">
                Haseel is designed to act, not just answer. But important
                financial decisions can remain under your control.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <ControlCard
                title="Auto"
                description="Routine actions can be handled automatically."
                items={[
                  "Create customers",
                  "Create invoices",
                  "Record payments",
                  "Read financial data",
                ]}
              />

              <ControlCard
                active
                title="Approval"
                description="Sensitive actions pause until you approve."
                items={[
                  "Send invoices",
                  "Send reminders",
                  "Create payment plans",
                  "Reverse payments",
                ]}
              />

              <ControlCard
                title="Human only"
                description="Some actions are never delegated to AI."
                items={[
                  "Write-offs",
                  "Delete customers",
                  "Delete invoices",
                ]}
              />
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            FUTURE
        ────────────────────────────────────────────────────────────── */}
        <section
          id="future"
          className="border-y border-white/10 bg-white/[0.015]"
        >
          <div className="mx-auto max-w-7xl px-6 py-28 lg:px-8 lg:py-36">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mb-5 text-xs font-medium uppercase tracking-[0.22em] text-emerald-400/80">
                What comes next
              </div>

              <h2 className="text-4xl font-semibold leading-[1] tracking-[-0.055em] sm:text-5xl">
                Haseel is becoming
                <br />
                an operating system for financial work.
              </h2>

              <p className="mt-6 text-base leading-7 text-white/35">
                The goal is bigger than invoices. Haseel is being built to
                become the intelligent layer between your business, your
                customers and your money.
              </p>
            </div>

            <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: Wallet,
                  title: "Payments",
                  text: "More ways for customers to pay and more automation around collection.",
                },
                {
                  icon: Receipt,
                  title: "Accounting",
                  text: "Financial records, reconciliation and reporting connected to operations.",
                },
                {
                  icon: TrendingUp,
                  title: "Cash flow",
                  text: "Understand what is coming, what is at risk and what needs action.",
                },
                {
                  icon: Bot,
                  title: "AI employees",
                  text: "Specialized AI workers handling different parts of your business.",
                },
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-white/10 bg-[#090c0a] p-6"
                  >
                    <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-400/[0.07]">
                      <Icon className="size-4 text-emerald-400" />
                    </div>

                    <h3 className="mt-5 text-base font-medium">
                      {item.title}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-white/25">
                      {item.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────
            FINAL CTA
        ────────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-6 py-28 lg:px-8 lg:py-36">
          <div className="relative overflow-hidden rounded-[2rem] border border-emerald-400/15 bg-emerald-400/[0.035] px-6 py-16 text-center sm:px-10 lg:py-24">
            <div className="pointer-events-none absolute left-1/2 top-[-10rem] h-[25rem] w-[25rem] -translate-x-1/2 rounded-full bg-emerald-400/[0.09] blur-[100px]" />

            <div className="relative">
              <Sparkles className="mx-auto size-5 text-emerald-400" />

              <h2 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[0.98] tracking-[-0.06em] sm:text-5xl lg:text-6xl">
                Stop managing your financial work manually.
              </h2>

              <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-white/40">
                Start with invoices and collections. Let Haseel take more of
                the work as your business grows.
              </p>

              <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Button
                  asChild
                  size="lg"
                  className="h-12 rounded-full bg-emerald-400 px-8 text-black hover:bg-emerald-300"
                >
                  <Link to={authPath}>
                    {signedIn ? "Open Haseel" : "Start free"}
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>

                <Link
                  to="/auth"
                  className="text-sm text-white/30 transition hover:text-white"
                >
                  Already have an account? Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ──────────────────────────────────────────────────────────────
          FOOTER
      ────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg border border-emerald-400/15 bg-emerald-400/[0.05]">
              <Sparkles className="size-3.5 text-emerald-400" />
            </div>

            <span className="text-sm font-semibold">Haseel</span>
          </div>

          <div className="text-xs text-white/20">
            AI-native financial operations.
          </div>

          <div className="text-xs text-white/20">© 2026 Haseel</div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  items,
}: {
  icon: typeof FileText;
  eyebrow: string;
  title: string;
  description: string;
  items: string[];
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.02] p-7 transition duration-300 hover:-translate-y-1 hover:border-emerald-400/15 hover:bg-emerald-400/[0.025]">
      <div className="flex items-center justify-between">
        <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-400/[0.07]">
          <Icon className="size-4 text-emerald-400" />
        </div>

        <span className="text-[10px] font-medium tracking-[0.2em] text-white/15">
          {eyebrow}
        </span>
      </div>

      <h3 className="mt-7 text-xl font-medium tracking-[-0.03em]">{title}</h3>

      <p className="mt-3 text-sm leading-6 text-white/35">{description}</p>

      <div className="mt-7 space-y-3">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-3 text-sm text-white/50">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ControlCard({
  title,
  description,
  items,
  active = false,
}: {
  title: string;
  description: string;
  items: string[];
  active?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        active
          ? "border-emerald-400/20 bg-emerald-400/[0.04]"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-sm font-medium ${
            active ? "text-emerald-300" : "text-white"
          }`}
        >
          {title}
        </span>

        {active && (
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-emerald-300">
            Recommended
          </span>
        )}
      </div>

      <p className="mt-3 text-xs leading-5 text-white/25">{description}</p>

      <div className="mt-5 space-y-2">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2 text-xs text-white/45">
            <Check
              className={`mt-0.5 size-3.5 ${
                active ? "text-emerald-400" : "text-white/20"
              }`}
            />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
