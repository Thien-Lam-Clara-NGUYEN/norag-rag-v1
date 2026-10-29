import OpenAI from "openai";
import { z } from "zod";
import { AppError } from "./errors";
import { LlmAnswerSchema } from "./schema";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey || !process.env.LLM_MODEL) {
      throw new AppError(500, "internal_error", "The LLM is not configured on the server.");
    }
    client = new OpenAI({
      baseURL: process.env.LLM_BASE_URL || undefined,
      apiKey,
      timeout: 30000,
      maxRetries: 2,
    });
  }
  return client;
}

function mapProviderError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return new AppError(504, "llm_timeout", "The language model took too long to answer.");
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return new AppError(502, "llm_unavailable", "The language model is not reachable.");
  }
  if (err instanceof OpenAI.APIError) {
    if (err.status === 429) {
      return new AppError(429, "rate_limited", "The language model is rate limited. Try again shortly.");
    }
    if (typeof err.status === "number" && err.status >= 500) {
      return new AppError(502, "llm_unavailable", "The language model is temporarily unavailable.");
    }
    console.error(err);
    return new AppError(500, "internal_error", "The language model request was rejected.");
  }
  console.error(err);
  return new AppError(500, "internal_error", "Something went wrong on the server.");
}

function stripFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export async function askModel(system: string, user: string): Promise<string> {
  const useSchema = (process.env.LLM_STRUCTURED_OUTPUT ?? "prompt") === "json_schema";
  const { $schema, ...jsonSchema } = z.toJSONSchema(LlmAnswerSchema) as Record<string, unknown>;
  void $schema;
  try {
    const completion = await getClient().chat.completions.create({
      model: process.env.LLM_MODEL!,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(useSchema
        ? {
            response_format: {
              type: "json_schema" as const,
              json_schema: { name: "rag_answer", strict: true, schema: jsonSchema },
            },
          }
        : {}),
    });
    const choice = completion.choices[0];
    if (choice.finish_reason === "length") {
      throw new AppError(502, "invalid_model_output", "The model answer was cut off.");
    }
    return choice.message.content ?? "";
  } catch (err) {
    throw mapProviderError(err);
  }
}

export function parseAnswer(text: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFence(text));
  } catch {
    return null;
  }
  const parsed = LlmAnswerSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
