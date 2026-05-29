import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Shield, Zap, Code, LayoutGrid, FileCode, ChevronDown, ChevronUp } from 'lucide-react';
import api, { ReviewResponse } from '../api/client';

type ReviewType = 'security' | 'performance' | 'best_practices' | 'full';

const REVIEW_TYPES: Array<{ type: ReviewType; icon: React.ReactNode; title: string; desc: string; accent: string }> = [
  { type: 'security',       icon: <Shield size={16} />,     title: 'Security Audit',    desc: 'Vulnerabilities, secrets, auth bypasses',        accent: 'var(--accent-red)' },
  { type: 'performance',    icon: <Zap size={16} />,        title: 'Performance',       desc: 'Bottlenecks, N+1 queries, memory leaks',          accent: 'var(--accent-amber)' },
  { type: 'best_practices', icon: <Code size={16} />,       title: 'Best Practices',    desc: 'Code quality, patterns, DRY, SOLID',             accent: 'var(--accent-blue)' },
  { type: 'full',           icon: <LayoutGrid size={16} />, title: 'Full Review',       desc: 'Comprehensive: security + perf + quality + arch', accent: 'var(--accent-green)' },
];

const SEV_CONFIG: Record<string, { bg: string; color: string; border: string }> = {
  critical: { bg: 'rgba(255,77,77,0.12)',   color: 'var(--accent-red)',   border: 'rgba(255,77,77,0.3)' },
  high:     { bg: 'rgba(245,166,35,0.12)',  color: 'var(--accent-amber)', border: 'rgba(245,166,35,0.3)' },
  medium:   { bg: 'rgba(77,158,255,0.12)', color: 'var(--accent-blue)',  border: 'rgba(77,158,255,0.3)' },
  low:      { bg: 'rgba(0,217,126,0.10)',  color: 'var(--accent-green)', border: 'rgba(0,217,126,0.25)' },
};

export default function ReviewPage() {
  const [selectedRepo, setSelectedRepo] = useState('');
  const [reviewType, setReviewType] = useState<ReviewType>('full');
  const [result, setResult] = useState<ReviewResponse | null>(null);

  const { data: reposData } = useQuery({
    queryKey: ['repos'],
    queryFn: api.listRepos,
  });

  const reviewMutation = useMutation({
    mutationFn: api.getReview,
    onSuccess: (data) => {
      setResult(data);
      toast.success('Review completed');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Review failed');
      setResult(null);
    },
  });

  const repos = reposData?.repos || {};
  const reposList = Object.keys(repos);

  const handleReview = () => {
    if (!selectedRepo) { toast.error('Please select a repository'); return; }
    reviewMutation.mutate({ repo_id: selectedRepo, review_type: reviewType });
  };

  const totalIssues = result
    ? Object.values(result.severity_counts).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="page-enter">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.5px', marginBottom: '6px', marginTop: 0 }}>
          Automated Code Review
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          GPT-4 powered security, performance, and quality assessments with structured JSON findings.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '16px', alignItems: 'start' }}>

        {/* Left controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)', borderRadius: '8px', padding: '20px' }}>
            <FieldLabel>Repository</FieldLabel>
            <select
              value={selectedRepo}
              onChange={e => setSelectedRepo(e.target.value)}
              disabled={reviewMutation.isPending}
              style={selectStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--accent-green)')}
              onBlur={e => (e.target.style.borderColor = 'var(--bg-border)')}
            >
              <option value="">Choose repository...</option>
              {reposList.map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>

            <div style={{ marginTop: '18px', marginBottom: '16px' }}>
              <FieldLabel>Review Type</FieldLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                {REVIEW_TYPES.map(rt => {
                  const active = reviewType === rt.type;
                  return (
                    <button
                      key={rt.type}
                      onClick={() => setReviewType(rt.type)}
                      disabled={reviewMutation.isPending}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '10px',
                        padding: '10px 12px', border: `1px solid ${active ? rt.accent.replace('var(--', 'rgba(').replace(')', ',0.3)').replace('accent-red', '255,77,77').replace('accent-amber', '245,166,35').replace('accent-blue', '77,158,255').replace('accent-green', '0,217,126') : 'var(--bg-border)'}`,
                        borderRadius: '6px', cursor: 'pointer', textAlign: 'left',
                        background: active ? 'var(--bg-elevated)' : 'transparent',
                        transition: 'all 150ms', fontFamily: 'var(--font-sans)',
                        color: active ? rt.accent : 'var(--text-secondary)',
                        borderColor: active ? 'transparent' : 'var(--bg-border)',
                      }}
                      onMouseEnter={e => {
                        if (!active) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.1)';
                      }}
                      onMouseLeave={e => {
                        if (!active) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--bg-border)';
                      }}
                    >
                      <div style={{ marginTop: '1px', flexShrink: 0, color: active ? rt.accent : 'var(--text-dim)' }}>{rt.icon}</div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', marginBottom: '2px' }}>{rt.title}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.4 }}>{rt.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleReview}
              disabled={reviewMutation.isPending || !selectedRepo}
              style={{
                width: '100%', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: 'var(--accent-green)', color: '#0a0b0d', fontWeight: 600,
                borderRadius: '6px', border: 'none',
                cursor: reviewMutation.isPending || !selectedRepo ? 'not-allowed' : 'pointer',
                opacity: reviewMutation.isPending || !selectedRepo ? 0.5 : 1,
                fontSize: '14px', fontFamily: 'var(--font-sans)', transition: 'all 150ms',
              }}
              onMouseEnter={e => {
                if (!reviewMutation.isPending && selectedRepo) {
                  (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.filter = '';
                (e.currentTarget as HTMLButtonElement).style.transform = '';
              }}
            >
              {reviewMutation.isPending
                ? <><span className="spinner" style={{ width: '15px', height: '15px' }} /> Reviewing...</>
                : <><Shield size={14} /> Start Review</>
              }
            </button>
          </section>

          {/* What to expect */}
          <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)', borderRadius: '8px', padding: '18px' }}>
            <FieldLabel>Output format</FieldLabel>
            <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                'Structured JSON findings',
                'Severity: critical/high/medium/low',
                'File path per finding',
                'Fix recommendations included',
              ].map(t => (
                <li key={t} style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '7px' }}>
                  <span style={{ color: 'var(--accent-green)' }}>›</span>{t}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right results */}
        <div>
          {reviewMutation.isPending && (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--bg-border)',
              borderRadius: '8px', padding: '60px 40px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
            }}>
              <span className="spinner spinner-lg" />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Analyzing Codebase...
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  GPT-4 is reviewing your code. This may take 30–60 seconds.
                </div>
              </div>
              <div style={{ width: '200px', height: '3px', background: 'var(--bg-border)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: '65%',
                  background: 'var(--accent-green)', borderRadius: '3px',
                  animation: 'pulse 1.5s ease-in-out infinite',
                  boxShadow: '0 0 8px rgba(0,217,126,0.4)',
                }} />
              </div>
            </div>
          )}

          {!result && !reviewMutation.isPending && (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--bg-border)',
              borderRadius: '8px', padding: '60px 40px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
            }}>
              <Shield size={40} style={{ color: 'var(--text-dim)' }} />
              <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-secondary)' }}>No review yet</div>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Select a repository and review type to start</div>
            </div>
          )}

          {result && !reviewMutation.isPending && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Severity summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                {(['critical', 'high', 'medium', 'low'] as const).map(sev => (
                  <SeverityCard key={sev} severity={sev} count={result.severity_counts[sev]} />
                ))}
              </div>

              {/* Meta bar */}
              <div style={{
                background: 'var(--bg-surface)', border: '1px solid var(--bg-border)',
                borderRadius: '8px', padding: '12px 18px',
                display: 'flex', alignItems: 'center', gap: '20px',
              }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {REVIEW_TYPES.find(t => t.type === result.review_type)?.title} Results
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px' }}>
                  <MetaChip icon={<FileCode size={11} />} label={`${result.reviewed_files} files`} />
                  <MetaChip icon={<Shield size={11} />} label={`${totalIssues} issues`} />
                </div>
              </div>

              {/* Structured findings (when parsed) */}
              {result.structured_findings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '0 2px' }}>
                    Findings ({result.structured_findings.length})
                  </div>
                  {result.structured_findings.map((f, i) => (
                    <FindingCard key={i} finding={f} />
                  ))}
                </div>
              ) : (
                // Fallback: raw text output
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--bg-border)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '1px', textTransform: 'uppercase' }}>Raw Findings</span>
                  </div>
                  <pre style={{
                    margin: 0, padding: '18px',
                    fontSize: '12px', color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono)', lineHeight: 1.6,
                    whiteSpace: 'pre-wrap', overflowX: 'auto',
                  }}>
                    {result.findings}
                  </pre>
                </div>
              )}

              {/* Priority actions */}
              <div style={{
                background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.2)',
                borderRadius: '8px', padding: '16px 18px',
              }}>
                <div style={{ fontSize: '11px', color: 'var(--accent-amber)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 500 }}>
                  Recommended Actions
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    'Address all CRITICAL issues immediately',
                    'Schedule HIGH severity items in the next sprint',
                    'Track MEDIUM issues for upcoming releases',
                    'Backlog LOW priority items',
                  ].map(a => (
                    <li key={a} style={{ fontSize: '12px', color: 'var(--accent-amber)', display: 'flex', gap: '7px' }}>
                      <span style={{ opacity: 0.7 }}>›</span>{a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SeverityCard({ severity, count }: { severity: 'critical' | 'high' | 'medium' | 'low'; count: number }) {
  const cfg = SEV_CONFIG[severity];
  return (
    <div style={{
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      borderRadius: '8px', padding: '14px 16px',
    }}>
      <div style={{ fontSize: '10px', color: cfg.color, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 500 }}>
        {severity}
      </div>
      <div style={{ fontSize: '28px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: cfg.color }}>
        {count}
      </div>
    </div>
  );
}

function FindingCard({ finding }: {
  finding: { title: string; severity: string; file_path: string; description: string; recommendation: string }
}) {
  const [open, setOpen] = useState(false);
  const sev = finding.severity?.toLowerCase() || 'low';
  const cfg = SEV_CONFIG[sev] || SEV_CONFIG.low;

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--bg-border)',
      borderRadius: '8px', overflow: 'hidden',
      transition: 'border-color 150ms',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left', fontFamily: 'var(--font-sans)',
        }}
      >
        <span style={{
          padding: '2px 8px', borderRadius: '3px', fontSize: '10px',
          fontFamily: 'var(--font-mono)', fontWeight: 500, flexShrink: 0,
          background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
        }}>{sev}</span>
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>
          {finding.title}
        </span>
        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', marginRight: '8px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {finding.file_path}
        </span>
        <div style={{ color: 'var(--text-dim)', flexShrink: 0 }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--bg-border)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Description</div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{finding.description}</p>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Recommendation</div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>{finding.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '12px' }}>
      {icon}{label}
    </div>
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
