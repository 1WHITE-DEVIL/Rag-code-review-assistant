import { useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Home, Code2, Search, Shield, Menu, X } from 'lucide-react';
import HomePage from './components/HomePage';
import AnalyzePage from './components/AnalyzePage';
import QueryPage from './components/QueryPage';
import ReviewPage from './components/ReviewPage';
import api from './api/client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

function LogoIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="28" height="28" rx="6" fill="rgba(0,217,126,0.08)" />
      <path d="M7 10L3 14L7 18" stroke="var(--accent-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13 9L9 14L13 19" stroke="var(--accent-green)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5"/>
      <path d="M21 10L25 14L21 18" stroke="var(--accent-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="14" cy="14" r="1.5" fill="var(--accent-green)"/>
    </svg>
  );
}

const NAV_ITEMS = [
  { to: '/',        icon: Home,   label: 'Home' },
  { to: '/analyze', icon: Code2,  label: 'Analyze' },
  { to: '/query',   icon: Search, label: 'Query' },
  { to: '/review',  icon: Shield, label: 'Review' },
];

function StatusIndicator() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.healthCheck,
    refetchInterval: 30_000,
  });
  const ok = health?.openai_configured;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px' }}>
      <div style={{
        width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
        background: ok ? 'var(--accent-green)' : 'var(--accent-red)',
        boxShadow: ok ? '0 0 6px var(--accent-green)' : '0 0 6px var(--accent-red)',
      }} />
      <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
        {ok ? 'API Connected' : 'API Offline'}
      </span>
    </div>
  );
}

function NavItem({ to, icon: Icon, label, onClick }: { to: string; icon: React.ElementType; label: string; onClick?: () => void }) {
  const { pathname } = useLocation();
  const active = to === '/' ? pathname === '/' : pathname.startsWith(to);

  return (
    <Link
      to={to}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '9px 16px', borderRadius: '6px', textDecoration: 'none',
        fontSize: '14px', fontWeight: active ? 500 : 400,
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        background: active ? 'var(--bg-elevated)' : 'transparent',
        borderLeft: `2px solid ${active ? 'var(--accent-green)' : 'transparent'}`,
        transition: 'all 150ms ease', marginBottom: '2px',
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
          (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(26,29,36,0.6)';
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
          (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
        }
      }}
    >
      <Icon size={15} />
      <span>{label}</span>
    </Link>
  );
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  return (
    <div style={{
      width: '220px', height: '100vh',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--bg-border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '18px 16px 20px',
        borderBottom: '1px solid var(--bg-border)',
      }}>
        <LogoIcon />
        <span style={{
          fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '17px',
          color: 'var(--text-primary)', letterSpacing: '-0.3px',
        }}>
          coderev
        </span>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              color: 'var(--text-dim)', cursor: 'pointer', padding: '2px',
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '14px 8px', overflowY: 'auto' }}>
        <div style={{
          fontSize: '10px', fontWeight: 500, color: 'var(--text-dim)',
          letterSpacing: '1.5px', textTransform: 'uppercase',
          padding: '0 8px 10px',
        }}>
          Navigation
        </div>
        {NAV_ITEMS.map(item => (
          <NavItem key={item.to} {...item} onClick={onClose} />
        ))}
      </nav>

      {/* Status */}
      <div style={{ borderTop: '1px solid var(--bg-border)' }}>
        <StatusIndicator />
      </div>
    </div>
  );
}

function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Desktop sidebar — sticky */}
      <div className="hidden md:flex" style={{ position: 'sticky', top: 0, height: '100vh' }}>
        <Sidebar />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(10,11,13,0.85)', display: 'flex' }}
          onClick={() => setMobileOpen(false)}
        >
          <div onClick={e => e.stopPropagation()}>
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main area */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Mobile topbar */}
        <div
          className="flex md:hidden"
          style={{
            height: '52px',
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--bg-border)',
            alignItems: 'center',
            padding: '0 16px', gap: '12px',
          }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <Menu size={20} />
          </button>
          <LogoIcon />
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>
            coderev
          </span>
        </div>

        <main style={{ flex: 1, padding: '32px', maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
          <Routes>
            <Route path="/"        element={<HomePage />} />
            <Route path="/analyze" element={<AnalyzePage />} />
            <Route path="/query"   element={<QueryPage />} />
            <Route path="/review"  element={<ReviewPage />} />
          </Routes>
        </main>
      </div>

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--bg-border)',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
          },
          success: {
            duration: 3000,
            iconTheme: { primary: 'var(--accent-green)', secondary: 'var(--bg-elevated)' },
          },
          error: {
            duration: 5000,
            iconTheme: { primary: 'var(--accent-red)', secondary: 'var(--bg-elevated)' },
          },
        }}
      />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
