import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Code2, Search, Shield, GitBranch, FileCode, Zap, ArrowRight, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

function useCountUp(target: number, duration = 1200): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.floor(eased * target));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return value;
}

export default function HomePage() {
  const queryClient = useQueryClient();

  const { data: reposData } = useQuery({
    queryKey: ['repos'],
    queryFn: api.listRepos,
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteRepo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repos'] });
      toast.success('Repository deleted');
    },
    onError: () => toast.error('Failed to delete repository'),
  });

  const repos = reposData?.repos || {};
  const reposList = Object.entries(repos);
  const totalFiles = reposList.reduce((s, [, r]) => s + (r.total_files || 0), 0);
  const totalChunks = reposList.reduce((s, [, r]) => s + (r.total_chunks || 0), 0);

  const reposCount  = useCountUp(reposList.length);
  const filesCount  = useCountUp(totalFiles);
  const chunksCount = useCountUp(totalChunks);

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Hero */}
      <div className="grid-overlay" style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--bg-border)',
        borderRadius: '8px',
        padding: '40px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'rgba(0,217,126,0.08)', border: '1px solid rgba(0,217,126,0.2)',
            borderRadius: '20px', padding: '3px 12px', marginBottom: '18px',
          }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent-green)' }} />
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--accent-green)', letterSpacing: '1px' }}>
              RAG · GPT-4 · ChromaDB
            </span>
          </div>

          <h1 style={{
            fontSize: '30px', fontWeight: 600, color: 'var(--text-primary)',
            letterSpacing: '-0.5px', lineHeight: 1.2, marginBottom: '12px', marginTop: 0,
          }}>
            Code Review<br />
            <span style={{ color: 'var(--accent-green)' }}>Intelligence Engine</span>
          </h1>

          <p style={{ color: 'var(--text-secondary)', maxWidth: '460px', marginBottom: '28px', lineHeight: 1.6 }}>
            Analyze entire codebases with retrieval-augmented generation. Find vulnerabilities, understand architecture, query in natural language.
          </p>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <PrimaryLink to="/analyze">Analyze Repo <ArrowRight size={14} /></PrimaryLink>
            <GhostLink to="/query">Query Code</GhostLink>
            <GhostLink to="/review">Run Review</GhostLink>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        <StatCard icon={<GitBranch size={16} />} label="Repositories" value={reposCount} />
        <StatCard icon={<FileCode size={16} />}  label="Files Processed" value={filesCount} />
        <StatCard icon={<Zap size={16} />}        label="Chunks Embedded" value={chunksCount} />
      </div>

      {/* Feature cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        <FeatureCard
          icon={<Code2 size={18} />} color="var(--accent-green)"
          title="AST-Aware Chunking"
          description="Python AST + JS/TS regex boundaries. Functions and classes indexed as atomic units."
          to="/analyze"
        />
        <FeatureCard
          icon={<Search size={18} />} color="var(--accent-blue)"
          title="Hybrid BM25 + MMR"
          description="Sparse BM25 and dense MMR retrieval fused via Reciprocal Rank Fusion scoring."
          to="/query"
        />
        <FeatureCard
          icon={<Shield size={18} />} color="var(--accent-amber)"
          title="Structured Reviews"
          description="Security, performance, and quality audits with severity-classified JSON findings."
          to="/review"
        />
      </div>

      {/* Repos table */}
      {reposList.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{
            padding: '14px 20px', borderBottom: '1px solid var(--bg-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Analyzed Repositories</span>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{reposList.length} total</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--bg-border)' }}>
                {['Repository', 'Languages', 'Files', 'Status', ''].map(h => (
                  <th key={h} style={{
                    padding: '9px 20px', textAlign: 'left',
                    fontSize: '10px', fontWeight: 500, color: 'var(--text-dim)',
                    letterSpacing: '1.5px', textTransform: 'uppercase',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reposList.slice(0, 8).map(([repoId, repo]) => (
                <tr
                  key={repoId}
                  style={{ borderBottom: '1px solid var(--bg-border)', transition: 'background 150ms' }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                >
                  <td style={{ padding: '11px 20px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--accent-blue)' }}>{repoId}</span>
                  </td>
                  <td style={{ padding: '11px 20px' }}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {(repo.languages || []).slice(0, 3).map((lang: string) => (
                        <LangTag key={lang}>{lang}</LangTag>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '11px 20px', fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {repo.total_files}
                  </td>
                  <td style={{ padding: '11px 20px' }}>
                    <StatusBadge status={repo.status} />
                  </td>
                  <td style={{ padding: '11px 20px' }}>
                    <button
                      onClick={() => deleteMutation.mutate(repoId)}
                      disabled={deleteMutation.isPending}
                      title="Delete repository"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-dim)', padding: '4px',
                        borderRadius: '4px', transition: 'color 150ms',
                        display: 'flex', alignItems: 'center',
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-red)'}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dim)'}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stack */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)', borderRadius: '8px', padding: '18px 20px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-dim)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' }}>
          Stack
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {['LangChain', 'ChromaDB', 'GPT-4-turbo', 'FastAPI', 'React 18', 'TypeScript', 'BM25', 'MMR', 'Python AST', 'Uvicorn'].map(t => (
            <LangTag key={t}>{t}</LangTag>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

function PrimaryLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '9px 18px',
      background: 'var(--accent-green)', color: '#0a0b0d',
      fontWeight: 600, borderRadius: '6px', textDecoration: 'none',
      fontSize: '14px', letterSpacing: '0.3px', transition: 'all 150ms ease',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLAnchorElement).style.filter = 'brightness(1.1)';
        (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLAnchorElement).style.filter = '';
        (e.currentTarget as HTMLAnchorElement).style.transform = '';
      }}
    >{children}</Link>
  );
}

function GhostLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '9px 18px',
      background: 'transparent', color: 'var(--text-secondary)',
      border: '1px solid var(--bg-border)',
      borderRadius: '6px', textDecoration: 'none',
      fontSize: '14px', transition: 'all 150ms ease',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--accent-green)';
        (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent-green)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--bg-border)';
        (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
      }}
    >{children}</Link>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--bg-border)',
      borderRadius: '8px', padding: '18px 20px',
      transition: 'border-color 200ms',
    }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(0,217,126,0.3)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--bg-border)'}
    >
      <div style={{ color: 'var(--accent-green)', marginBottom: '10px' }}>{icon}</div>
      <div style={{
        fontSize: '26px', fontWeight: 600, fontFamily: 'var(--font-mono)',
        color: 'var(--text-primary)', marginBottom: '4px',
      }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description, to, color }: {
  icon: React.ReactNode; title: string; description: string; to: string; color: string;
}) {
  return (
    <Link to={to} style={{
      display: 'block', textDecoration: 'none',
      background: 'var(--bg-surface)', border: '1px solid var(--bg-border)',
      borderRadius: '8px', padding: '20px',
      transition: 'border-color 200ms, transform 150ms',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(0,217,126,0.3)';
        (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--bg-border)';
        (e.currentTarget as HTMLAnchorElement).style.transform = '';
      }}
    >
      <div style={{ color, marginBottom: '12px' }}>{icon}</div>
      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>{title}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{description}</div>
    </Link>
  );
}

function LangTag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      padding: '2px 8px',
      background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)',
      borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--font-mono)',
      color: 'var(--text-secondary)',
    }}>{children}</span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const ok = status === 'ready';
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '4px',
      fontSize: '11px', fontFamily: 'var(--font-mono)',
      background: ok ? 'rgba(0,217,126,0.1)' : 'rgba(245,166,35,0.1)',
      color: ok ? 'var(--accent-green)' : 'var(--accent-amber)',
      border: `1px solid ${ok ? 'rgba(0,217,126,0.2)' : 'rgba(245,166,35,0.2)'}`,
    }}>{status}</span>
  );
}
