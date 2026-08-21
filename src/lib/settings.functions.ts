import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasAiProvider, DUELY_MODELS } from "./ai-provider.server";
import { TOOL_AUTONOMY } from "./duely-tools.server";

export type AiWorkspaceStatus = {
  configured: boolean;
  model: string;
  approvalRequiredActions: string[];
  autoActions: string[];
};

// Read-only summary of AI workspace configuration. Never returns API keys or secrets.
export const getAiWorkspaceStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<AiWorkspaceStatus> => {
    const entries = Object.entries(TOOL_AUTONOMY);
    return {
      configured: hasAiProvider(),
      model: DUELY_MODELS.default,
      approvalRequiredActions: entries
        .filter(([, autonomy]) => autonomy === "approval_required")
        .map(([name]) => name),
      autoActions: entries.filter(([, autonomy]) => autonomy === "auto").map(([name]) => name),
    };
  });
