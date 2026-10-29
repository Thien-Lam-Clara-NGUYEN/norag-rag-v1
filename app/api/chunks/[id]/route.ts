import { AppError, toResponse } from "@/lib/errors";
import { getChunk } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const chunk = await getChunk(id);
    if (!chunk) throw new AppError(404, "not_found", "Chunk not found. The document may have been re-indexed.");
    return Response.json({ chunk });
  } catch (err) {
    return toResponse(err);
  }
}
