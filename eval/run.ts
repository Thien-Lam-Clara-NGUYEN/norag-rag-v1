import { promises as fs } from "node:fs";
import path from "node:path";

type Row = {
  id: string;
  tags: string[];
  answerable: boolean;
  hit: boolean;
  rank: number | null;
  abstained: boolean;
  topScore: number | null;
};

type Question = {
  id: string;
  question: string;
  doc: string;
  expected_answer: string;
  char_start: number | null;
  char_end: number | null;
  tags: string[];
};

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    void 0;
  }
  const { DEFAULT_SETTINGS, MIN_SCORE } = await import("../lib/config");
  const { listDocuments } = await import("../lib/documents");
  const { retrieve } = await import("../lib/rag");

  const settings = {
    chunkSize: arg("chunk", DEFAULT_SETTINGS.chunkSize),
    overlapPercent: arg("overlap", DEFAULT_SETTINGS.overlapPercent),
    topK: arg("k", DEFAULT_SETTINGS.topK),
  };

  const questions: Question[] = JSON.parse(await fs.readFile(path.join("eval", "questions.json"), "utf8"));
  if (questions.length === 0) {
    console.error("eval/questions.json is empty.");
    process.exit(1);
  }

  const docs = await listDocuments();
  const byName = new Map(docs.map((d) => [d.filename, d.id]));
  const missing = [...new Set(questions.map((q) => q.doc))].filter((n) => !byName.has(n));
  if (missing.length > 0) {
    console.error(`Documents not uploaded: ${missing.join(", ")}`);
    process.exit(1);
  }

  const allIds = docs.map((d) => d.id);
  const rows: Row[] = [];
  for (const q of questions) {
    const hits = await retrieve(q.question, allIds, settings);
    const answerable = q.char_start !== null && q.char_end !== null;
    const relevant = hits.filter((h) => h.score >= MIN_SCORE);
    const docId = byName.get(q.doc)!;
    let hit = false;
    let rank: number | null = null;
    if (answerable) {
      const position = hits.findIndex(
        (h) => h.docId === docId && h.start < (q.char_end as number) && h.end > (q.char_start as number),
      );
      hit = position >= 0;
      rank = hit ? position + 1 : null;
    }
    rows.push({
      id: q.id,
      tags: q.tags,
      answerable,
      hit,
      rank,
      abstained: relevant.length === 0,
      topScore: hits[0]?.score ?? null,
    });
  }

  const summarize = (subset: Row[]) => {
    const answerable = subset.filter((r) => r.answerable);
    const unanswerable = subset.filter((r) => !r.answerable);
    return {
      questions: subset.length,
      hitAtK: answerable.length ? answerable.filter((r) => r.hit).length / answerable.length : null,
      abstainRate: unanswerable.length ? unanswerable.filter((r) => r.abstained).length / unanswerable.length : null,
    };
  };

  const tags = [...new Set(rows.flatMap((r) => r.tags))];
  const summary = {
    settings,
    minScore: MIN_SCORE,
    overall: summarize(rows),
    byTag: Object.fromEntries(tags.map((t) => [t, summarize(rows.filter((r) => r.tags.includes(t)))])),
  };

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const file = path.join("eval", "runs", `${stamp}-${settings.chunkSize}-${settings.overlapPercent}-${settings.topK}.json`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ summary, rows }, null, 2), "utf8");

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Saved ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
