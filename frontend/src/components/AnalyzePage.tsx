import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { GitBranch, CheckCircle, AlertCircle, ExternalLink, Link2 } from 'lucide-react';
import api, { JobStatus } from '../api/client';

const STAGE_LABELS: Record<string, string> = {
  queued:     'Queued — waiting to start',
  cloning:    'Cloning repository...',
  extracting: 'Extracting code files...',
  chunking:   'AST-aware chunking...',
  embedding:  'Creating embeddings (this takes time)...',
  storing:    'Persisting to ChromaDB...',
  complete:   'Analysis complete',
  error:      'Analysis failed',
};

export default function AnalyzePage() {
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<JobStatus | null>(null);
  const queryClient = useQueryClient();

  const { data: polledJob } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api.getJobStatus(jobId!),
    enabled: !!jobId && !!jobData && !['complete', 'error'].includes(jobData.status),
    refetchInterval: 1800,
  });

  useEffect(() => {
    if (!polledJob) return;
    setJobData(polledJob);
    if (polledJob.status === 'complete') {
      toast.success('Repository analyzed successfully!');
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    } else if (polledJob.status === 'error') {
      toast.error(polledJob.error || 'Analysis failed');
    }
  }, [polledJob, queryClient]);

  const analyzeMutation = useMutation({
    mutationFn: api.analyzeRepo,
    onSuccess: (data) => {
      setJobId(data.job_id);
      setJobData({ status: 'queued', progress: 0, message: 'Queued', repo_id: null, error: null });
      toast.success('Analysis started');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to start analysis');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) { toast.error('Please enter a repository URL'); return; }
    setJobId(null);
    setJobData(null);
    analyzeMutation.mutate({ repo_url: repoUrl.trim(), branch: branch.trim() || 'main' });
  };

  const examples = [
    'https://github.com/anthropics/anthropic-sdk-python',
    'https://github.com/openai/openai-python',
    'https://github.com/langchain-ai/langchain',
  ];

  const isRunning = jobData && !['complete', 'error'].includes(jobData.status);
  const isComplete = jobData?.status === 'complete';
  const isError = jobData?.status === 'error';
  const isBusy = analyzeMutation.isPending || !!isRunning;

  return (
    <div className="page-enter" style={{ maxWidth: '680px' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.5px', marginBottom: '6px', marginTop: 0 }}>
          Analyze Repository
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
          Clone, chunk with AST, embed, and persist a GitHub repository for RAG-powered queries.
        </p>
      </div>

      {/* Form */}
      <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)', borderRadius: '8px', padding: '24px', marginBottom: '14px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <Field label="Repository URL">
            <input
              type="url"
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              placeholder="https://github.com/username/repo"
              disabled={isBusy}
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--accent-green)')}
              onBlur={e => (e.target.style.borderColor = 'var(--bg-border)')}
            />
          </Field>

          <Field label="Branch">
            <div style={{ position: 'relative' }}>
              <GitBranch size={13} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }} />
              <input
                type="text"
                value={branch}
                onChange={e => setBranch(e.target.value)}
                placeholder="main"
                disabled={isBusy}
                style={{ ...inputStyle, paddingLeft: '34px' }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent-green)')}
                onBlur={e => (e.target.style.borderColor = 'var(--bg-border)')}
              />
            </div>
          </Field>

          <button
            type="submit"
            disabled={isBusy || !repoUrl.trim()}
            style={{
              padding: '10px 20px',
              background: 'var(--accent-green)', color: '#0a0b0d',
              fontWeight: 600, borderRadius: '6px', border: 'none',
              cursor: isBusy || !repoUrl.trim() ? 'not-allowed' : 'pointer',
              opacity: isBusy || !repoUrl.trim() ? 0.5 : 1,
              fontSize: '14px', letterSpacing: '0.3px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 150ms ease', fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={e => {
              if (!isBusy && repoUrl.trim()) {
                (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.filter = '';
              (e.currentTarget as HTMLButtonElement).style.transform = '';
            }}
          >
            {isBusy ? <><span className="spinner" style={{ width: '15px', height: '15px' }} /> Analyzing...</> : 'Analyze Repository'}
          </button>
        </form>

        {/* Examples */}
        <div style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--bg-border)' }}>
          <Label>Examples</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
            {examples.map(url => (
              <button
                key={url}
                onClick={() => setRepoUrl(url)}
                disabled={isBusy}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '4px 10px',
                  background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)',
                  borderRadius: '4px', color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)', fontSize: '11px', cursor: 'pointer',
                  transition: 'all 150ms',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-green)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-green)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--bg-border)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                }}
              >
                <ExternalLink size={9} />
                {url.split('/').slice(-1)[0]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Job progress */}
      {jobData && (
        <section style={{
          background: 'var(--bg-surface)',
          border: `1px solid ${isComplete ? 'rgba(0,217,126,0.25)' : isError ? 'rgba(255,77,77,0.25)' : 'var(--bg-border)'}`,
          borderRadius: '8px', padding: '20px', marginBottom: '14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: isError ? '12px' : '16px' }}>
            {isComplete
              ? <CheckCircle size={16} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
              : isError
                ? <AlertCircle size={16} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
                : <span className="spinner" />
            }
            <span style={{
              fontSize: '13px', fontWeight: 500,
              color: isComplete ? 'var(--accent-green)' : isError ? 'var(--accent-red)' : 'var(--text-primary)',
            }}>
              {STAGE_LABELS[jobData.status] || jobData.status}
            </span>
            {jobId && (
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)' }}>
                job:{jobId}
              </span>
            )}
          </div>

          {!isError && (
            <div style={{ background: 'var(--bg-base)', borderRadius: '3px', height: '3px', overflow: 'hidden', marginBottom: '14px' }}>
              <div style={{
                height: '100%', width: `${jobData.progress}%`,
                background: 'var(--accent-green)', borderRadius: '3px',
                transition: 'width 500ms ease',
                boxShadow: '0 0 8px rgba(0,217,126,0.4)',
              }} />
            </div>
          )}

          {isError && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--accent-red)', margin: 0 }}>
              {jobData.error}
            </p>
          )}

          {isComplete && jobData.repo_id && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <InfoBox label="Repo ID" value={jobData.repo_id} mono />
              <InfoBox label="Status" value="complete" />
            </div>
          )}
        </section>
      )}

      {/* Pipeline info */}
      <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)', borderRadius: '8px', padding: '20px' }}>
        <Label>Pipeline</Label>
        <ol style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            ['Clone',   'Shallow git clone (depth=1) for speed'],
            ['Extract', 'Parse .py, .js, .ts, .java, .go and 20+ extensions'],
            ['Chunk',   'Python AST nodes · JS/TS regex boundaries · generic fallback'],
            ['Embed',   'OpenAI text-embedding-3-small (1536-dim vectors)'],
            ['Store',   'ChromaDB collection + metadata.json per repo'],
          ].map(([step, desc], i) => (
            <li key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <span style={{
                minWidth: '20px', height: '20px',
                background: 'rgba(0,217,126,0.08)', border: '1px solid rgba(0,217,126,0.15)',
                borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--accent-green)', fontWeight: 500,
              }}>{i + 1}</span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{step}: </span>{desc}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

// ── Shared primitives ────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px',
  background: 'var(--bg-base)', border: '1px solid var(--bg-border)',
  borderRadius: '6px', color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)', fontSize: '13px', outline: 'none',
  transition: 'border-color 150ms',
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '10px', fontWeight: 500, color: 'var(--text-dim)',
      letterSpacing: '1.5px', textTransform: 'uppercase',
    }}>{children}</div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: '8px' }}><Label>{label}</Label></div>
      {children}
    </div>
  );
}

function InfoBox({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: '6px', padding: '10px 14px' }}>
      <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', fontSize: '13px', color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}
