import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Search, FileCode, MessageSquare, Layers } from 'lucide-react';
import api, { QueryResponse } from '../api/client';

interface HistoryItem {
  question: string;
  answer: string;
  sources: QueryResponse['sources'];
  mode: 'standard' | 'hybrid';
  retrieval_methods?: string[];
}

const EXAMPLE_QUESTIONS = [
  'What is the main purpose of this codebase?',
  'Find all database query functions',
  'How does authentication work in this project?',
  'List all API endpoints',
  'What testing frameworks are used?',
  'Explain the error handling strategy',
];

export default function QueryPage() {
  const [selectedRepo, setSelectedRepo] = useState('');
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<'standard' | 'hybrid'>('standard');
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const { data: reposData } = useQuery({
    queryKey: ['repos'],
    queryFn: api.listRepos,
  });

  const repos = reposData?.repos || {};
  const reposList = Object.keys(repos);

  const queryMutation = useMutation({
    mutationFn: (vars: { question: string; repo_id: string }) =>
      mode === 'hybrid'
        ? api.hybridQuery({ ...vars, max_results: 5 })
        : api.queryCode({ ...vars, max_results: 5 }),
    onSuccess: (data: any) => {
      setHistory(prev => [{
        question,
        answer: data.answer,
        sources: data.sources,
        mode,
        retrieval_methods: data.retrieval_methods,
      }, ...prev]);
      setQuestion('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Query failed');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepo) { toast.error('Please select a repository'); return; }
    if (!question.trim()) { toast.error('Please enter a question'); return; }
    queryMutation.mutate({ question: question.trim(), repo_id: selectedRepo });
  };

  return (
    <div className="page-enter">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.5px', marginBottom: '6px', marginTop: 0 }}>
          Query Codebase
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Ask questions about your code in natural language using RAG retrieval.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '16px', alignItems: 'start' }}>

        {/* Left — form + history */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Form */}
          <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)', borderRadius: '8px', padding: '22px' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Repo + mode row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px' }}>
                <div>
                  <FieldLabel>Repository</FieldLabel>
                  <select
                    value={selectedRepo}
                    onChange={e => setSelectedRepo(e.target.value)}
                    disabled={queryMutation.isPending}
                    style={selectStyle}
                    onFocus={e => (e.target.style.borderColor = 'var(--accent-green)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--bg-border)')}
                  >
                    <option value="">Choose repo...</option>
                    {reposList.map(id => (
                      <option key={id} value={id}>{id} ({repos[id].total_files} files)</option>
                    ))}
                  </select>
                </div>

                <div>
                  <FieldLabel>Mode</FieldLabel>
                  <div style={{ display: 'flex', background: 'var(--bg-base)', border: '1px solid var(--bg-border)', borderRadius: '6px', overflow: 'hidden' }}>
                    {(['standard', 'hybrid'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        style={{
                          padding: '8px 14px', border: 'none', cursor: 'pointer',
                          fontSize: '12px', fontFamily: 'var(--font-sans)', fontWeight: mode === m ? 500 : 400,
                          background: mode === m ? 'var(--bg-elevated)' : 'transparent',
                          color: mode === m ? 'var(--accent-green)' : 'var(--text-secondary)',
                          transition: 'all 150ms', textTransform: 'capitalize',
                        }}
                      >{m}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Question */}
              <div>
                <FieldLabel>Question</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <MessageSquare size={13} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)', pointerEvents: 'none' }} />
                  <textarea
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    placeholder="What does this code do? How does authentication work? ..."
                    rows={3}
                    disabled={queryMutation.isPending}
                    style={{
                      ...selectStyle,
                      paddingLeft: '34px',
                      resize: 'vertical',
                      minHeight: '80px',
                      lineHeight: 1.5,
                    }}
                    onFocus={e => (e.target.style.borderColor = 'var(--accent-green)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--bg-border)')}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e as any);
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="submit"
                  disabled={queryMutation.isPending || !selectedRepo || !question.trim()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    padding: '10px 20px', background: 'var(--accent-green)',
                    color: '#0a0b0d', fontWeight: 600, borderRadius: '6px', border: 'none',
                    cursor: queryMutation.isPending || !selectedRepo || !question.trim() ? 'not-allowed' : 'pointer',
                    opacity: queryMutation.isPending || !selectedRepo || !question.trim() ? 0.5 : 1,
                    fontSize: '14px', fontFamily: 'var(--font-sans)', transition: 'all 150ms',
                  }}
                  onMouseEnter={e => {
                    if (!queryMutation.isPending) {
                      (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)';
                      (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.filter = '';
                    (e.currentTarget as HTMLButtonElement).style.transform = '';
                  }}
                >
                  {queryMutation.isPending
                    ? <><span className="spinner" style={{ width: '15px', height: '15px' }} /> Searching...</>
                    : <><Search size={14} /> Search</>
                  }
                </button>
                {mode === 'hybrid' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent-blue)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                    <Layers size={11} /> BM25 + MMR → RRF
                  </div>
                )}
                <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  ⌘↵ to send
                </span>
              </div>
            </form>

            {/* Example prompts */}
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--bg-border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
                Examples
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {EXAMPLE_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => setQuestion(q)}
                    disabled={queryMutation.isPending}
                    style={{
                      padding: '7px 10px', background: 'var(--bg-elevated)',
                      border: '1px solid var(--bg-border)', borderRadius: '4px',
                      color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'left',
                      cursor: 'pointer', transition: 'all 150ms', fontFamily: 'var(--font-sans)',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-green)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--bg-border)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Results history */}
          {history.map((item, idx) => (
            <ResultCard key={idx} item={item} />
          ))}
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Repo info */}
          {selectedRepo && repos[selectedRepo] && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)', borderRadius: '8px', padding: '18px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '14px' }}>
                Repo Info
              </div>
              {[
                ['Name',   selectedRepo],
                ['Files',  String(repos[selectedRepo].total_files)],
                ['Chunks', String(repos[selectedRepo].total_chunks)],
                ['Lines',  repos[selectedRepo].total_lines?.toLocaleString() ?? '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{k}</span>
                  <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{v}</span>
                </div>
              ))}
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--bg-border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>Languages</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {(repos[selectedRepo].languages || []).map((lang: string) => (
                    <span key={lang} style={{
                      padding: '2px 7px', background: 'var(--bg-elevated)',
                      border: '1px solid var(--bg-border)', borderRadius: '3px',
                      fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
                    }}>{lang}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tips */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)', borderRadius: '8px', padding: '18px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' }}>Tips</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                'Be specific: "How is JWT auth handled?"',
                'Ask patterns: "Find all DB queries"',
                'Hybrid mode uses BM25 + MMR fusion',
                'Results show source file + preview',
              ].map(tip => (
                <li key={tip} style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '6px' }}>
                  <span style={{ color: 'var(--accent-green)', flexShrink: 0 }}>›</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ item }: { item: HistoryItem }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)', borderRadius: '8px', overflow: 'hidden' }}>
      {/* Question */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bg-border)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <MessageSquare size={14} style={{ color: 'var(--accent-blue)', marginTop: '2px', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{item.question}</span>
        </div>
        <span style={{
          padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontFamily: 'var(--font-mono)',
          background: item.mode === 'hybrid' ? 'rgba(77,158,255,0.1)' : 'rgba(0,217,126,0.08)',
          color: item.mode === 'hybrid' ? 'var(--accent-blue)' : 'var(--accent-green)',
          border: `1px solid ${item.mode === 'hybrid' ? 'rgba(77,158,255,0.2)' : 'rgba(0,217,126,0.15)'}`,
          flexShrink: 0,
        }}>
          {item.mode}
        </span>
      </div>

      {/* Answer */}
      <div style={{ padding: '16px 20px', borderBottom: item.sources.length > 0 ? '1px solid var(--bg-border)' : 'none' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {item.answer}
        </div>
      </div>

      {/* Sources */}
      {item.sources.length > 0 && (
        <div style={{ padding: '14px 20px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
            Sources ({item.sources.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {item.sources.map((src, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{
                  padding: '8px 12px', borderBottom: '1px solid var(--bg-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileCode size={12} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--accent-blue)' }}>
                      {src.file_path}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{src.language}</span>
                    {(src as any).retrieval_method && (
                      <RetrievalBadge method={(src as any).retrieval_method} />
                    )}
                  </div>
                </div>
                <pre style={{
                  margin: 0, padding: '10px 12px',
                  fontSize: '11px', color: 'var(--text-secondary)',
                  overflowX: 'auto', lineHeight: 1.5,
                  fontFamily: 'var(--font-mono)',
                }}>
                  {src.content_preview}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RetrievalBadge({ method }: { method: string }) {
  const cfg: Record<string, { bg: string; color: string; border: string }> = {
    both:        { bg: 'rgba(0,217,126,0.1)',   color: 'var(--accent-green)', border: 'rgba(0,217,126,0.2)' },
    dense_only:  { bg: 'rgba(77,158,255,0.1)',  color: 'var(--accent-blue)',  border: 'rgba(77,158,255,0.2)' },
    sparse_only: { bg: 'rgba(245,166,35,0.1)',  color: 'var(--accent-amber)', border: 'rgba(245,166,35,0.2)' },
  };
  const s = cfg[method] || cfg.dense_only;
  return (
    <span style={{
      padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontFamily: 'var(--font-mono)',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>{method}</span>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg-base)', border: '1px solid var(--bg-border)',
  borderRadius: '6px', color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)', fontSize: '13px', outline: 'none',
  transition: 'border-color 150ms',
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '10px', fontWeight: 500, color: 'var(--text-dim)',
      letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '7px',
    }}>{children}</div>
  );
}
