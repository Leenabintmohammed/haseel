import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary-soft text-primary",
  viewed: "bg-primary-soft text-primary",
  partially_paid: "bg-accent-soft text-accent-foreground",
  paid: "bg-success/15 text-success",
  overdue: "bg-destructive/12 text-destructive",
  cancelled: "bg-muted text-muted-foreground line-through",
  awaiting_approval: "bg-accent-soft text-accent-foreground",
  completed: "bg-success/15 text-success",
  rejected: "bg-destructive/12 text-destructive",
  failed: "bg-destructive/12 text-destructive",
  active: "bg-success/15 text-success",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize tracking-tight",
        styles[status] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}