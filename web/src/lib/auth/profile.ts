import { z } from "zod";

export const ProfileUpdateSchema = z.object({ nome: z.string().trim().min(2).max(80) }).strict();

export function safeProfile(row: Record<string, unknown>) {
  return { userId: String(row.user_id), nome: String(row.nome), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
