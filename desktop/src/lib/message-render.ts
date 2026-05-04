import type { ChatMessage } from "@/stores/chatStore";

export function renderChatMessage(msg: ChatMessage) {
  if (msg.awaitingHuman) {
    return {
      type: "awaiting" as const,
      content: msg.content,
      awaitingHuman: msg.awaitingHuman,
    };
  }
  return {
    type: "plain" as const,
    content: msg.content,
  };
}
