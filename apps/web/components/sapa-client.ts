/** SAPA adapter for the authenticated SAP v1 assistant endpoint. */
import { apiMutate, getMe, updateSapaPreference } from "../lib/api/client";

export type SapaPageContext =
  | "dashboard" | "scan" | "my_reports" | "areas"
  | "scan_history" | "achievements" | "settings" | "help";
export type SapaSuggestedAction = { label: string; target: SapaPageContext };
export type SapaChatResult = { conversationId: string; reply: string; suggestedActions: SapaSuggestedAction[] };

export async function readSapaAccountPreference(): Promise<boolean> {
  const user = await getMe();
  return user.sapaEnabled;
}

export async function saveSapaAccountPreference(enabled: boolean): Promise<void> {
  const result = await updateSapaPreference(enabled);
  if (result.sapaEnabled !== enabled) throw new Error("Preferensi SAPA belum tersimpan di akun.");
}

export async function sendSapaMessage(message: string, pageContext: SapaPageContext, conversationId: string | null): Promise<SapaChatResult> {
  const result = await apiMutate<SapaChatResult>("POST", "/assistant/chat", { body: { message, pageContext, conversationId } });
  if (!result.reply?.trim() || !result.conversationId || !Array.isArray(result.suggestedActions)) throw new Error("Respons SAPA tidak sesuai kontrak.");
  return result;
}
