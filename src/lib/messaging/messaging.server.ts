import type {
  MessagingProvider,
  SendDocumentInput,
  SendMessageInput,
  SendMessageResult,
} from "./types";

import { twilioWhatsAppProvider } from "./providers/twilio.server";

const provider: MessagingProvider = twilioWhatsAppProvider;

export function sendMessage(
  input: SendMessageInput,
): Promise<SendMessageResult> {
  return provider.sendMessage(input);
}

export function sendDocument(
  input: SendDocumentInput,
): Promise<SendMessageResult> {
  return provider.sendDocument(input);
}
