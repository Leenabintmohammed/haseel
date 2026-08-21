/**
 * POST /api/jobs/process-finance
 *
 * Scheduled finance processing endpoint.
 * Requires SCHEDULED_JOB_SECRET environment variable to be set and passed as Authorization header.
 *
 * Usage:
 * curl -X POST https://your-app.com/api/jobs/process-finance \
 *   -H "Authorization: Bearer YOUR_SCHEDULED_JOB_SECRET" \
 *   -H "Content-Type: application/json" \
 *   -d '{"owner_id": "optional-user-id"}'
 *
 * Schedule with:
 * - Cloudflare Cron Triggers (Free plan: 10/day, Paid: unlimited)
 * - External service (EasyCron, GitHub Actions, AWS Lambda, etc.)
 * - GitHub Actions workflow_dispatch or schedule
 * - Your own cron infrastructure
 */

import { defineEventHandler, getHeader, readBody, setResponseStatus } from "h3";
import { createClient } from "@supabase/supabase-js";
import { processFinanceForOwner, processFinanceForAllOwners } from "@/lib/scheduled-jobs.server";

import type { H3Event } from "h3";

export default defineEventHandler(async (event: H3Event) => {
  try {
    // Verify authorization
    const authHeader = getHeader(event, "authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const expectedToken = process.env["SCHEDULED_JOB_SECRET"];

    if (!expectedToken) {
      console.warn("[ScheduledJob] SCHEDULED_JOB_SECRET not configured");
      return {
        status: "error",
        message: "Server not configured for scheduled jobs",
        code: "not_configured",
      };
    }

    if (!token || token !== expectedToken) {
      console.warn("[ScheduledJob] Invalid authorization token");
      return {
        status: "error",
        message: "Unauthorized",
        code: "unauthorized",
      };
    }

    // Parse optional request body
    let ownerIdFilter: string | undefined;
    try {
      const body = await readBody(event);
      if (body && typeof body === "object" && "owner_id" in body && typeof body.owner_id === "string") {
        ownerIdFilter = body.owner_id;
      }
    } catch {
      // No body or invalid JSON, continue without filter
    }

    // Initialize Supabase client (service role for multi-owner access)
    const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] || process.env["VITE_PUBLIC_SUPABASE_URL"];
    const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[ScheduledJob] Missing Supabase credentials");
      return {
        status: "error",
        message: "Server misconfigured",
        code: "missing_config",
      };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Execute job
    let result;
    if (ownerIdFilter) {
      result = await processFinanceForOwner({ supabase, userId: ownerIdFilter }, ownerIdFilter);
    } else {
      result = await processFinanceForAllOwners({ supabase });
    }

    // Return result with appropriate status code
    const statusCode = result.success ? 200 : 500;
    setResponseStatus(event, statusCode);

    return {
      status: result.success ? "success" : "error",
      ...result,
    };
  } catch (error) {
    console.error("[ScheduledJob] Unexpected error:", error);
    setResponseStatus(event, 500);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
      code: "internal_error",
    };
  }
});
