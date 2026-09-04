import { defineEventHandler, readBody } from "h3";

export default defineEventHandler(async (event) => {
  const payload = await readBody(event);

  console.log("[WAHA Webhook]", JSON.stringify(payload));

  return {
    status: "ok",
  };
});
