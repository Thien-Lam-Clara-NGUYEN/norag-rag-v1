import { AppError, toResponse } from "@/lib/errors";
import { ask } from "@/lib/rag";
import { AskRequestSchema } from "@/lib/schema";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => {
      throw new AppError(400, "invalid_request", "The request body must be JSON.");
    });
    const parsed = AskRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, "invalid_request", "The question or settings are invalid.");
    }
    return Response.json(await ask(parsed.data));
  } catch (err) {
    return toResponse(err);
  }
}
