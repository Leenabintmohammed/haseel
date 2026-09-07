import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileText,
  Landmark,
  MessageSquare,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Workflow,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Haseel — Your AI Financial Employee",
      },
      {
        name: "description",
        content:
          "Haseel is an AI-native financial operations platform for businesses. Manage customers, invoices, payments, collections, payment plans, reminders and financial workflows from one intelligent workspace.",
      },
      {
        property: "og:title",
        content: "Haseel — Your AI Financial Employee",
      },
      {
        property: "og:description",
        content:
          "The first release of Haseel brings invoices, payments, collections, customer memory, payment plans, reminders, WhatsApp and AI financial operations into one system.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setIsAuthenticated(Boolean(data.session));
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setIsAuthenticated(Boolean(session));
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const primaryHref = isAuthenticated ? "/dashboard" : "/auth";

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#07110d] text-white selection:bg-emerald-300/20 selection:text-emerald-100">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-16rem] top-[-10rem] h-[34rem] w-[34rem] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute right-[-12rem] top-[16rem] h-[32rem] w-[32rem] rounded-full bg-cyan-500/8 blur-[120px]" />
        <div className="absolute bottom-[-12rem] left-[24%] h-[30rem] w-[30rem] rounded-full bg-lime-500/6 blur-[120px]" />
      </div>

      <Header primaryHref={primaryHref} />

      <section className="relative">
        <div className="mx-auto max-w-7xl px-6 pb-20 pt-14 sm:px-10 sm:pb-28 sm:pt-20 lg:px-12 lg:pt-28">
          <div className="grid items-center gap-14 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16">
            <div>
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/8 px-3.5 py-2 text-xs font-medium tracking-wide text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                Haseel V1 — The first release
              </div>

              <h1 className="max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-[5.25rem]">
                Your business has
                <span className="block text-emerald-300">
                  a financial employee.
                </span>
              </h1>

              <p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-300 sm:text-xl">
                Haseel is an AI-native financial operations platform that helps
                you manage customers, invoices, payments, collections and
                everyday financial workflows from one intelligent system.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link to={primaryHref}>
                  <Button className="h-12 rounded-xl bg-emerald-400 px-6 text-sm font-semibold text-[#07110d] transition hover:bg-emerald-300">
                    Start with Haseel V1
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>

                <a
                  href="#how-it-works"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-6 text-sm font-medium text-white transition hover:bg-white/[0.06]"
                >
                  See how it works
                  <ChevronRight className="ml-2 h-4 w-4 text-zinc-400" />
                </a>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-zinc-400">
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-300" />
                  Built for small businesses
                </span>
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-300" />
                  AI-native from the start
                </span>
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-300" />
                  WhatsApp-ready
                </span>
              </div>
            </div>

            <HeroProductMockup />
          </div>
        </div>
      </section>

      <TrustBar />

      <section className="border-y border-white/6 bg-[#091610]">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-10 lg:px-12">
          <div className="grid gap-16 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <SectionEyebrow>Why Haseel</SectionEyebrow>
              <h2 className="mt-5 max-w-xl text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">
                Accounting tells you what happened.
                <span className="block text-emerald-300">
                  Haseel helps you act.
                </span>
              </h2>
              <p className="mt-6 max-w-lg text-base leading-7 text-zinc-400">
                Most financial software is built around recording transactions.
                Haseel is built around operating the business around those
                transactions.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ProblemCard
                icon={Receipt}
                title="Invoices"
                text="Create, calculate, send and track invoices without moving between disconnected tools."
              />
              <ProblemCard
                icon={CircleDollarSign}
                title="Payments"
                text="Know what has been paid, what remains outstanding and what changed."
              />
              <ProblemCard
                icon={MessageSquare}
                title="Collections"
                text="Follow up with customers through timely reminders instead of manually chasing every payment."
              />
              <ProblemCard
                icon={Bot}
                title="AI operations"
                text="Ask Haseel to understand the business and perform supported financial actions for you."
              />
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-10 lg:px-12 lg:py-28">
          <div className="max-w-3xl">
            <SectionEyebrow>How Haseel works</SectionEyebrow>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
              From a conversation to a financial action.
            </h2>
            <p className="mt-6 text-lg leading-8 text-zinc-400">
              Haseel combines financial data, business rules, customer context
              and AI tools into one operating loop.
            </p>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StepCard
              number="01"
              icon={MessageSquare}
              title="Tell"
              text="Ask Haseel what you need in natural language."
              example={`"Show me all overdue invoices."`}
            />
            <StepCard
              number="02"
              icon={Workflow}
              title="Understand"
              text="Haseel reads the relevant financial and customer context."
              example="7 invoices • AED 84,500 outstanding"
            />
            <StepCard
              number="03"
              icon={Zap}
              title="Act"
              text="It performs supported actions according to your company rules."
              example="Prepare 4 customer follow-ups"
            />
            <StepCard
              number="04"
              icon={ShieldCheck}
              title="Control"
              text="Sensitive actions can require your approval before execution."
              example="Send reminders? Review & approve"
            />
          </div>
        </div>
      </section>

      <section className="border-y border-white/6 bg-[#0a1610]">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-10 lg:px-12 lg:py-28">
          <div className="flex max-w-3xl flex-col gap-5">
            <SectionEyebrow>Inside Haseel V1</SectionEyebrow>
            <h2 className="text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
              One financial operating layer.
            </h2>
            <p className="text-lg leading-8 text-zinc-400">
              V1 focuses on the core operational problems that happen between
              creating an invoice and actually getting paid.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <FeatureCard
              icon={Users}
              title="Customer management"
              text="Keep customer profiles, contact details, preferences and financial context together."
              items={[
                "Customer profiles",
                "Customer history",
                "Preferred language",
                "Customer memory",
              ]}
            />

            <FeatureCard
              icon={FileText}
              title="Invoices"
              text="Create and manage invoices with real financial calculations and lifecycle states."
              items={[
                "Invoice creation",
                "Line items & tax",
                "Invoice status",
                "PDF invoices",
              ]}
            />

            <FeatureCard
              icon={Wallet}
              title="Payments"
              text="Track payments and balances accurately across your invoices."
              items={[
                "Payment recording",
                "Outstanding balances",
                "Payment history",
                "Payment reversals",
              ]}
            />

            <FeatureCard
              icon={CircleDollarSign}
              title="Payment plans"
              text="Manage structured installment arrangements when customers cannot pay everything at once."
              items={[
                "Installment schedules",
                "Payment allocation",
                "Plan tracking",
                "Pause / resume flows",
              ]}
            />

            <FeatureCard
              icon={Clock3}
              title="Collections & reminders"
              text="Turn overdue follow-up into a structured financial workflow."
              items={[
                "Automated reminders",
                "Overdue tracking",
                "Reminder stages",
                "Timezone-aware scheduling",
              ]}
            />

            <FeatureCard
              icon={TrendingUp}
              title="Financial intelligence"
              text="See the financial health of the business and the behavior of your customers."
              items={[
                "Risk scoring",
                "Customer financial summaries",
                "Dashboard analytics",
                "Action history",
              ]}
            />

            <FeatureCard
              icon={MessageSquare}
              title="WhatsApp"
              text="Bring financial communication into the channel customers already use."
              items={[
                "Invoice delivery",
                "Customer follow-up",
                "WhatsApp messaging",
                "Customer conversations",
              ]}
            />

            <FeatureCard
              icon={Bot}
              title="Customer AI"
              text="Give customers a conversational way to understand their invoices and financial status."
              items={[
                "Invoice questions",
                "Outstanding balance",
                "Payment-plan context",
                "Customer-specific context",
              ]}
            />

            <FeatureCard
              icon={FileCheck2}
              title="AI actions & approvals"
              text="Let AI operate the business while keeping high-impact actions under your control."
              items={[
                "AI financial tools",
                "Approval workflows",
                "Action audit trail",
                "State validation",
              ]}
            />
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-10 lg:px-12 lg:py-28">
          <div className="grid items-center gap-14 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <SectionEyebrow>AI financial employee</SectionEyebrow>
              <h2 className="mt-5 max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl">
                Not just a chatbot.
                <span className="block text-emerald-300">
                  A system that can actually do the work.
                </span>
              </h2>

              <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-400">
                Haseel connects AI to real financial operations. It can
                understand business context, use financial tools, follow
                company policies and execute supported actions.
              </p>

              <div className="mt-8 space-y-4">
                <CapabilityRow
                  title="Understands"
                  text="Customers, invoices, payments, overdue balances, payment plans and business policies."
                />
                <CapabilityRow
                  title="Decides"
                  text="Uses context, rules and action permissions to determine the appropriate next step."
                />
                <CapabilityRow
                  title="Acts"
                  text="Creates, records, updates, sends and manages supported financial operations."
                />
                <CapabilityRow
                  title="Remembers"
                  text="Retains customer-level financial memory and operational history."
                />
              </div>
            </div>

            <AIConversationMockup />
          </div>
        </div>
      </section>

      <section className="border-y border-white/6 bg-[#091610]">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-10 lg:px-12 lg:py-28">
          <div className="grid gap-14 lg:grid-cols-[0.82fr_1.18fr]">
            <div>
              <SectionEyebrow>Built for control</SectionEyebrow>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
                AI should work for you.
                <span className="block text-emerald-300">
                  Not around you.
                </span>
              </h2>
              <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-400">
                Haseel separates routine operations from actions that deserve
                human oversight.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <ControlCard
                label="AUTO"
                title="Routine work"
                text="Low-risk supported actions can run automatically."
                examples={[
                  "Create records",
                  "Calculate balances",
                  "Save customer memory",
                  "Prepare financial summaries",
                ]}
              />

              <ControlCard
                label="APPROVAL"
                title="Review first"
                text="Important external or financial actions can wait for your approval."
                examples={[
                  "Send invoice",
                  "Send reminder",
                  "Create payment plan",
                  "Reverse payment",
                ]}
                featured
              />

              <ControlCard
                label="HUMAN ONLY"
                title="Stay human"
                text="High-impact actions remain outside autonomous execution."
                examples={[
                  "Write-offs",
                  "Destructive actions",
                  "Sensitive financial decisions",
                  "Other restricted operations",
                ]}
              />
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-10 lg:px-12 lg:py-28">
          <div className="grid overflow-hidden rounded-3xl border border-emerald-400/10 bg-gradient-to-br from-[#102219] via-[#0b1812] to-[#08100c] shadow-2xl shadow-black/20 lg:grid-cols-[0.86fr_1.14fr]">
            <div className="p-8 sm:p-10 lg:p-12">
              <SectionEyebrow>WhatsApp + customer AI</SectionEyebrow>

              <h2 className="mt-5 max-w-xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Financial operations where the customer already is.
              </h2>

              <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-400">
                Haseel V1 brings invoice delivery and financial follow-up into
                WhatsApp, while keeping the business logic and financial record
                inside Haseel.
              </p>

              <div className="mt-9 space-y-4">
                <MiniBullet text="Send invoices through WhatsApp" />
                <MiniBullet text="Follow up on overdue payments" />
                <MiniBullet text="Receive customer replies" />
                <MiniBullet text="Record payment promises" />
                <MiniBullet text="Maintain customer financial context" />
              </div>
            </div>

            <WhatsAppMockup />
          </div>
        </div>
      </section>

      <section className="border-y border-white/6 bg-[#091610]">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-10 lg:px-12 lg:py-28">
          <div className="max-w-3xl">
            <SectionEyebrow>The first version</SectionEyebrow>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Haseel V1 is the beginning, not the final product.
            </h2>
            <p className="mt-6 text-lg leading-8 text-zinc-400">
              We are starting with the financial operating layer: the systems
              and workflows that sit between customers, invoices, payments and
              collections.
            </p>
          </div>

          <div className="mt-14 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-7 sm:p-9">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Available in V1</div>
                  <div className="text-xs text-zinc-500">
                    The operating foundation
                  </div>
                </div>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  "Customer management",
                  "Customer memory",
                  "Invoice creation & tracking",
                  "PDF invoices",
                  "Payment recording",
                  "Payment balances",
                  "Payment plans & installments",
                  "Payment promises",
                  "Automated reminders",
                  "WhatsApp invoice delivery",
                  "Customer AI",
                  "Risk intelligence",
                  "AI financial actions",
                  "Approval workflows",
                  "Audit & action history",
                  "Dashboard analytics",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-xl border border-white/6 bg-black/10 px-4 py-3 text-sm text-zinc-300"
                  >
                    <Check className="h-4 w-4 shrink-0 text-emerald-300" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/8 bg-gradient-to-b from-white/[0.035] to-white/[0.015] p-7 sm:p-9">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/6 text-zinc-300">
                  <ArrowDownRight className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Coming next</div>
                  <div className="text-xs text-zinc-500">
                    The broader financial operating system
                  </div>
                </div>
              </div>

              <div className="mt-8 space-y-3">
                <FutureRow
                  icon={Landmark}
                  title="Banking connectivity"
                  text="Connect Haseel to more of the financial infrastructure."
                />
                <FutureRow
                  icon={CircleDollarSign}
                  title="Payments & collection infrastructure"
                  text="Move closer to the actual movement of money."
                />
                <FutureRow
                  icon={BarChart3}
                  title="Cash-flow intelligence"
                  text="Turn financial data into forward-looking decisions."
                />
                <FutureRow
                  icon={FileCheck2}
                  title="Accounting & tax workflows"
                  text="Reduce the operational gap between finance and compliance."
                />
                <FutureRow
                  icon={TrendingUp}
                  title="Financing"
                  text="Connect eligible businesses and receivables to financing pathways."
                />
                <FutureRow
                  icon={Bot}
                  title="AI financial teams"
                  text="Move from one AI employee to specialized financial agents."
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-10 lg:px-12 lg:py-32">
          <div className="relative overflow-hidden rounded-[2rem] border border-emerald-400/10 bg-gradient-to-br from-emerald-500/[0.12] via-white/[0.025] to-transparent p-8 sm:p-12 lg:p-16">
            <div className="pointer-events-none absolute right-[-8rem] top-[-8rem] h-72 w-72 rounded-full bg-emerald-400/10 blur-[80px]" />

            <div className="relative max-w-4xl">
              <div className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
                Haseel V1
              </div>

              <h2 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                From invoices to financial operations.
              </h2>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
                Haseel is building the financial operating system for modern
                small businesses and freelancers — starting with the work that
                happens every day between a customer, an invoice and a payment.
              </p>

              <div className="mt-9">
                <Link to={primaryHref}>
                  <Button className="h-12 rounded-xl bg-emerald-400 px-6 text-sm font-semibold text-[#07110d] hover:bg-emerald-300">
                    Explore Haseel
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 text-sm text-zinc-500 sm:px-10 md:flex-row md:items-center md:justify-between lg:px-12">
          <div>
            <div className="font-semibold text-zinc-200">Haseel</div>
            <div className="mt-1">
              AI-native financial operations for modern businesses.
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link className="transition hover:text-white" to="/dashboard">
              Dashboard
            </Link>
            <Link className="transition hover:text-white" to="/clients">
              Clients
            </Link>
            <Link className="transition hover:text-white" to="/invoices">
              Invoices
            </Link>
            <Link className="transition hover:text-white" to="/payments">
              Payments
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Header({ primaryHref }: { primaryHref: "/auth" | "/dashboard" }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/6 bg-[#07110d]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-6 sm:px-10 lg:px-12">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400 text-[#07110d]">
            <CircleDollarSign className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight">Haseel</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Financial AI
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-zinc-400 md:flex">
          <a className="transition hover:text-white" href="#how-it-works">
            How it works
          </a>
          <a className="transition hover:text-white" href="#product">
            Product
          </a>
          <a className="transition hover:text-white" href="#v1">
            V1
          </a>
          <Link className="transition hover:text-white" to="/auth">
            Sign in
          </Link>
        </nav>

        <Link to={primaryHref}>
          <Button className="h-10 rounded-lg bg-white px-4 text-sm font-semibold text-[#07110d] hover:bg-zinc-200">
            {primaryHref === "/dashboard" ? "Open Haseel" : "Start free"}
          </Button>
        </Link>
      </div>
    </header>
  );
}

function HeroProductMockup() {
  return (
    <div className="relative">
      <div className="absolute inset-x-8 top-8 h-full rounded-[2rem] bg-emerald-400/10 blur-3xl" />

      <div className="relative overflow-hidden rounded-[1.8rem] border border-white/10 bg-[#0b1711] shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between border-b border-white/7 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
          </div>
          <div className="rounded-lg border border-white/7 bg-white/[0.02] px-3 py-1.5 text-[10px] text-zinc-500">
            app.haseel.ai
          </div>
          <div className="w-16" />
        </div>

        <div className="grid min-h-[510px] grid-cols-[72px_1fr] sm:grid-cols-[150px_1fr]">
          <div className="border-r border-white/7 bg-white/[0.015] p-3 sm:p-4">
            <div className="mb-6 flex h-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
              <CircleDollarSign className="h-4 w-4" />
            </div>

            <div className="space-y-2">
              {[
                ["Dashboard", BarChart3],
                ["Clients", Users],
                ["Invoices", FileText],
                ["Payments", Wallet],
                ["AI", Bot],
              ].map(([label, Icon]) => {
                const I = Icon as typeof BarChart3;

                return (
                  <div
                    key={String(label)}
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 text-[11px] ${
                      label === "Dashboard"
                        ? "bg-white/6 text-white"
                        : "text-zinc-600"
                    }`}
                  >
                    <I className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden sm:block">{String(label)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                  Monday · 09:32
                </div>
                <div className="mt-2 text-lg font-semibold text-white sm:text-xl">
                  Good morning.
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  Here is what needs your attention.
                </div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
                <Bot className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <MetricCard label="Outstanding" value="AED 84.5k" />
              <MetricCard label="Overdue" value="AED 26.8k" />
              <MetricCard label="Customers" value="128" />
            </div>

            <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
                Haseel AI
              </div>

              <p className="mt-3 text-sm leading-6 text-zinc-300">
                I found{" "}
                <span className="font-semibold text-white">7 overdue invoices</span>{" "}
                totaling{" "}
                <span className="font-semibold text-white">AED 26,800</span>.
              </p>

              <div className="mt-4 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.05] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-zinc-200">
                      Suggested action
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      Prepare reminders for 4 customers
                    </div>
                  </div>
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-300">
                    Approval
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-zinc-300">
                  Recent activity
                </div>
                <div className="text-[10px] text-zinc-600">View all</div>
              </div>

              <div className="mt-3 space-y-2">
                {[
                  "Payment recorded · AED 4,500",
                  "Invoice H-1048 sent on WhatsApp",
                  "Customer promise saved · Tuesday",
                ].map((text) => (
                  <div
                    key={text}
                    className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-2 text-[11px] text-zinc-500"
                  >
                    <Check className="h-3 w-3 text-emerald-300" />
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AIConversationMockup() {
  return (
    <div className="relative">
      <div className="rounded-[1.8rem] border border-white/8 bg-[#0b1711] p-4 shadow-[0_30px_100px_rgba(0,0,0,0.32)] sm:p-5">
        <div className="flex items-center justify-between border-b border-white/7 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Haseel AI</div>
              <div className="mt-0.5 text-xs text-zinc-600">
                Financial operations
              </div>
            </div>
          </div>

          <div className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.05] px-2.5 py-1 text-[10px] font-medium text-emerald-300">
            Online
          </div>
        </div>

        <div className="space-y-4 py-5">
          <ChatBubble
            role="you"
            text="Show me overdue invoices and tell me who needs a follow-up."
          />

          <ChatBubble
            role="haseel"
            text="I found 7 overdue invoices totaling AED 26,800."
          />

          <div className="rounded-2xl border border-white/7 bg-white/[0.025] p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-300" />
              <span className="text-xs font-medium text-zinc-300">
                Customer risk summary
              </span>
            </div>

            <div className="mt-4 space-y-2">
              <SummaryLine label="Low risk" value="4" />
              <SummaryLine label="Medium risk" value="2" />
              <SummaryLine label="High risk" value="1" />
            </div>
          </div>

          <ChatBubble
            role="haseel"
            text="I prepared reminders for 4 customers. Sending them requires your approval."
          />

          <ChatBubble
            role="you"
            text="Approve."
          />

          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.045] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-emerald-100">
                  4 reminders sent
                </div>
                <div className="mt-1 text-[11px] leading-5 text-zinc-500">
                  Action recorded in Haseel activity history.
                </div>
              </div>
              <Check className="h-5 w-5 text-emerald-300" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/7 bg-black/10 px-4 py-3 text-xs text-zinc-600">
          Ask Haseel anything about your financial operations…
        </div>
      </div>
    </div>
  );
}

function WhatsAppMockup() {
  return (
    <div className="flex min-h-full items-center justify-center border-t border-white/7 bg-black/10 p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-white/8 bg-[#0b1711] shadow-[0_25px_80px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between border-b border-white/7 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-semibold">Haseel</div>
              <div className="text-[10px] text-zinc-600">WhatsApp</div>
            </div>
          </div>
          <div className="text-[10px] text-zinc-600">09:41</div>
        </div>

        <div className="space-y-3 bg-[#09130e] p-4">
          <div className="ml-auto max-w-[82%] rounded-2xl rounded-tr-md bg-emerald-400 px-4 py-3 text-xs leading-5 text-[#07110d]">
            I received the invoice. Can I pay on Tuesday?
          </div>

          <div className="max-w-[84%] rounded-2xl rounded-tl-md border border-white/7 bg-white/[0.04] px-4 py-3 text-xs leading-5 text-zinc-300">
            Yes. I can record Tuesday as your payment promise.
          </div>

          <div className="ml-auto max-w-[82%] rounded-2xl rounded-tr-md bg-emerald-400 px-4 py-3 text-xs leading-5 text-[#07110d]">
            Please do that.
          </div>

          <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-emerald-400/10 bg-emerald-400/[0.04] px-4 py-3">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
              <Check className="h-3 w-3" />
              Haseel action
            </div>

            <div className="mt-2 text-xs leading-5 text-zinc-300">
              Payment promise saved for Tuesday.
            </div>
          </div>

          <div className="rounded-xl border border-white/7 bg-white/[0.02] p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">
              Customer memory
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              Customer prefers structured payment dates.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProblemCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Receipt;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/7 bg-white/[0.02] p-6 transition hover:border-white/12 hover:bg-white/[0.03]">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-5 text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{text}</p>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  text,
  items,
}: {
  icon: typeof Users;
  title: string;
  text: string;
  items: string[];
}) {
  return (
    <div className="rounded-3xl border border-white/7 bg-white/[0.02] p-6 sm:p-7">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
        <Icon className="h-5 w-5" />
      </div>

      <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{text}</p>

      <div className="mt-6 space-y-2.5">
        {items.map((item) => (
          <div
            key={item}
            className="flex items-center gap-2 text-sm text-zinc-400"
          >
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-300/80" />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepCard({
  number,
  icon: Icon,
  title,
  text,
  example,
}: {
  number: string;
  icon: typeof MessageSquare;
  title: string;
  text: string;
  example: string;
}) {
  return (
    <div className="relative rounded-3xl border border-white/7 bg-white/[0.02] p-6 sm:p-7">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-zinc-300">
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-xs font-medium tracking-[0.18em] text-zinc-700">
          {number}
        </div>
      </div>

      <h3 className="mt-6 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{text}</p>

      <div className="mt-6 rounded-xl border border-white/6 bg-black/10 px-3 py-2.5 text-xs leading-5 text-zinc-400">
        {example}
      </div>
    </div>
  );
}

function ControlCard({
  label,
  title,
  text,
  examples,
  featured = false,
}: {
  label: string;
  title: string;
  text: string;
  examples: string[];
  featured?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-6 ${
        featured
          ? "border-emerald-400/20 bg-emerald-400/[0.055]"
          : "border-white/7 bg-white/[0.02]"
      }`}
    >
      <div
        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] ${
          featured
            ? "bg-emerald-400/10 text-emerald-300"
            : "bg-white/5 text-zinc-500"
        }`}
      >
        {label}
      </div>

      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{text}</p>

      <div className="mt-6 space-y-2.5">
        {examples.map((example) => (
          <div
            key={example}
            className="flex items-start gap-2 text-xs leading-5 text-zinc-400"
          >
            <Check
              className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                featured ? "text-emerald-300" : "text-zinc-600"
              }`}
            />
            {example}
          </div>
        ))}
      </div>
    </div>
  );
}

function CapabilityRow({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-4 border-b border-white/6 pb-4">
      <div className="w-20 shrink-0 text-sm font-semibold text-emerald-300">
        {title}
      </div>
      <div className="text-sm leading-6 text-zinc-500">{text}</div>
    </div>
  );
}

function ChatBubble({
  role,
  text,
}: {
  role: "you" | "haseel";
  text: string;
}) {
  const isYou = role === "you";

  return (
    <div
      className={`flex ${
        isYou ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${
          isYou
            ? "rounded-tr-md bg-emerald-400 text-[#07110d]"
            : "rounded-tl-md border border-white/7 bg-white/[0.035] text-zinc-300"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function SummaryLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-zinc-300">{value}</span>
    </div>
  );
}

function MiniBullet({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-zinc-300">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
        <Check className="h-3.5 w-3.5" />
      </div>
      {text}
    </div>
  );
}

function FutureRow({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Landmark;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-zinc-400">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-medium text-zinc-300">{title}</div>
          <div className="mt-1 text-xs leading-5 text-zinc-600">{text}</div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/7 bg-white/[0.02] p-3">
      <div className="text-[9px] uppercase tracking-[0.15em] text-zinc-600">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
      {children}
    </div>
  );
}
