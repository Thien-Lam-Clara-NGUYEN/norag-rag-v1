import { promises as fs } from "node:fs";
import path from "node:path";

export type DocRecord = {
  id: string;
  filename: string;
  chars: number;
  chunks: number;
  chunkSize: number;
  overlapPercent: number;
};

const DATA_DIR = path.join(process.cwd(), "data");
const FILES_DIR = path.join(DATA_DIR, "files");
const REGISTRY = path.join(DATA_DIR, "documents.json");

async function ensureDirs(): Promise<void> {
  await fs.mkdir(FILES_DIR, { recursive: true });
}

export async function listDocuments(): Promise<DocRecord[]> {
  try {
    const raw = await fs.readFile(REGISTRY, "utf8");
    return JSON.parse(raw) as DocRecord[];
  } catch {
    return [];
  }
}

async function writeRegistry(records: DocRecord[]): Promise<void> {
  await ensureDirs();
  await fs.writeFile(REGISTRY, JSON.stringify(records, null, 2), "utf8");
}

export async function getDocument(id: string): Promise<DocRecord | null> {
  const all = await listDocuments();
  return all.find((d) => d.id === id) ?? null;
}

export async function saveDocument(record: DocRecord): Promise<void> {
  const all = await listDocuments();
  const next = all.some((d) => d.id === record.id)
    ? all.map((d) => (d.id === record.id ? record : d))
    : [...all, record];
  await writeRegistry(next);
}

export async function removeDocument(id: string): Promise<void> {
  const all = await listDocuments();
  await writeRegistry(all.filter((d) => d.id !== id));
  await fs.rm(path.join(FILES_DIR, `${id}.txt`), { force: true });
}

export async function writeText(id: string, text: string): Promise<void> {
  await ensureDirs();
  await fs.writeFile(path.join(FILES_DIR, `${id}.txt`), text, "utf8");
}

export async function readText(id: string): Promise<string> {
  return fs.readFile(path.join(FILES_DIR, `${id}.txt`), "utf8");
}
