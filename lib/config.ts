import { z } from "zod";

export const SettingsSchema = z.object({
  chunkSize: z.number().int().min(100).max(4000),
  overlapPercent: z.number().int().min(0).max(50),
  topK: z.number().int().min(1).max(20),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  chunkSize: 800,
  overlapPercent: 10,
  topK: 5,
};

export const MIN_SCORE = Number(process.env.MIN_SCORE ?? "0.2");
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_QUESTION_CHARS = 1000;
export const COLLECTION_NAME = "rag_v1";
export const CHROMA_URL = process.env.CHROMA_URL ?? "http://localhost:8000";
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const ALLOWED_EXTENSIONS = [".md", ".txt"];
