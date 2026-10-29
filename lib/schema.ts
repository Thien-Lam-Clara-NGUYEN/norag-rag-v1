import { z } from "zod";
import { MAX_QUESTION_CHARS, SettingsSchema } from "./config";

export const LlmAnswerSchema = z.object({
  status: z.enum(["answered", "no_answer"]),
  answer: z.string().min(1).max(4000),
  cited_chunk_ids: z.array(z.string()).max(20),
});

export type LlmAnswer = z.infer<typeof LlmAnswerSchema>;

export const AskRequestSchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  docIds: z.array(z.string().min(1)).min(1).max(100),
  settings: SettingsSchema,
});

export type AskRequest = z.infer<typeof AskRequestSchema>;

export type Reference = {
  chunkId: string;
  filename: string;
  start: number;
  end: number;
  score: number;
  preview: string;
};

export type AskResponse = {
  status: "answered" | "no_answer";
  answer: string;
  references: Reference[];
  retrieved: { chunkId: string; filename: string; score: number }[];
  promptVersion: string;
};
