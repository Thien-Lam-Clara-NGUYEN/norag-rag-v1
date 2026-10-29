export type Chunk = {
  index: number;
  text: string;
  start: number;
  end: number;
};

export function chunkText(text: string, chunkSize: number, overlapPercent: number): Chunk[] {
  const overlap = Math.floor((chunkSize * overlapPercent) / 100);
  const step = Math.max(1, chunkSize - overlap);
  const chunks: Chunk[] = [];
  for (let start = 0; start < text.length; start += step) {
    const end = Math.min(start + chunkSize, text.length);
    const slice = text.slice(start, end);
    if (slice.trim().length > 0) {
      chunks.push({ index: chunks.length, text: slice, start, end });
    }
    if (end >= text.length) break;
  }
  return chunks;
}
