import { z } from "zod";
import { LIMITS } from "./limits";

export const operationSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["insert", "delete"]),
  position: z.number().int().min(0).max(LIMITS.MAX_DOCUMENT_CONTENT_LENGTH),
  content: z
    .string()
    .max(LIMITS.MAX_OPERATION_CONTENT_LENGTH)
    .refine(
      (val) => {
        if (val.length === 0) return true;
        return true;
      },
      { message: "Invalid content" }
    ),
  lamportClock: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  clientId: z.string().min(1).max(64),
  timestamp: z.union([
    z.string().min(1).max(50),
    z.number().int().positive(),
  ]),
});

export const syncPushSchema = z.object({
  operations: z
    .array(operationSchema)
    .min(0)
    .max(LIMITS.MAX_OPERATIONS_PER_SYNC),
  lastKnownLamport: z.number().int().min(0).optional(),
});

export const createDocumentSchema = z.object({
  title: z.string().min(1).max(LIMITS.MAX_TITLE_LENGTH).trim(),
});

export const updateDocumentMetaSchema = z.object({
  title: z.string().min(1).max(LIMITS.MAX_TITLE_LENGTH).trim().optional(),
});

export const createVersionSchema = z.object({
  label: z.string().max(LIMITS.MAX_VERSION_LABEL_LENGTH).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["EDITOR", "VIEWER"]),
});

export const registerSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: z.string().email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
});

export const aiRequestSchema = z.object({
  action: z.enum(["summarize", "improve", "continue", "tone"]),
  content: z.string().min(1).max(20_000),
  tone: z.enum(["professional", "casual", "academic"]).optional(),
});

export type OperationInput = z.infer<typeof operationSchema>;
export type SyncPushInput = z.infer<typeof syncPushSchema>;

export function validatePayloadSize(body: string): boolean {
  return body.length <= LIMITS.MAX_SYNC_PAYLOAD_BYTES;
}

export function parseJsonSafely<T>(
  body: string,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  if (!validatePayloadSize(body)) {
    return {
      success: false,
      error: `Payload exceeds ${LIMITS.MAX_SYNC_PAYLOAD_BYTES} bytes`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { success: false, error: "Invalid JSON" };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues.map((i) => i.message).join("; "),
    };
  }

  return { success: true, data: result.data };
}
