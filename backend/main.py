"""
RAG-Powered Code Review Assistant - Production Backend v2
AST chunking · Hybrid BM25+MMR search · Job tracking · Structured reviews
"""
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_classic.chains import RetrievalQA
from langchain_chroma import Chroma
import git
import os
import shutil
import tempfile
from pathlib import Path
import logging
import logging.handlers
import time
import json
import ast as python_ast
import re
import uuid
import random
import asyncio
from collections import defaultdict
from datetime import datetime, timedelta
from dotenv import load_dotenv

try:
    from rank_bm25 import BM25Okapi
    BM25_AVAILABLE = True
except ImportError:
    BM25_AVAILABLE = False

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Code Review Assistant API",
    version="2.0.0",
    description="RAG-powered code review with LangChain & ChromaDB"
)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== CONFIGURATION ====================
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
MAX_REPO_SIZE_MB = int(os.getenv("MAX_REPO_SIZE_MB", "100"))
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "1"))
RATE_LIMIT = int(os.getenv("RATE_LIMIT_PER_MINUTE", "10"))

if not OPENAI_API_KEY:
    logger.warning("OPENAI_API_KEY not set. Set it in .env file.")

SUPPORTED_EXTENSIONS = {
    '.py', '.js', '.jsx', '.ts', '.tsx', '.java', '.cpp', '.c',
    '.h', '.hpp', '.go', '.rs', '.rb', '.php', '.swift', '.kt',
    '.cs', '.scala', '.r', '.m', '.sql', '.sh', '.vue', '.html', '.css'
}

LANGUAGE_MAP = {
    '.py': 'Python', '.js': 'JavaScript', '.jsx': 'React', '.ts': 'TypeScript',
    '.tsx': 'React TypeScript', '.java': 'Java', '.cpp': 'C++', '.c': 'C',
    '.h': 'C/C++ Header', '.hpp': 'C++ Header', '.go': 'Go', '.rs': 'Rust',
    '.rb': 'Ruby', '.php': 'PHP', '.swift': 'Swift', '.kt': 'Kotlin',
    '.cs': 'C#', '.scala': 'Scala', '.r': 'R', '.m': 'MATLAB',
    '.sql': 'SQL', '.sh': 'Shell', '.vue': 'Vue', '.html': 'HTML', '.css': 'CSS'
}

JS_TS_EXTENSIONS = {'.js', '.jsx', '.ts', '.tsx'}

# ==================== MODELS ====================
class RepoRequest(BaseModel):
    repo_url: str = Field(..., description="GitHub repository URL")
    branch: str = Field(default="main", description="Branch to analyze")

class QueryRequest(BaseModel):
    question: str = Field(..., description="Question about the codebase")
    repo_id: str = Field(..., description="Repository identifier")
    max_results: int = Field(default=5, ge=1, le=20)

class ReviewRequest(BaseModel):
    repo_id: str
    review_type: str = Field(default="full", pattern="^(security|performance|best_practices|full)$")

class EvaluateRequest(BaseModel):
    repo_id: str
    test_questions: List[str]
    expected_files: List[List[str]]  # per question, list of expected file paths

class QueryResponse(BaseModel):
    answer: str
    sources: List[Dict[str, Any]]
    repo_id: str

class HybridQueryResponse(BaseModel):
    answer: str
    sources: List[Dict[str, Any]]
    repo_id: str
    retrieval_methods: List[str]

class ReviewResponse(BaseModel):
    review_type: str
    findings: str
    reviewed_files: int
    severity_counts: Dict[str, int]
    structured_findings: List[Dict] = []

# ==================== GLOBAL STATE ====================
repos_metadata: Dict[str, Dict] = {}
vector_stores: Dict[str, Any] = {}
request_timestamps: Dict[str, List[datetime]] = defaultdict(list)
job_status: Dict[str, Dict] = {}

try:
    embeddings = OpenAIEmbeddings(
        openai_api_key=OPENAI_API_KEY,
        model="text-embedding-3-small"
    )
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0.1,
        openai_api_key=OPENAI_API_KEY
    )
    logger.info("OpenAI components initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize OpenAI: {e}")
    embeddings = None
    llm = None

# ==================== ROTATING FILE LOGGER ====================
def _setup_file_logger() -> logging.Logger:
    os.makedirs("logs", exist_ok=True)
    handler = logging.handlers.RotatingFileHandler(
        "logs/api.log", maxBytes=10 * 1024 * 1024, backupCount=3
    )
    handler.setFormatter(logging.Formatter('%(message)s'))
    api_log = logging.getLogger("api.requests")
    api_log.setLevel(logging.INFO)
    api_log.addHandler(handler)
    api_log.propagate = False
    return api_log

api_request_logger = _setup_file_logger()

# ==================== RATE LIMITING ====================
def check_rate_limit(client_id: str) -> bool:
    now = datetime.now()
    cutoff = now - timedelta(minutes=1)
    request_timestamps[client_id] = [
        ts for ts in request_timestamps[client_id] if ts > cutoff
    ]
    if len(request_timestamps[client_id]) >= RATE_LIMIT:
        return False
    request_timestamps[client_id].append(now)
    return True

@app.middleware("http")
async def request_middleware(request: Request, call_next):
    """Rate limiting + JSON-line request logging."""
    client_ip = request.client.host
    start_time = time.time()

    if not check_rate_limit(client_ip):
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Max 10 requests per minute."}
        )

    response = await call_next(request)
    duration_ms = int((time.time() - start_time) * 1000)

    api_request_logger.info(json.dumps({
        "timestamp": datetime.now().isoformat(),
        "method": request.method,
        "path": request.url.path,
        "status_code": response.status_code,
        "duration_ms": duration_ms,
        "client_ip": client_ip,
    }))

    return response

# ==================== HELPERS ====================
def get_file_language(file_path: str) -> str:
    return LANGUAGE_MAP.get(Path(file_path).suffix, 'Unknown')

def clone_repository(repo_url: str, branch: str) -> str:
    temp_dir = tempfile.mkdtemp(prefix="code_review_")
    try:
        logger.info(f"Cloning {repo_url} (branch: {branch})")
        git.Repo.clone_from(repo_url, temp_dir, branch=branch, depth=1, single_branch=True)
        return temp_dir
    except git.GitCommandError as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=400,
            detail=f"Failed to clone repository. Check URL and branch. Error: {str(e)}"
        )
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Clone error: {str(e)}")

def extract_code_files(repo_path: str) -> List[Dict[str, Any]]:
    files_data = []
    skip_dirs = {'.git', 'node_modules', '__pycache__', 'venv', 'env',
                 'dist', 'build', 'target', '.next', 'coverage', '.pytest_cache'}
    max_file_size = MAX_FILE_SIZE_MB * 1024 * 1024

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in skip_dirs and not d.startswith('.')]
        for file in files:
            file_path = Path(root) / file
            if file_path.suffix not in SUPPORTED_EXTENSIONS:
                continue
            try:
                if file_path.stat().st_size > max_file_size:
                    continue
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                relative_path = file_path.relative_to(repo_path)
                files_data.append({
                    'content': content,
                    'path': str(relative_path),
                    'language': get_file_language(str(file_path)),
                    'size': len(content),
                    'lines': content.count('\n') + 1
                })
            except Exception as e:
                logger.warning(f"Error reading {file_path}: {e}")

    logger.info(f"Extracted {len(files_data)} code files")
    return files_data

# ==================== AST-AWARE CHUNKING ====================
def chunk_by_ast(content: str, language: str, file_path: str) -> List[Dict]:
    """
    Language-aware chunking:
    - Python: ast module extracts FunctionDef / AsyncFunctionDef / ClassDef nodes
    - JS/TS:  regex boundaries (function, class, const arrow)
    - Other:  RecursiveCharacterTextSplitter (1200 chars, 150 overlap)
    Falls back to generic splitter when AST parse fails.
    """
    suffix = Path(file_path).suffix

    if suffix == '.py':
        result = _chunk_python_ast(content, file_path, language)
        if result:
            return result

    elif suffix in JS_TS_EXTENSIONS:
        result = _chunk_js_ts_regex(content, file_path, language)
        if result:
            return result

    return _chunk_generic(content, file_path, language)


def _chunk_python_ast(content: str, file_path: str, language: str) -> List[Dict]:
    """Extract all function/class definitions via Python AST."""
    try:
        tree = python_ast.parse(content)
    except SyntaxError:
        return []

    lines = content.splitlines()
    chunks: List[Dict] = []
    chunk_index = 0

    for node in python_ast.walk(tree):
        if not isinstance(node, (python_ast.FunctionDef, python_ast.AsyncFunctionDef, python_ast.ClassDef)):
            continue
        start = node.lineno - 1
        end = node.end_lineno  # type: ignore[attr-defined]
        chunk_type = "class" if isinstance(node, python_ast.ClassDef) else "function"
        chunks.append({
            'content': "\n".join(lines[start:end]),
            'metadata': {
                'file_path': file_path,
                'language': language,
                'function_name': node.name,
                'start_line': node.lineno,
                'end_line': end,
                'chunk_index': chunk_index,
                'chunk_type': chunk_type,
            }
        })
        chunk_index += 1

    return chunks


def _chunk_js_ts_regex(content: str, file_path: str, language: str) -> List[Dict]:
    """Split JS/TS at function / class / const-arrow boundaries (in priority order)."""
    boundary_patterns = [
        re.compile(r'^(export\s+)?(async\s+)?function\s+\w+', re.MULTILINE),
        re.compile(r'^(export\s+)?class\s+\w+', re.MULTILINE),
        re.compile(r'^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(', re.MULTILINE),
        re.compile(r'^(export\s+)?const\s+\w+\s*=\s*\{', re.MULTILINE),
    ]

    lines = content.splitlines()
    boundary_set: set = set()
    for pattern in boundary_patterns:
        for match in pattern.finditer(content):
            boundary_set.add(content[: match.start()].count('\n'))

    if not boundary_set:
        return []

    boundaries = sorted(boundary_set) + [len(lines)]
    chunks: List[Dict] = []
    chunk_index = 0
    prev = 0
    pending: List[str] = []

    for boundary in boundaries:
        segment = lines[prev:boundary]
        if len(segment) < 3:
            pending.extend(segment)
            prev = boundary
            continue

        if pending:
            segment = pending + segment
            pending = []

        text = "\n".join(segment)
        if text.strip():
            chunks.append({
                'content': text,
                'metadata': {
                    'file_path': file_path,
                    'language': language,
                    'function_name': None,
                    'start_line': prev + 1,
                    'end_line': boundary,
                    'chunk_index': chunk_index,
                    'chunk_type': 'block',
                }
            })
            chunk_index += 1
        prev = boundary

    # Flush any leftover tiny segment into the last chunk
    if pending and chunks:
        chunks[-1]['content'] += "\n" + "\n".join(pending)
        chunks[-1]['metadata']['end_line'] = len(lines)

    return chunks


def _chunk_generic(content: str, file_path: str, language: str) -> List[Dict]:
    """Fallback splitter for all other languages."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1200,
        chunk_overlap=150,
        length_function=len,
        separators=["\n\n", "\n", " ", ""]
    )
    return [
        {
            'content': text,
            'metadata': {
                'file_path': file_path,
                'language': language,
                'function_name': None,
                'start_line': 0,
                'end_line': 0,
                'chunk_index': i,
                'chunk_type': 'generic',
            }
        }
        for i, text in enumerate(splitter.split_text(content))
    ]


def _chunk_all_files(files_data: List[Dict[str, Any]]) -> List[Dict]:
    chunks: List[Dict] = []
    for fd in files_data:
        try:
            chunks.extend(chunk_by_ast(fd['content'], fd['language'], fd['path']))
        except Exception as e:
            logger.warning(f"Error chunking {fd['path']}: {e}")
    logger.info(f"Created {len(chunks)} chunks from {len(files_data)} files")
    return chunks


# Keep old name as alias
def chunk_code_intelligently(files_data: List[Dict[str, Any]]) -> List[Dict]:
    return _chunk_all_files(files_data)


# ==================== REVIEW PROMPTS ====================
STRUCTURED_OUTPUT_INSTRUCTION = """

IMPORTANT: Respond ONLY with a JSON object. No markdown. No preamble. Schema:
{
  "summary": "2-3 sentence executive summary",
  "findings": [
    {
      "title": "short issue title",
      "severity": "critical|high|medium|low",
      "file_path": "path/to/file.py or 'general'",
      "description": "what the issue is",
      "recommendation": "how to fix it"
    }
  ]
}"""


def create_review_prompt(review_type: str) -> str:
    prompts = {
        "security": """You are an expert security auditor. Analyze this codebase for security vulnerabilities.

Focus on:
1. SQL Injection (raw queries, string concatenation)
2. XSS (innerHTML, eval, dangerouslySetInnerHTML)
3. Hardcoded secrets (API keys, passwords, tokens)
4. Authentication/Authorization bypasses
5. Insecure dependencies or imports
6. CSRF vulnerabilities
7. Path traversal issues

For EACH issue found, provide:
- File path and approximate line number
- Severity: CRITICAL/HIGH/MEDIUM/LOW
- Detailed explanation
- Code fix recommendation
- Example secure implementation""",

        "performance": """You are a performance optimization expert. Analyze this codebase for performance issues.

Focus on:
1. N+1 query problems
2. Inefficient algorithms (nested loops, redundant operations)
3. Memory leaks (event listeners, closures, large objects)
4. Blocking operations (synchronous I/O, long computations)
5. Unnecessary re-renders (React/Vue)
6. Database query optimization
7. Caching opportunities

For EACH issue:
- File path and context
- Performance impact (High/Medium/Low)
- Specific bottleneck explanation
- Optimization recommendation
- Expected improvement""",

        "best_practices": """You are a code quality expert. Evaluate this codebase against best practices.

Evaluate:
1. Code Organization (modularity, separation of concerns)
2. Naming Conventions (clarity, consistency)
3. Error Handling (try-catch, error boundaries, validation)
4. Documentation (comments, README, API docs)
5. Type Safety (TypeScript, type hints)
6. Test Coverage (unit tests, integration tests)
7. Code Duplication (DRY principle)
8. SOLID principles adherence

For EACH category:
- Rating (Excellent/Good/Needs Improvement/Poor)
- Specific examples
- Improvement recommendations
- Quick wins""",

        "full": """You are a comprehensive code review expert. Perform a complete analysis.

Cover ALL aspects:
1. SECURITY (vulnerabilities, secrets, auth)
2. PERFORMANCE (bottlenecks, optimization)
3. CODE QUALITY (practices, patterns, maintainability)
4. ARCHITECTURE (design, scalability, coupling)
5. TECHNICAL DEBT (deprecated code, TODOs, hacks)

Structure your review:
1. Executive Summary (top 3 critical issues)
2. Security Findings (ordered by severity)
3. Performance Concerns
4. Code Quality Assessment
5. Architectural Recommendations
6. Priority Action Items"""
    }
    return prompts.get(review_type, prompts["full"]) + STRUCTURED_OUTPUT_INSTRUCTION


# ==================== ASYNC JOB RUNNER ====================
def run_analysis_sync(job_id: str, request: RepoRequest) -> None:
    """Full analysis pipeline executed in a thread pool. Updates job_status throughout."""
    repo_path = None
    try:
        def update(status: str, progress: int, message: str) -> None:
            job_status[job_id].update({"status": status, "progress": progress, "message": message})

        update("cloning", 10, "Cloning repository...")
        repo_path = clone_repository(request.repo_url, request.branch)

        update("extracting", 30, "Extracting code files...")
        files_data = extract_code_files(repo_path)

        if not files_data:
            raise ValueError("No supported code files found in repository")

        total_size_mb = sum(f['size'] for f in files_data) / 1024 / 1024
        if total_size_mb > MAX_REPO_SIZE_MB:
            raise ValueError(f"Repository too large ({total_size_mb:.2f}MB). Max: {MAX_REPO_SIZE_MB}MB")

        update("chunking", 50, "AST-aware chunking...")
        chunks = _chunk_all_files(files_data)

        update("embedding", 80, "Creating embeddings (this takes time)...")
        repo_id = request.repo_url.rstrip('/').split('/')[-1].replace('.git', '')
        texts = [c['content'] for c in chunks]
        metadatas = [c['metadata'] for c in chunks]

        vectorstore = Chroma.from_texts(
            texts=texts,
            embedding=embeddings,
            metadatas=metadatas,
            collection_name=repo_id,
            persist_directory=f"{CHROMA_PERSIST_DIR}/{repo_id}"
        )
        

        update("storing", 95, "Persisting metadata...")
        vector_stores[repo_id] = vectorstore
        languages = sorted({f['language'] for f in files_data})

        meta = {
            'repo_url': request.repo_url,
            'branch': request.branch,
            'total_files': len(files_data),
            'total_chunks': len(chunks),
            'languages': languages,
            'total_lines': sum(f['lines'] for f in files_data),
            'status': 'ready',
            'analyzed_at': datetime.now().isoformat()
        }
        repos_metadata[repo_id] = meta

        # Persist metadata alongside the Chroma collection
        meta_path = Path(CHROMA_PERSIST_DIR) / repo_id / "metadata.json"
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        with open(meta_path, 'w') as f:
            json.dump(meta, f)

        job_status[job_id].update({
            "status": "complete",
            "progress": 100,
            "message": f"Analyzed {len(files_data)} files in {len(languages)} languages",
            "repo_id": repo_id,
        })
        logger.info(f"Job {job_id}: complete — {repo_id}")

    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}", exc_info=True)
        job_status[job_id].update({"status": "error", "error": str(e)})
    finally:
        if repo_path:
            shutil.rmtree(repo_path, ignore_errors=True)


# ==================== STARTUP: RECOVER PERSISTED REPOS ====================
@app.on_event("startup")
async def recover_persisted_repos() -> None:
    """Re-attach any Chroma collections that survived a previous process."""
    os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
    persist_root = Path(CHROMA_PERSIST_DIR)
    recovered = 0

    for repo_dir in persist_root.iterdir():
        if not repo_dir.is_dir():
            continue
        repo_id = repo_dir.name
        try:
            vs = Chroma(
                persist_directory=str(repo_dir),
                embedding_function=embeddings,
                collection_name=repo_id
            )
            vector_stores[repo_id] = vs

            meta_file = repo_dir / "metadata.json"
            if meta_file.exists():
                with open(meta_file) as f:
                    repos_metadata[repo_id] = json.load(f)
            else:
                repos_metadata[repo_id] = {"status": "recovered", "repo_id": repo_id}

            recovered += 1
        except Exception as e:
            logger.warning(f"Could not recover {repo_id}: {e}")

    logger.info(f"Recovered {recovered} repositories from disk")


# ==================== API ENDPOINTS ====================
@app.get("/")
async def root():
    return {
        "message": "RAG Code Review Assistant API",
        "version": "2.0.0",
        "endpoints": {
            "analyze": "POST /api/analyze-repo",
            "job_status": "GET /api/jobs/{job_id}",
            "query": "POST /api/query",
            "hybrid_query": "POST /api/hybrid-query",
            "review": "POST /api/review",
            "evaluate": "POST /api/evaluate",
            "repos": "GET /api/repos",
            "chunks": "GET /api/repos/{repo_id}/chunks",
            "health": "GET /health"
        }
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "repos_loaded": len(repos_metadata),
        "vector_stores": len(vector_stores),
        "openai_configured": bool(OPENAI_API_KEY and llm is not None)
    }


@app.post("/api/analyze-repo")
async def analyze_repository(request: RepoRequest):
    """
    Non-blocking analysis. Returns job_id immediately.
    Poll GET /api/jobs/{job_id} for progress and results.
    """
    if not llm or not embeddings:
        raise HTTPException(status_code=503, detail="OpenAI API not configured. Set OPENAI_API_KEY in .env")

    repo_id = request.repo_url.rstrip('/').split('/')[-1].replace('.git', '')
    if repo_id in repos_metadata:
        raise HTTPException(
            status_code=400,
            detail=f"Repository '{repo_id}' already analyzed. Delete it first to re-analyze."
        )

    job_id = str(uuid.uuid4())[:8]
    job_status[job_id] = {
        "status": "queued",
        "progress": 0,
        "message": "Queued",
        "repo_id": None,
        "error": None
    }

    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, run_analysis_sync, job_id, request)

    return {
        "job_id": job_id,
        "status": "queued",
        "message": "Analysis queued. Poll /api/jobs/{job_id} for progress."
    }


@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Return current state of an analysis job."""
    if job_id not in job_status:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return job_status[job_id]


@app.post("/api/query", response_model=QueryResponse)
async def query_codebase(request: QueryRequest):
    """Dense MMR retrieval + GPT-4 answer generation."""
    if not llm:
        raise HTTPException(status_code=503, detail="OpenAI API not configured")
    if request.repo_id not in vector_stores:
        raise HTTPException(status_code=404, detail=f"Repository '{request.repo_id}' not found. Analyze it first.")

    try:
        vectorstore = vector_stores[request.repo_id]
        qa_chain = RetrievalQA.from_chain_type(
            llm=llm,
            chain_type="stuff",
            retriever=vectorstore.as_retriever(
                search_type="mmr",
                search_kwargs={"k": request.max_results, "fetch_k": request.max_results * 2}
            ),
            return_source_documents=True,
            verbose=False
        )
        logger.info(f"Querying {request.repo_id}: {request.question}")
        result = qa_chain({"query": request.question})

        sources = [
            {
                'file_path': doc.metadata.get('file_path', 'unknown'),
                'language': doc.metadata.get('language', 'unknown'),
                'chunk_index': doc.metadata.get('chunk_index', 0),
                'content_preview': doc.page_content[:300] + "..." if len(doc.page_content) > 300 else doc.page_content
            }
            for doc in result.get('source_documents', [])
        ]
        return QueryResponse(answer=result['result'], sources=sources, repo_id=request.repo_id)

    except Exception as e:
        logger.error(f"Query failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


# =============================================================================
# Hybrid Search — Reciprocal Rank Fusion (RRF)
#
# RRF score(doc) = 1 / (60 + dense_rank) + 1 / (60 + sparse_rank)
#
# k=60 is a constant that dampens the impact of rank position, preventing
# a single top-ranked result from dominating.  If a document appears in
# only one list, its rank in the other is treated as 1000 (near-zero
# contribution), so it can still win via a very strong signal in one list.
#
# Final list: top-5 documents by RRF score.
# =============================================================================
@app.post("/api/hybrid-query", response_model=HybridQueryResponse)
async def hybrid_query(request: QueryRequest):
    """BM25 sparse + MMR dense retrieval fused with Reciprocal Rank Fusion."""
    if not llm:
        raise HTTPException(status_code=503, detail="OpenAI API not configured")
    if not BM25_AVAILABLE:
        raise HTTPException(status_code=501, detail="rank_bm25 not installed. Run: pip install rank-bm25")
    if request.repo_id not in vector_stores:
        raise HTTPException(status_code=404, detail=f"Repository '{request.repo_id}' not found")

    try:
        vectorstore = vector_stores[request.repo_id]

        # --- Dense retrieval ---
        dense_docs = vectorstore.max_marginal_relevance_search(
            request.question, k=10, fetch_k=20
        )
        dense_rank_map: Dict[str, int] = {
            doc.page_content: i + 1 for i, doc in enumerate(dense_docs)
        }

        # --- Sparse retrieval via BM25 ---
        all_data = vectorstore.get()
        all_texts: List[str] = all_data.get("documents", [])
        all_metadatas: List[Dict] = all_data.get("metadatas", []) or [{}] * len(all_texts)

        def tokenize(text: str) -> List[str]:
            return re.split(r'[\s\W]+', text.lower())

        bm25 = BM25Okapi([tokenize(t) for t in all_texts])
        scores = bm25.get_scores(tokenize(request.question))
        top_bm25 = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:10]
        sparse_rank_map: Dict[str, int] = {all_texts[idx]: rank + 1 for rank, idx in enumerate(top_bm25)}

        # --- RRF merge ---
        RRF_K = 60
        MISSING = 1000
        candidates = set(dense_rank_map) | set(sparse_rank_map)

        def rrf(text: str) -> float:
            return 1 / (RRF_K + dense_rank_map.get(text, MISSING)) + \
                   1 / (RRF_K + sparse_rank_map.get(text, MISSING))

        top5 = sorted(candidates, key=rrf, reverse=True)[:5]
        text_to_meta = {all_texts[i]: all_metadatas[i] for i in range(len(all_texts))}

        sources: List[Dict] = []
        retrieval_methods: List[str] = []
        for text in top5:
            in_d, in_s = text in dense_rank_map, text in sparse_rank_map
            method = "both" if in_d and in_s else ("dense_only" if in_d else "sparse_only")
            retrieval_methods.append(method)
            meta = text_to_meta.get(text, {})
            sources.append({
                'file_path': meta.get('file_path', 'unknown'),
                'language': meta.get('language', 'unknown'),
                'chunk_index': meta.get('chunk_index', 0),
                'content_preview': text[:300] + "..." if len(text) > 300 else text,
                'retrieval_method': method,
            })

        context = "\n\n---\n\n".join(top5)
        prompt = f"Use the following code context to answer the question.\n\nContext:\n{context}\n\nQuestion: {request.question}\n\nAnswer:"
        answer_msg = llm.invoke(prompt)
        answer = answer_msg.content if hasattr(answer_msg, 'content') else str(answer_msg)

        return HybridQueryResponse(
            answer=answer,
            sources=sources,
            repo_id=request.repo_id,
            retrieval_methods=retrieval_methods
        )

    except Exception as e:
        logger.error(f"Hybrid query failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Hybrid query failed: {str(e)}")


@app.post("/api/review", response_model=ReviewResponse)
async def automated_review(request: ReviewRequest):
    """Run a structured GPT-4 code review; parse JSON findings when possible."""
    if not llm:
        raise HTTPException(status_code=503, detail="OpenAI API not configured")
    if request.repo_id not in vector_stores:
        raise HTTPException(status_code=404, detail=f"Repository '{request.repo_id}' not found")

    try:
        vectorstore = vector_stores[request.repo_id]
        review_prompt = create_review_prompt(request.review_type)

        qa_chain = RetrievalQA.from_chain_type(
            llm=llm,
            chain_type="stuff",
            retriever=vectorstore.as_retriever(
                search_type="similarity",
                search_kwargs={"k": 15}
            ),
            return_source_documents=True
        )
        logger.info(f"Running {request.review_type} review on {request.repo_id}")
        result = qa_chain({"query": review_prompt})
        raw = result['result']

        structured_findings: List[Dict] = []
        try:
            parsed = json.loads(raw)
            findings_text = parsed.get("summary", "")
            for f in parsed.get("findings", []):
                findings_text += (
                    f"\n\n[{f.get('severity','').upper()}] {f.get('title','')}\n"
                    f"File: {f.get('file_path','')}\n"
                    f"{f.get('description','')}\n"
                    f"Fix: {f.get('recommendation','')}"
                )
            severity_counts: Dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0}
            for f in parsed.get("findings", []):
                sev = f.get("severity", "").lower()
                if sev in severity_counts:
                    severity_counts[sev] += 1
            structured_findings = parsed.get("findings", [])

        except json.JSONDecodeError:
            logger.warning("Structured output parsing failed, falling back to text")
            findings_text = raw
            severity_counts = {
                'critical': raw.lower().count('critical'),
                'high': raw.lower().count('high'),
                'medium': raw.lower().count('medium'),
                'low': raw.lower().count('low')
            }

        reviewed_files = len({doc.metadata.get('file_path') for doc in result.get('source_documents', [])})
        return ReviewResponse(
            review_type=request.review_type,
            findings=findings_text,
            reviewed_files=reviewed_files,
            severity_counts=severity_counts,
            structured_findings=structured_findings
        )

    except Exception as e:
        logger.error(f"Review failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Review failed: {str(e)}")


# =============================================================================
# Retrieval Evaluation
#
# Precision@5 = (# retrieved chunks whose file_path is in expected_files) / 5
#   How many of the top-5 results are from relevant files?
#
# Recall@5 = (# unique expected files found in top-5) / total expected files
#   What fraction of expected files did we surface at all?
#
# MRR (Mean Reciprocal Rank) = 1 / rank_of_first_relevant_result
#   How early does the first relevant chunk appear? 0 if none found.
# =============================================================================
@app.post("/api/evaluate")
async def evaluate_retrieval(request: EvaluateRequest):
    """Compute Precision@5, Recall@5, and MRR over a test set."""
    if request.repo_id not in vector_stores:
        raise HTTPException(status_code=404, detail=f"Repository '{request.repo_id}' not found")
    if len(request.test_questions) != len(request.expected_files):
        raise HTTPException(status_code=400, detail="test_questions and expected_files must be the same length")

    vectorstore = vector_stores[request.repo_id]
    per_question = []

    for question, expected in zip(request.test_questions, request.expected_files):
        docs = vectorstore.max_marginal_relevance_search(question, k=5, fetch_k=10)
        paths = [doc.metadata.get('file_path', '') for doc in docs]

        # Precision@5: fraction of top-5 chunks that come from expected files
        hits = sum(1 for p in paths if p in expected)
        precision_at_5 = hits / 5 if docs else 0.0

        # Recall@5: fraction of expected files that appear anywhere in top-5
        unique_found = {p for p in paths if p in expected}
        recall_at_5 = len(unique_found) / len(expected) if expected else 0.0

        # MRR: reciprocal rank of first relevant result
        mrr = 0.0
        for rank, path in enumerate(paths, start=1):
            if path in expected:
                mrr = 1.0 / rank
                break

        per_question.append({
            "question": question,
            "precision_at_5": round(precision_at_5, 4),
            "recall_at_5": round(recall_at_5, 4),
            "mrr": round(mrr, 4)
        })

    n = len(per_question)
    return {
        "per_question": per_question,
        "aggregate": {
            "avg_precision": round(sum(q["precision_at_5"] for q in per_question) / n, 4),
            "avg_recall": round(sum(q["recall_at_5"] for q in per_question) / n, 4),
            "avg_mrr": round(sum(q["mrr"] for q in per_question) / n, 4),
        }
    }


@app.get("/api/repos/{repo_id}/chunks")
async def get_chunk_metadata(repo_id: str):
    """Aggregate chunk statistics for a repository."""
    if repo_id not in vector_stores:
        raise HTTPException(status_code=404, detail=f"Repository '{repo_id}' not found")

    data = vector_stores[repo_id].get()
    documents: List[str] = data.get("documents", [])
    metadatas: List[Dict] = data.get("metadatas", []) or [{}] * len(documents)

    total = len(documents)
    # Estimate tokens as chars / 4
    avg_tokens = (sum(len(d) for d in documents) / total / 4) if total else 0.0

    lang_counts: Dict[str, int] = defaultdict(int)
    file_counts: Dict[str, int] = defaultdict(int)
    for meta in metadatas:
        m = meta or {}
        lang_counts[m.get("language", "unknown")] += 1
        file_counts[m.get("file_path", "unknown")] += 1

    top_files = sorted(
        [{"file_path": k, "chunk_count": v} for k, v in file_counts.items()],
        key=lambda x: x["chunk_count"], reverse=True
    )[:10]

    sample_n = min(3, total)
    sample_idx = random.sample(range(total), sample_n) if total >= 3 else list(range(total))
    sample_chunks = [
        {"content": documents[i][:500], "metadata": metadatas[i]}
        for i in sample_idx
    ]

    return {
        "total_chunks": total,
        "avg_chunk_size_tokens": round(avg_tokens, 2),
        "by_language": dict(lang_counts),
        "top_files": top_files,
        "sample_chunks": sample_chunks
    }


@app.get("/api/repos")
async def list_repositories():
    return {"repos": repos_metadata, "total": len(repos_metadata)}


@app.delete("/api/repos/{repo_id}")
async def delete_repository(repo_id: str):
    if repo_id not in repos_metadata:
        raise HTTPException(status_code=404, detail=f"Repository '{repo_id}' not found")
    try:
        if repo_id in vector_stores:
            del vector_stores[repo_id]
        persist_path = f"{CHROMA_PERSIST_DIR}/{repo_id}"
        if os.path.exists(persist_path):
            shutil.rmtree(persist_path)
        del repos_metadata[repo_id]
        logger.info(f"Deleted repository: {repo_id}")
        return {"status": "deleted", "repo_id": repo_id, "message": f"Repository '{repo_id}' deleted"}
    except Exception as e:
        logger.error(f"Delete failed: {e}")
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
    logger.info("Starting Code Review Assistant API v2...")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
