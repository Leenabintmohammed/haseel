import type {
  MessagingProvider,
  SendDocumentInput,
  SendMessageInput,
  SendMessageResult,
} from "./types";
import { wahaWhatsAppProvider } from "./providers/waha.server";

const provider: MessagingProvider = wahaWhatsAppProvider;

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
