import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Config ──────────────────────────────────────────────────
const TABS = [
  { id: 'errors',      label: 'Errors',      mapKey: 'error_map',      color: '#e05555' },
  { id: 'redirects',   label: 'Redirects',   mapKey: 'redirect_map',   color: '#7BBD00' },
  { id: 'excluded',    label: 'Excluded',    mapKey: 'excluded_map',   color: '#0B9A6D' },
  { id: 'suggestions', label: 'Suggestions', mapKey: 'suggestion_map', color: '#008934' },
];

const STATS = [
  { key: 'total',      label: 'Total',      color: '#4d7a65' },
  { key: 'successful', label: 'Successful', color: '#0B9A6D' },
  { key: 'redirects',  label: 'Redirects',  color: '#7BBD00' },
  { key: 'errors',     label: 'Errors',     color: '#e05555' },
  { key: 'cached',     label: 'Cached',     color: '#008208' },
  { key: 'excludes',   label: 'Excludes',   color: '#008934' },
  { key: 'timeouts',   label: 'Timeouts',   color: '#d97f3c' },
  { key: 'unknown',    label: 'Unknown',    color: '#4d7a65' },
];

// ─── Helpers ─────────────────────────────────────────────────
function badgeClass(code) {
  if (!code) return 'badge-unknown';
  const p = Math.floor(code / 100);
  return { 2: 'badge-2xx', 3: 'badge-3xx', 4: 'badge-4xx', 5: 'badge-5xx' }[p] || 'badge-unknown';
}

function flattenMap(map) {
  if (!map || typeof map !== 'object') return [];
  return Object.entries(map).flatMap(([page, links]) => {
    const arr = Array.isArray(links)
      ? links
      : Object.entries(links).map(([url, status]) => ({ url, status }));
    return arr.map(link => ({
      page,
      url: link.url ?? link,
      status: link.status ?? { code: 200, text: 'OK' },
    }));
  });
}

function countMap(map) {
  return flattenMap(map).length;
}

function groupByPage(rows) {
  return rows.reduce((acc, row) => {
    (acc[row.page] ??= []).push(row);
    return acc;
  }, {});
}

// ─── Sub-components ──────────────────────────────────────────

function StatCard({ stat, value, total, index }) {
  const pct = Math.min(100, ((value / (total || 1)) * 100)).toFixed(1);
  return (
    <article className="stat-card" role="listitem" style={{ animationDelay: `${index * 40}ms` }}>
      <span className="stat-label">{stat.label}</span>
      <span className="stat-value" style={{ color: stat.color }}>{value.toLocaleString()}</span>
      <div className="stat-bar" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={total} aria-label={`${stat.label} percentage`}>
        <div className="stat-bar-fill" style={{ width: `${pct}%`, background: stat.color }} />
      </div>
    </article>
  );
}

function Badge({ code }) {
  return (
    <span className={`badge ${badgeClass(code)}`} aria-label={`HTTP ${code}`}>
      {code}
    </span>
  );
}

function LinkRow({ link }) {
  return (
    <li className="link-row">
      <span className={`badge ${badgeClass(link.status?.code)}`} aria-label={`HTTP status ${link.status?.code ?? 'unknown'}`}>
        {link.status?.code ?? '?'}
      </span>
      <div className="link-info">
        <a href={link.url} className="link-href" target="_blank" rel="noopener noreferrer" title={link.url}>
          {link.url}
        </a>
        {link.status?.text && <p className="link-status-text">{link.status.text}</p>}
      </div>
    </li>
  );
}

function PageGroup({ page, links, index }) {
  const [isOpen, setIsOpen] = useState(true);
  const bodyId = `group-body-${index}`;
  const codes = [...new Set(links.map(l => l.status?.code))];

  return (
    <article className="page-group" style={{ animationDelay: `${index * 30}ms` }}>
      <button
        className="page-group-header"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        title={page}
        onClick={() => setIsOpen(o => !o)}
      >
        <span className="chevron" aria-hidden="true">▶</span>
        <span className="page-url">{page}</span>
        <span className="page-meta">
          {codes.map(c => <Badge key={c} code={c} />)}
          <span className="link-count">{links.length} link{links.length !== 1 ? 's' : ''}</span>
        </span>
      </button>
      {isOpen && (
        <div id={bodyId} className="page-group-body" role="region" aria-label={`Links for ${page}`}>
          <ul>
            {links.map((link, i) => <LinkRow key={i} link={link} />)}
          </ul>
        </div>
      )}
    </article>
  );
}

function EmptyState({ hasData }) {
  return (
    <div className="empty-state" role="status">
      <span className="empty-icon" aria-hidden="true">∅</span>
      <p>{hasData ? 'No results match your filters.' : 'No data for this category.'}</p>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [activeTab, setActiveTab] = useState('errors');
  const [search, setSearch] = useState('');
  const [codeFilter, setCodeFilter] = useState('all');
  const searchRef = useRef(null);

  // Fetch output.json on mount
  useEffect(() => {
    fetch('./output.json')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => setData(json))
      .catch(err => setLoadError(err.message));
  }, []);

  // '/' keyboard shortcut to focus search
  useEffect(() => {
    const handler = e => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
    setSearch('');
    setCodeFilter('all');
  }, []);

  // Derive tab rows + filtered results
  const activeTabConfig = TABS.find(t => t.id === activeTab);
  const allRows = data ? flattenMap(data[activeTabConfig.mapKey]) : [];

  const filtered = allRows.filter(row => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q
      || row.page.toLowerCase().includes(q)
      || row.url.toLowerCase().includes(q)
      || String(row.status?.code).includes(q);
    const matchCode = codeFilter === 'all' || String(row.status?.code) === codeFilter;
    return matchSearch && matchCode;
  });

  const grouped = groupByPage(filtered);
  const pageEntries = Object.entries(grouped);

  // All codes across all tabs for the filter dropdown
  const allCodes = data
    ? [...new Set(TABS.flatMap(t => flattenMap(data[t.mapKey]).map(r => r.status?.code)).filter(Boolean))].sort((a, b) => a - b)
    : [];

  const total = data?.total ?? 0;
  const secs = data?.duration_secs ?? '?';

  return (
    <>
      <div className="app-wrapper">

        {/* Header */}
        <header className="header">
          <div>
            <p className="header-wordmark">MSU College of Engineering · Link Audit</p>
            <h1 className="header-title">Link <span>Audit</span></h1>
            <p className="header-meta" aria-live="polite">
              {loadError
                ? `Failed to load output.json: ${loadError}`
                : data
                  ? <><strong>{total.toLocaleString()}</strong> links scanned in <strong>{secs}s</strong></>
                  : 'Loading results…'}
            </p>
          </div>
        </header>

        {/* Stats */}
        <section aria-labelledby="stats-heading">
          <h2 id="stats-heading" className="sr-only">Summary statistics</h2>
          <div className="stats-grid" id="stats-grid" role="list">
            {STATS.map((s, i) => (
              <StatCard key={s.key} stat={s} value={data?.[s.key] ?? 0} total={total} index={i} />
            ))}
          </div>
        </section>

        {/* Main */}
        <main>

          {/* Tabs */}
          <div role="tablist" aria-label="Result categories" className="tabs-row">
            {TABS.map(t => {
              const count = data ? countMap(data[t.mapKey]) : 0;
              const selected = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  role="tab"
                  className="tab-btn"
                  id={`tab-${t.id}`}
                  aria-selected={selected}
                  aria-controls={`tabpanel-${t.id}`}
                  data-tab={t.id}
                  style={{ '--tab-color': t.color }}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => handleTabChange(t.id)}
                  onKeyDown={e => {
                    const tabs = TABS.map(tt => document.getElementById(`tab-${tt.id}`));
                    const idx = TABS.findIndex(tt => tt.id === t.id);
                    if (e.key === 'ArrowRight') { e.preventDefault(); handleTabChange(TABS[(idx + 1) % TABS.length].id); tabs[(idx + 1) % TABS.length]?.focus(); }
                    if (e.key === 'ArrowLeft')  { e.preventDefault(); handleTabChange(TABS[(idx - 1 + TABS.length) % TABS.length].id); tabs[(idx - 1 + TABS.length) % TABS.length]?.focus(); }
                  }}
                >
                  {t.label}
                  <span className="tab-count" aria-label={`${count} items`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <div className="filters-row" role="search" aria-label="Filter results">
            <div className="search-wrap">
              <input
                ref={searchRef}
                type="search"
                className="input-field"
                placeholder="Search pages or URLs…"
                aria-label="Search pages and URLs"
                autoComplete="off"
                spellCheck="false"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="select-field"
              aria-label="Filter by HTTP status code"
              value={codeFilter}
              onChange={e => setCodeFilter(e.target.value)}
            >
              <option value="all">All codes</option>
              {allCodes.map(c => <option key={c} value={String(c)}>{c}</option>)}
            </select>
            <span className="filter-count" aria-live="polite" aria-atomic="true">
              {data && `${pageEntries.length} page${pageEntries.length !== 1 ? 's' : ''} · ${filtered.length} link${filtered.length !== 1 ? 's' : ''}`}
            </span>
          </div>

          {/* Results */}
          <div
            id={`tabpanel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeTab}`}
            aria-live="polite"
            aria-atomic="false"
          >
            {loadError ? (
              <div className="empty-state" role="status">
                <span className="empty-icon" aria-hidden="true">⚠</span>
                <p>Could not load <code>./src/assets/output.json</code>. Make sure the file exists and the page is served over HTTP.</p>
              </div>
            ) : !data ? (
              <div className="empty-state" role="status">
                <span className="empty-icon" aria-hidden="true">⏳</span>
                <p>Loading…</p>
              </div>
            ) : pageEntries.length === 0 ? (
              <EmptyState hasData={allRows.length > 0} />
            ) : (
              <div className="results-list">
                {pageEntries.map(([page, links], i) => (
                  <PageGroup key={page} page={page} links={links} index={i} />
                ))}
              </div>
            )}
          </div>

        </main>
      </div>
    </>
  );
}