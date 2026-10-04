/** SAPA adapter for the authenticated SAP v1 assistant endpoint. */
import { ApiError, apiMutate, getMe, updateSapaPreference } from "../lib/api/client";

export type SapaPageContext =
  | "dashboard" | "scan" | "my_reports" | "areas"
  | "scan_history" | "achievements" | "settings" | "help";
export type SapaSuggestedAction = { label: string; target: SapaPageContext };
export type SapaCitation = { id: string; title: string; snippet: string; source: string; url: string | null };
export type SapaChatResult = { conversationId: string; reply: string; suggestedActions: SapaSuggestedAction[]; citations: SapaCitation[] };

export async function readSapaAccountPreference(): Promise<boolean> {
  const user = await getMe();
  return user.sapaEnabled;
}

export async function saveSapaAccountPreference(enabled: boolean): Promise<void> {
  const result = await updateSapaPreference(enabled);
  if (result.sapaEnabled !== enabled) throw new Error("Preferensi SAPA belum tersimpan di akun.");
}

export async function sendSapaMessage(message: string, pageContext: SapaPageContext, conversationId: string | null, signal?: AbortSignal): Promise<SapaChatResult> {
  let result: SapaChatResult;
  try {
    result = await apiMutate<SapaChatResult>("POST", "/assistant/chat", { body: { message, pageContext, conversationId }, signal });
  } catch (error) {
    if (error instanceof ApiError && error.status >= 500) {
      throw new ApiError(error.status, error.code, "Chat SAPA sementara tidak tersedia. Coba lagi nanti atau buka Bantuan.", error.fields, error.retryAfter);
    }
    throw error;
  }
  if (!result.reply?.trim() || !result.conversationId || !Array.isArray(result.suggestedActions) || !Array.isArray(result.citations)) throw new Error("Respons SAPA tidak sesuai kontrak.");
  return result;
}
