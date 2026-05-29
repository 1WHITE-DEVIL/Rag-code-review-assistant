# RAG Code Review Assistant

A production-grade **Retrieval-Augmented Generation (RAG) system** for automated code review.  
Built with AST-aware chunking, hybrid BM25+MMR retrieval fused via Reciprocal Rank Fusion, and structured GPT-4 review outputs.

---

## What Is RAG?

A vanilla LLM has no knowledge of your codebase. You could paste code into the prompt — but that hits context limits fast and costs a lot at scale.

RAG solves this with two phases:

```
INDEXING (offline)                    RETRIEVAL (online)
──────────────────                    ─────────────────
Clone repo                            User query
    ↓                                     ↓
Extract code files              Embed query → vector
    ↓                                     ↓
AST-aware chunking              Search ChromaDB (dense MMR)
    ↓                           +  BM25 keyword search (sparse)
Embed chunks → vectors                    ↓
    ↓                           RRF fusion → top-5 chunks
Store in ChromaDB                         ↓
                                Stuff into GPT-4 context
                                          ↓
                                Grounded, cited answer
```

The LLM never sees the full codebase — only the chunks most relevant to the query. This is precise, cheap, and explainable.

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/rag-code-review.git
cd rag-code-review/backend

# 2. Install dependencies
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. Configure
cp .env.example .env
# Edit .env → add OPENAI_API_KEY=sk-...

# 4. Run backend
python main.py

# 5. Run frontend (separate terminal)
cd ../frontend
npm install
npm run dev
```

Open `http://localhost:3000`. Backend API at `http://localhost:8000`.  
Swagger docs: `http://localhost:8000/docs`

**Prerequisites:** Python 3.10+, Node.js 18+, OpenAI API key.

---

## Architecture

```
rag-code-review/
├── backend/
│   ├── main.py              # Full FastAPI backend — RAG pipeline, all endpoints
│   ├── requirements.txt     # Python dependencies
│   ├── .env.example         # Environment template
│   ├── chroma_db/           # Persisted vector store (git-ignored)
│   └── logs/                # Rotating JSON request logs
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── HomePage.tsx      # Dashboard, repo stats
│   │   │   ├── AnalyzePage.tsx   # Repo ingestion + job progress
│   │   │   ├── QueryPage.tsx     # RAG query interface + source viewer
│   │   │   └── ReviewPage.tsx    # Automated review with severity breakdown
│   │   ├── api/client.ts         # Typed API client
│   │   └── App.tsx               # Router + layout
│   └── package.json
│
├── tests/
│   └── test_api.py          # Backend test suite
└── docker-compose.yml       # Full-stack container orchestration
```

---

## Chunking Strategy — Why It Matters

Chunk size is one of the highest-leverage decisions in a RAG system. Too large and retrieval becomes imprecise — the chunk contains many functions and the embedding is a noisy average. Too small and you lose function-level context, splitting a method from its signature.

This system uses **AST-aware chunking** with language-specific strategies:

### Python — `ast` module
```
ast.parse(source)
  → walk FunctionDef / AsyncFunctionDef / ClassDef nodes
  → extract [start_line : end_lineno] slice
  → one chunk per logical unit
```
Each Python chunk is exactly one function or class. The chunk boundary is the AST node boundary — not an arbitrary character count. This means a 300-line class becomes one chunk, not 3 fragments that each lack context.

### JavaScript / TypeScript — Regex boundaries
Splits at `function`, `class`, `const arrow`, and `export const object` declarations. Falls back gracefully when regex finds no boundaries.

### All other languages — RecursiveCharacterTextSplitter
```
chunk_size=1200, chunk_overlap=150
separators=["\n\n", "\n", " ", ""]
```
Prefers double-newline boundaries (logical paragraph breaks) before falling back to single newlines, then spaces.

### Chunk metadata stored per chunk:
```json
{
  "file_path": "app/middleware/rate_limit.py",
  "language": "Python",
  "function_name": "check_rate_limit",
  "start_line": 42,
  "end_line": 67,
  "chunk_index": 3,
  "chunk_type": "function"
}
```
This metadata is stored in ChromaDB alongside the vector. Every retrieved chunk comes with its source file and line range — enabling precise citations in answers.

---

## Retrieval — Hybrid BM25 + MMR with RRF

The system implements two complementary retrieval strategies and fuses them.

### Dense Retrieval — MMR (Maximum Marginal Relevance)
Pure cosine similarity returns the top-k most similar chunks — but they're often near-duplicates from the same file. MMR penalizes redundancy:

```
MMR score = λ · sim(query, chunk) − (1−λ) · max(sim(chunk, already_selected))
```

Result: diverse, non-overlapping chunks that cover more of the relevant codebase.

### Sparse Retrieval — BM25
BM25 is a keyword-frequency ranking function. It scores documents by term frequency (TF) weighted by inverse document frequency (IDF), with a saturation function that prevents high-frequency terms from dominating:

```
BM25(q, d) = Σ IDF(tᵢ) · [TF(tᵢ,d) · (k₁+1)] / [TF(tᵢ,d) + k₁·(1 − b + b·|d|/avgdl)]
```

BM25 catches exact identifier matches — function names, variable names, error codes — that semantic search can miss when the embedding space doesn't preserve lexical identity well.

### Fusion — Reciprocal Rank Fusion (RRF)

```python
RRF_score(doc) = 1 / (60 + dense_rank) + 1 / (60 + sparse_rank)
```

- `k=60` dampens rank position impact — prevents a rank-1 result from dominating
- Documents appearing in only one list get `rank=1000` in the other (near-zero contribution)
- Final output: top-5 documents by RRF score

Each returned source is tagged with its retrieval method: `"both"`, `"dense_only"`, or `"sparse_only"`. A result appearing in both lists signals strong relevance.

---

## Evaluation Endpoints

The system exposes a built-in evaluation API — not just vibes, but measurable retrieval quality.

### `POST /api/evaluate`
```json
{
  "repo_id": "my-repo",
  "test_questions": ["Where is rate limiting implemented?"],
  "expected_files": [["app/middleware/rate_limit.py"]]
}
```

Returns per-question and aggregate metrics:

| Metric | Definition |
|--------|------------|
| **Precision@5** | Fraction of top-5 retrieved chunks that come from expected files |
| **Recall@5** | Fraction of expected files that appear anywhere in top-5 results |
| **MRR** | Mean Reciprocal Rank — `1/rank` of the first relevant chunk |

**Why these metrics matter:**
- High precision, low recall → retrieval is accurate but incomplete (missing relevant files)
- Low precision, high recall → retrieval is casting too wide a net (noisy results)
- Low MRR → relevant chunks are buried — check chunk size and overlap settings

---

## API Reference

### Ingestion

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analyze-repo` | Non-blocking: clone → extract → chunk → embed → store. Returns `job_id` |
| `GET` | `/api/jobs/{job_id}` | Poll job progress (cloning → extracting → chunking → embedding → complete) |
| `GET` | `/api/repos` | List all analyzed repositories with metadata |
| `DELETE` | `/api/repos/{repo_id}` | Remove repo from vector store and disk |

### Query

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/query` | Dense MMR retrieval + GPT-4 answer with source citations |
| `POST` | `/api/hybrid-query` | BM25+MMR fusion via RRF + GPT-4 answer |

### Review

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/review` | Structured GPT-4 review. Types: `security`, `performance`, `best_practices`, `full` |

### Inspection

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/repos/{repo_id}/chunks` | Chunk statistics: count, avg token size, by-language breakdown, top files, sample chunks |
| `POST` | `/api/evaluate` | Compute Precision@5, Recall@5, MRR over a test question set |
| `GET` | `/health` | API health + OpenAI configuration status |

---

## Review Types

The review system uses specialized prompts per review type. GPT-4 is instructed to return structured JSON:

```json
{
  "summary": "Executive summary of findings",
  "findings": [
    {
      "title": "Hardcoded API key in config.py",
      "severity": "critical",
      "file_path": "config/settings.py",
      "description": "API key is committed directly to source code",
      "recommendation": "Move to environment variable, rotate the key immediately"
    }
  ]
}
```

Severity counts are extracted programmatically — no regex counting of the word "critical" in prose.

| Review Type | Focus Areas |
|-------------|-------------|
| `security` | SQL injection, XSS, hardcoded secrets, auth bypasses, CSRF, path traversal |
| `performance` | N+1 queries, blocking I/O, memory leaks, unnecessary re-renders, caching gaps |
| `best_practices` | Error handling, type safety, DRY principle, SOLID adherence, test coverage |
| `full` | All of the above + architectural assessment + technical debt + priority action items |

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Chunking | AST-aware per language | Character-based splitting fragments function bodies; AST preserves logical units |
| Retrieval | Hybrid BM25+MMR | Dense embeddings miss exact identifier matches; BM25 catches them; RRF combines both |
| `k` parameter | Default 5 | Too large → Lost in the Middle problem; LLM ignores chunks buried in context |
| `fetch_k` | `k * 2` | MMR needs a candidate pool to apply diversity penalty; must be larger than `k` |
| Vector DB | ChromaDB | Persistent, embedded, zero-infrastructure for development; HNSW indexing for ANN search |
| Embedding model | `text-embedding-3-small` | 1536-dim, strong code semantics, cost-efficient at $0.0001/1K tokens |
| LLM | `gpt-4o-mini` | Strong reasoning for review tasks; accessible on all OpenAI tiers |
| Job tracking | Async + UUID job IDs | Analysis takes 10-60s; non-blocking endpoint prevents client timeouts |
| Persistence | ChromaDB + `metadata.json` | Vector store + repo metadata survive process restarts; auto-recovered on startup |
| Rate limiting | In-memory sliding window | 10 req/min per IP; prevents runaway OpenAI API costs |

---

## Supported Languages

Python, JavaScript, TypeScript, React (JSX/TSX), Java, C, C++, Go, Rust, Ruby, PHP, Swift, Kotlin, C#, Scala, R, MATLAB, SQL, Shell, Vue, HTML, CSS

---

## Known Limitations

These are intentional design boundaries, not oversights:

- **No incremental indexing:** Deleting and re-analyzing is required when code changes. Production would use a file-hash diff to only re-embed modified files.
- **In-memory state:** `repos_metadata` and `vector_stores` live in process memory. Multi-instance deployments need Redis or a shared metadata store.
- **Single-collection ChromaDB:** No access control between repositories. Engineer A can query repo B if they know the `repo_id`. Production needs per-collection auth.
- **No re-ranking:** Retrieved chunks are passed to the LLM in RRF order. A cross-encoder re-ranker (e.g. `ms-marco-MiniLM`) would improve answer quality at the cost of latency.
- **BM25 loads all documents:** The sparse retrieval step calls `vectorstore.get()` to fetch all texts. For large codebases (>100K chunks), this is expensive. Production would maintain a separate BM25 index on disk.

---

## Cost Estimate

For typical development and testing use:

| Operation | Approximate Cost |
|-----------|-----------------|
| Embed a 500-file repository | ~$0.02 |
| 50 RAG queries (gpt-4o-mini) | ~$0.30 |
| 10 full code reviews (gpt-4o-mini) | ~$0.50 |
| **Total for full evaluation** | **~$1.00** |

Embeddings are the cheapest part. Review prompts with 15 retrieved chunks are the most expensive.

---

## What I Built and Why

This project was built as deep preparation for ML systems and backend engineering roles at developer-tooling companies.

Every decision was made through the lens of: *"why this chunking strategy, why this retrieval algorithm, what breaks at 10K files."*

The architecture deliberately avoids the naive RAG implementation — fixed-size character splitting, pure cosine similarity, blocking ingestion — in favour of decisions I can defend technically:

- AST chunking because function boundaries are semantically meaningful in a way that 1500-character windows are not
- Hybrid retrieval because BM25 and dense embeddings have complementary failure modes
- RRF because it is parameter-light and empirically outperforms learned fusion on out-of-domain data
- Async job tracking because a 30-second blocking HTTP request is not a production API

---

## Author

**Aditya Gupta** —  CS (AI), BIT Durg  
[LinkedIn](https://www.linkedin.com/in/aditya-gupta-74b6b7171) · [GitHub](https://github.com/1WHITE-DEVIL)
