import { toResponse } from "@/lib/errors";
import { deleteDocument } from "@/lib/rag";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteDocument(id);
    return Response.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}
