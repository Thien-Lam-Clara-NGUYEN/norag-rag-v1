import { pipeline } from "@huggingface/transformers";
import { EMBEDDING_MODEL } from "./config";
import { AppError } from "./errors";

type Extractor = (
  input: string[],
  options: { pooling: string; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

let extractor: Promise<Extractor> | null = null;

function load(): Promise<Extractor> {
  if (!extractor) {
    extractor = pipeline("feature-extraction", EMBEDDING_MODEL) as unknown as Promise<Extractor>;
    extractor.catch(() => {
      extractor = null;
    });
  }
  return extractor;
}

export async function embed(texts: string[]): Promise<number[][]> {
  try {
    const run = await load();
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += 32) {
      const output = await run(texts.slice(i, i + 32), { pooling: "mean", normalize: true });
      vectors.push(...output.tolist());
    }
    return vectors;
  } catch (err) {
    console.error(err);
    throw new AppError(500, "embedding_failed", "The embedding model could not be loaded or run.");
  }
}
