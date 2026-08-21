import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Focus = {
  type: "client" | "invoice" | "payment" | "payment_plan";
  id: string;
  summary: string;
} | null;
export type SelectionType = "client" | "invoice" | "payment" | "payment_plan";
export type Selected = {
  type: SelectionType;
  id: string;
  label?: string;
  subtitle?: string;
};

type Ctx = {
  focus: Focus;
  setFocus: (f: Focus) => void;
  selection: Selected[];
  setSelection: (s: Selected[]) => void;
  toggleSelected: (s: Selected) => void;
  page: string;
  setPage: (p: string) => void;
  aiOpen: boolean;
  setAiOpen: (v: boolean) => void;
  prefill: string;
  setPrefill: (v: string) => void;
};

const DuelyContext = createContext<Ctx | null>(null);

export function DuelyProvider({ children }: { children: ReactNode }) {
  const [focus, setFocus] = useState<Focus>(null);
  const [selection, setSelection] = useState<Selected[]>([]);
  const [page, setPage] = useState("dashboard");
  const [aiOpen, setAiOpen] = useState(false);
  const [prefill, setPrefill] = useState("");
  const toggleSelected = (s: Selected) =>
    setSelection((cur) =>
      cur.some((c) => c.id === s.id && c.type === s.type)
        ? cur.filter((c) => !(c.id === s.id && c.type === s.type))
        : [...cur, s],
    );
  const value = useMemo(
    () => ({
      focus,
      setFocus,
      selection,
      setSelection,
      toggleSelected,
      page,
      setPage,
      aiOpen,
      setAiOpen,
      prefill,
      setPrefill,
    }),
    [focus, selection, page, aiOpen, prefill],
  );
  return <DuelyContext.Provider value={value}>{children}</DuelyContext.Provider>;
}

export function useDuely() {
  const ctx = useContext(DuelyContext);
  if (!ctx) throw new Error("useDuely must be used inside DuelyProvider");
  return ctx;
}
