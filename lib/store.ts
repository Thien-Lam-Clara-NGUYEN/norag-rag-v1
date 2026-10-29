import { ChromaClient, IncludeEnum, type Collection } from "chromadb";
import { CHROMA_URL, COLLECTION_NAME } from "./config";
import { AppError } from "./errors";

export type StoredChunk = {
  id: string;
  docId: string;
  filename: string;
  index: number;
  start: number;
  end: number;
  text: string;
};

export type Hit = StoredChunk & { score: number };

export type NewChunk = {
  id: string;
  text: string;
  vector: number[];
  docId: string;
  filename: string;
  index: number;
  start: number;
  end: number;
  chunkSize: number;
  overlapPercent: number;
};

const url = new URL(CHROMA_URL);
const client = new ChromaClient({
  host: url.hostname,
  port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
  ssl: url.protocol === "https:",
});

let collection: Promise<Collection> | null = null;

function getCollection(): Promise<Collection> {
  if (!collection) {
    collection = client.getOrCreateCollection({
      name: COLLECTION_NAME,
      embeddingFunction: null,
      configuration: { hnsw: { space: "cosine" } },
    });
    collection.catch(() => {
      collection = null;
    });
  }
  return collection;
}

async function guard<T>(run: (c: Collection) => Promise<T>): Promise<T> {
  try {
    return await run(await getCollection());
  } catch (err) {
    console.error(err);
    throw new AppError(503, "store_unavailable", "The vector database is not reachable.");
  }
}

export async function addChunks(chunks: NewChunk[]): Promise<void> {
  for (let i = 0; i < chunks.length; i += 500) {
    const batch = chunks.slice(i, i + 500);
    await guard((c) =>
      c.add({
        ids: batch.map((x) => x.id),
        embeddings: batch.map((x) => x.vector),
        documents: batch.map((x) => x.text),
        metadatas: batch.map((x) => ({
          doc_id: x.docId,
          filename: x.filename,
          chunk_index: x.index,
          char_start: x.start,
          char_end: x.end,
          chunk_size: x.chunkSize,
          overlap_percent: x.overlapPercent,
        })),
      }),
    );
  }
}

export async function deleteDocumentChunks(docId: string): Promise<void> {
  await guard((c) => c.delete({ where: { doc_id: docId } }));
}

function toStored(id: string, text: string | null, meta: Record<string, unknown> | null): StoredChunk {
  return {
    id,
    docId: String(meta?.doc_id ?? ""),
    filename: String(meta?.filename ?? ""),
    index: Number(meta?.chunk_index ?? 0),
    start: Number(meta?.char_start ?? 0),
    end: Number(meta?.char_end ?? 0),
    text: text ?? "",
  };
}

export async function queryChunks(vector: number[], docIds: string[], topK: number): Promise<Hit[]> {
  const result = await guard((c) =>
    c.query({
      queryEmbeddings: [vector],
      nResults: topK,
      where: { doc_id: { $in: docIds } },
      include: [IncludeEnum.documents, IncludeEnum.metadatas, IncludeEnum.distances],
    }),
  );
  const ids = result.ids[0] ?? [];
  const documents = result.documents[0] ?? [];
  const metadatas = result.metadatas[0] ?? [];
  const distances = result.distances[0] ?? [];
  return ids.map((id, i) => ({
    ...toStored(id, documents[i] ?? null, (metadatas[i] as Record<string, unknown> | null) ?? null),
    score: 1 - (distances[i] ?? 1),
  }));
}

export async function getChunk(id: string): Promise<StoredChunk | null> {
  const result = await guard((c) =>
    c.get({ ids: [id], include: [IncludeEnum.documents, IncludeEnum.metadatas] }),
  );
  if (result.ids.length === 0) return null;
  return toStored(
    result.ids[0],
    result.documents[0] ?? null,
    (result.metadatas[0] as Record<string, unknown> | null) ?? null,
  );
}
