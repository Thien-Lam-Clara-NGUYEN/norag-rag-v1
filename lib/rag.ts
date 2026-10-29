import { randomUUID } from "node:crypto";
import path from "node:path";
import { chunkText } from "./chunker";
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES, MIN_SCORE, type Settings } from "./config";
import {
  getDocument,
  listDocuments,
  readText,
  removeDocument,
  saveDocument,
  writeText,
  type DocRecord,
} from "./documents";
import { embed } from "./embedder";
import { AppError } from "./errors";
import { askModel, parseAnswer } from "./llm";
import { buildUserMessage, PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt";
import type { AskRequest, AskResponse, Reference } from "./schema";
import { addChunks, deleteDocumentChunks, queryChunks, type Hit } from "./store";

async function indexDocument(record: DocRecord, text: string, settings: Settings): Promise<DocRecord> {
  const chunks = chunkText(text, settings.chunkSize, settings.overlapPercent);
  if (chunks.length === 0) {
    throw new AppError(400, "empty_document", "The document has no text to index.");
  }
  const vectors = await embed(chunks.map((c) => c.text));
  await deleteDocumentChunks(record.id);
  await addChunks(
    chunks.map((c, i) => ({
      id: `${record.id}_${c.index}`,
      text: c.text,
      vector: vectors[i],
      docId: record.id,
      filename: record.filename,
      index: c.index,
      start: c.start,
      end: c.end,
      chunkSize: settings.chunkSize,
      overlapPercent: settings.overlapPercent,
    })),
  );
  const next: DocRecord = {
    ...record,
    chars: text.length,
    chunks: chunks.length,
    chunkSize: settings.chunkSize,
    overlapPercent: settings.overlapPercent,
  };
  await saveDocument(next);
  return next;
}

export async function addDocument(file: File, settings: Settings): Promise<DocRecord> {
  const filename = path.basename(file.name);
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new AppError(400, "unsupported_file", "Only .md and .txt files are supported.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AppError(400, "file_too_large", "The file is larger than 2 MB.");
  }
  const text = (await file.text()).replace(/\r\n/g, "\n");
  console.error(text);
  if (text.includes("\u0000") || text.trim().length === 0) {
    throw new AppError(400, "invalid_file", "The file is empty or is not plain text.");
  }
  const id = randomUUID();
  const record: DocRecord = {
    id,
    filename,
    chars: text.length,
    chunks: 0,
    chunkSize: settings.chunkSize,
    overlapPercent: settings.overlapPercent,
  };
  await writeText(id, text);
  try {
    return await indexDocument(record, text, settings);
  } catch (err) {
    await removeDocument(id);
    await deleteDocumentChunks(id).catch(() => undefined);
    throw err;
  }
}

export async function deleteDocument(id: string): Promise<void> {
  const record = await getDocument(id);
  if (!record) throw new AppError(404, "not_found", "Document not found.");
  await deleteDocumentChunks(id);
  await removeDocument(id);
}

export async function ensureIndexed(docIds: string[], settings: Settings): Promise<DocRecord[]> {
  const records: DocRecord[] = [];
  for (const id of docIds) {
    const record = await getDocument(id);
    if (!record) throw new AppError(404, "not_found", "A selected document no longer exists.");
    if (record.chunkSize !== settings.chunkSize || record.overlapPercent !== settings.overlapPercent) {
      const text = await readText(id);
      records.push(await indexDocument(record, text, settings));
    } else {
      records.push(record);
    }
  }
  return records;
}

export async function retrieve(question: string, docIds: string[], settings: Settings): Promise<Hit[]> {
  await ensureIndexed(docIds, settings);
  const [vector] = await embed([question]);
  return queryChunks(vector, docIds, settings.topK);
}

export async function ask(request: AskRequest): Promise<AskResponse> {
  const known = new Set((await listDocuments()).map((d) => d.id));
  const docIds = request.docIds.filter((id) => known.has(id));
  if (docIds.length === 0) {
    throw new AppError(400, "no_documents", "Select at least one document to ask against.");
  }

  const hits = await retrieve(request.question, docIds, request.settings);
  const retrieved = hits.map((h) => ({ chunkId: h.id, filename: h.filename, score: h.score }));
  const relevant = hits.filter((h) => h.score >= MIN_SCORE);

  if (relevant.length === 0) {
    return {
      status: "no_answer",
      answer: "No passage in the selected documents is relevant enough to answer this question.",
      references: [],
      retrieved,
      promptVersion: PROMPT_VERSION,
    };
  }

  const allowed = new Set(relevant.map((h) => h.id));
  const userMessage = buildUserMessage(request.question, relevant);

  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await askModel(SYSTEM_PROMPT, userMessage);
    const parsed = parseAnswer(text);
    if (!parsed) continue;
    if (parsed.cited_chunk_ids.some((id) => !allowed.has(id))) continue;
    if (parsed.status === "answered" && parsed.cited_chunk_ids.length === 0) continue;
    const references: Reference[] =
      parsed.status === "no_answer"
        ? []
        : relevant
            .filter((h) => parsed.cited_chunk_ids.includes(h.id))
            .map((h) => ({
              chunkId: h.id,
              filename: h.filename,
              start: h.start,
              end: h.end,
              score: h.score,
              preview: h.text.slice(0, 160),
            }));
    return {
      status: parsed.status,
      answer: parsed.answer,
      references,
      retrieved,
      promptVersion: PROMPT_VERSION,
    };
  }
  throw new AppError(502, "invalid_model_output", "The model returned an answer that could not be verified.");
}
