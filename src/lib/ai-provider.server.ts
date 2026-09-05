import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * Single place where the AI provider/model is chosen.
 * Swapping provider or model = change env vars, no orchestrator changes.
 */
export const DUELY_MODELS = {
  default: "gpt-5.6-luna",
  reasoning: "gpt-5.6-sol",
  fast: "gpt-4.1-mini",
} as const;

export function getDuelyBaseModelId(
  kind: keyof typeof DUELY_MODELS = "default",
) {
  return DUELY_MODELS[kind];
}

export function getDuelyModelId(
  kind: keyof typeof DUELY_MODELS = "default",
) {
  const override = process.env["DUELY_AI_MODEL"];
  return override || getDuelyBaseModelId(kind);
}

export function getDuelyModel(kind: keyof typeof DUELY_MODELS = "default"): LanguageModel {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("missing_ai_api_key");

  const provider = createOpenAI({ apiKey });
  return provider(getDuelyModelId(kind));
}

export function hasAiProvider() {
  return Boolean(process.env["OPENAI_API_KEY"]);
}
