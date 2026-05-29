import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

export interface RepoAnalysisRequest {
  repo_url: string;
  branch?: string;
}

export interface JobStartResponse {
  job_id: string;
  status: string;
  message: string;
}

export interface JobStatus {
  status: 'queued' | 'cloning' | 'extracting' | 'chunking' | 'embedding' | 'storing' | 'complete' | 'error';
  progress: number;
  message: string;
  repo_id: string | null;
  error: string | null;
}

export interface QueryRequest {
  question: string;
  repo_id: string;
  max_results?: number;
}

export interface QueryResponse {
  answer: string;
  sources: Array<{
    file_path: string;
    language: string;
    chunk_index: number;
    content_preview: string;
  }>;
  repo_id: string;
}

export interface HybridQueryResponse extends QueryResponse {
  retrieval_methods: string[];
  sources: Array<{
    file_path: string;
    language: string;
    chunk_index: number;
    content_preview: string;
    retrieval_method: string;
  }>;
}

export interface ReviewRequest {
  repo_id: string;
  review_type: 'security' | 'performance' | 'best_practices' | 'full';
}

export interface ReviewResponse {
  review_type: string;
  findings: string;
  reviewed_files: number;
  severity_counts: { critical: number; high: number; medium: number; low: number };
  structured_findings: Array<{
    title: string;
    severity: string;
    file_path: string;
    description: string;
    recommendation: string;
  }>;
}

export interface Repository {
  repo_url: string;
  branch: string;
  total_files: number;
  total_chunks: number;
  languages: string[];
  total_lines: number;
  status: string;
  analyzed_at: string;
}

export interface EvaluateRequest {
  repo_id: string;
  test_questions: string[];
  expected_files: string[][];
}

export interface ChunkMetadata {
  total_chunks: number;
  avg_chunk_size_tokens: number;
  by_language: Record<string, number>;
  top_files: Array<{ file_path: string; chunk_count: number }>;
  sample_chunks: Array<{ content: string; metadata: Record<string, unknown> }>;
}

export const api = {
  analyzeRepo: async (data: RepoAnalysisRequest): Promise<JobStartResponse> => {
    const response = await apiClient.post<JobStartResponse>('/api/analyze-repo', data);
    return response.data;
  },

  getJobStatus: async (jobId: string): Promise<JobStatus> => {
    const response = await apiClient.get<JobStatus>(`/api/jobs/${jobId}`);
    return response.data;
  },

  queryCode: async (data: QueryRequest): Promise<QueryResponse> => {
    const response = await apiClient.post<QueryResponse>('/api/query', data);
    return response.data;
  },

  hybridQuery: async (data: QueryRequest): Promise<HybridQueryResponse> => {
    const response = await apiClient.post<HybridQueryResponse>('/api/hybrid-query', data);
    return response.data;
  },

  getReview: async (data: ReviewRequest): Promise<ReviewResponse> => {
    const response = await apiClient.post<ReviewResponse>('/api/review', data);
    return response.data;
  },

  evaluate: async (data: EvaluateRequest) => {
    const response = await apiClient.post('/api/evaluate', data);
    return response.data;
  },

  listRepos: async (): Promise<{ repos: Record<string, Repository>; total: number }> => {
    const response = await apiClient.get('/api/repos');
    return response.data;
  },

  deleteRepo: async (repoId: string) => {
    const response = await apiClient.delete(`/api/repos/${repoId}`);
    return response.data;
  },

  getChunkMetadata: async (repoId: string): Promise<ChunkMetadata> => {
    const response = await apiClient.get<ChunkMetadata>(`/api/repos/${repoId}/chunks`);
    return response.data;
  },

  healthCheck: async (): Promise<{ status: string; repos_loaded: number; openai_configured: boolean }> => {
    const response = await apiClient.get('/health');
    return response.data;
  },
};

export default api;
