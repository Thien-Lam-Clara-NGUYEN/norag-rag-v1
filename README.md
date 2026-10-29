# RAG V1

Grounded question answering over `.md` and `.txt` documents.

## Requirements

- Node.js 20.9 or newer
- Docker

## Run

1. `cp .env.example .env.local` and fill in `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.
2. `docker compose up -d`
3. `npm install`
4. `npm run dev`
5. Open http://localhost:3034

The first question downloads the embedding model once. Later runs are local.

## Evaluation

1. Upload your corpus in the app.
2. Fill `eval/questions.json`.
3. `npm run eval -- --chunk 800 --overlap 10 --k 5`

Each run is saved in `eval/runs/`.
