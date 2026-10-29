import { DEFAULT_SETTINGS, MIN_SCORE } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ settings: DEFAULT_SETTINGS, minScore: MIN_SCORE });
}
