import { DEFAULT_SETTINGS, SettingsSchema } from "@/lib/config";
import { listDocuments } from "@/lib/documents";
import { AppError, toResponse } from "@/lib/errors";
import { addDocument } from "@/lib/rag";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json({ documents: await listDocuments() });
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => {
      throw new AppError(400, "invalid_request", "Expected a multipart form upload.");
    });
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError(400, "invalid_request", "No file was provided.");
    }
    const parsed = SettingsSchema.safeParse({
      chunkSize: Number(form.get("chunkSize") ?? DEFAULT_SETTINGS.chunkSize),
      overlapPercent: Number(form.get("overlapPercent") ?? DEFAULT_SETTINGS.overlapPercent),
      topK: DEFAULT_SETTINGS.topK,
    });
    if (!parsed.success) {
      throw new AppError(400, "invalid_request", "Chunk size or overlap is out of range.");
    }
    const document = await addDocument(file, parsed.data);
    return Response.json({ document }, { status: 201 });
  } catch (err) {
    return toResponse(err);
  }
}
