export type SendMessageInput = {
  to: string;
  body: string;
};

export type SendDocumentInput = {
  to: string;
  fileUrl: string;
  fileName?: string;
  body?: string;
};

export type SendMessageResult = {
  success: boolean;
  providerMessageId: string | null;
  status: "sent" | "failed";
  error?: string;
};

export type MessagingProvider = {
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  sendDocument(input: SendDocumentInput): Promise<SendMessageResult>;
};
