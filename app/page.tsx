"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Doc = { id: string; filename: string; chars: number; chunks: number; chunkSize: number; overlapPercent: number };
type Settings = { chunkSize: number; overlapPercent: number; topK: number };
type Reference = { chunkId: string; filename: string; start: number; end: number; score: number; preview: string };
type AskResult = {
  status: "answered" | "no_answer";
  answer: string;
  references: Reference[];
  retrieved: { chunkId: string; filename: string; score: number }[];
  promptVersion: string;
};
type ChunkView = { id: string; filename: string; start: number; end: number; text: string };

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message ?? "Request failed.";
  } catch {
    return "Request failed.";
  }
}

export default function Home() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings>({ chunkSize: 800, overlapPercent: 10, topK: 5 });
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [chunk, setChunk] = useState<ChunkView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    const body = await res.json();
    setDocs(body.documents);
    setSelected((prev) => prev.filter((id) => body.documents.some((d: Doc) => d.id === id)));
  }, []);

  useEffect(() => {
    loadDocs();
    fetch("/api/config")
      .then((r) => r.json())
      .then((b) => setSettings(b.settings))
      .catch(() => undefined);
  }, [loadDocs]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      form.append("chunkSize", String(settings.chunkSize));
      form.append("overlapPercent", String(settings.overlapPercent));
      const res = await fetch("/api/documents", { method: "POST", body: form });
      if (!res.ok) {
        setError(`${file.name}: ${await readError(res)}`);
        break;
      }
      const body = await res.json();
      setSelected((prev) => [...prev, body.document.id]);
    }
    if (fileInput.current) fileInput.current.value = "";
    await loadDocs();
    setUploading(false);
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (!res.ok) setError(await readError(res));
    setChunk(null);
    await loadDocs();
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    setChunk(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, docIds: selected, settings }),
      });
      if (!res.ok) {
        setError(await readError(res));
      } else {
        setResult(await res.json());
        await loadDocs();
      }
    } catch {
      setError("The server could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  async function openReference(ref: Reference) {
    setError(null);
    const res = await fetch(`/api/chunks/${encodeURIComponent(ref.chunkId)}`);
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    const body = await res.json();
    setChunk({
      id: body.chunk.id,
      filename: body.chunk.filename,
      start: body.chunk.start,
      end: body.chunk.end,
      text: body.chunk.text,
    });
  }

  function setNumber(key: keyof Settings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: Number(value) }));
  }

  return (
    <main>
      <h1>RAG V1</h1>
      <div className="side">
        <section>
          <h2>Documents</h2>
          <input
            ref={fileInput}
            type="file"
            accept=".md,.txt"
            multiple
            disabled={uploading}
            onChange={(e) => upload(e.target.files)}
          />
          {uploading && <p>Indexing...</p>}
          {docs.length === 0 && <p>No documents yet.</p>}
          {docs.map((d) => (
            <div className="doc" key={d.id}>
              <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} />
              <span className="name" title={d.filename}>
                {d.filename}
                <br />
                <small>
                  {d.chunks} chunks, {d.chunkSize}/{d.overlapPercent}%
                </small>
              </span>
              <button className="secondary" onClick={() => remove(d.id)}>
                Delete
              </button>
            </div>
          ))}
        </section>
        <section>
          <h2>Settings</h2>
          <label className="field">
            Chunk size (characters)
            <input type="number" value={settings.chunkSize} onChange={(e) => setNumber("chunkSize", e.target.value)} />
          </label>
          <label className="field">
            Overlap (%)
            <input type="number" value={settings.overlapPercent} onChange={(e) => setNumber("overlapPercent", e.target.value)} />
          </label>
          <label className="field">
            Top-k
            <input type="number" value={settings.topK} onChange={(e) => setNumber("topK", e.target.value)} />
          </label>
        </section>
      </div>
      <div className="side">
        <section>
          <h2>Question</h2>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000} />
          <div className="row">
            <button onClick={submit} disabled={busy || question.trim().length === 0 || selected.length === 0}>
              {busy ? "Working..." : "Ask"}
            </button>
            <small>{selected.length} document(s) selected</small>
          </div>
          {error && <div className="error">{error}</div>}
        </section>
        {result && (
          <section>
            <h2>Answer</h2>
            <span className={`badge ${result.status}`}>{result.status === "answered" ? "Answered" : "No answer"}</span>
            <div className="answer">{result.answer}</div>
            {result.references.length > 0 && <h2 style={{ marginTop: 16 }}>References</h2>}
            {result.references.map((ref) => (
              <button className="ref" key={ref.chunkId} onClick={() => openReference(ref)}>
                {ref.filename} [{ref.start}-{ref.end}] score {ref.score.toFixed(2)}
                <small>{ref.preview}</small>
              </button>
            ))}
            {chunk && (
              <div className="chunk">
                <strong>
                  {chunk.filename} [{chunk.start}-{chunk.end}]
                </strong>
                <br />
                {chunk.text}
              </div>
            )}
            <p>
              <small>
                {result.retrieved.length} chunk(s) retrieved, prompt {result.promptVersion}
              </small>
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
