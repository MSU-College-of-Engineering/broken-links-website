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

// Group by link URL — deduplicate, collect pages
function groupByLink(rows) {
  return rows.reduce((acc, row) => {
    const key = row.url;
    if (!acc[key]) acc[key] = { url: row.url, status: row.status, pages: [] };
    if (!acc[key].pages.includes(row.page)) acc[key].pages.push(row.page);
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

function LinkRow({ link, onExclude }) {
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
      <button
        className="exclude-link-btn"
        title="Hide this URL"
        aria-label={`Hide ${link.url}`}
        onClick={() => onExclude(link.url)}
      >✕</button>
    </li>
  );
}

function LinkDedupeRow({ entry, onExclude }) {
  const [pagesOpen, setPagesOpen] = useState(false);
  return (
    <li className="link-row link-row--dedupe">
      <span className={`badge ${badgeClass(entry.status?.code)}`} aria-label={`HTTP status ${entry.status?.code ?? 'unknown'}`}>
        {entry.status?.code ?? '?'}
      </span>
      <div className="link-info">
        <a href={entry.url} className="link-href" target="_blank" rel="noopener noreferrer" title={entry.url}>
          {entry.url}
        </a>
        {entry.status?.text && <p className="link-status-text">{entry.status.text}</p>}
        <button
          className="pages-toggle"
          onClick={() => setPagesOpen(o => !o)}
          aria-expanded={pagesOpen}
        >
          {pagesOpen ? '▾' : '▸'} {entry.pages.length} page{entry.pages.length !== 1 ? 's' : ''}
        </button>
        {pagesOpen && (
          <ul className="pages-list">
            {entry.pages.map((p, i) => (
              <li key={i} className="pages-list-item" title={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
      <button
        className="exclude-link-btn"
        title="Hide this URL"
        aria-label={`Hide ${entry.url}`}
        onClick={() => onExclude(entry.url)}
      >✕</button>
    </li>
  );
}

function PageGroup({ page, links, index, defaultOpen, onExclude }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
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
            {links.map((link, i) => <LinkRow key={i} link={link} onExclude={onExclude} />)}
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
  // New state
  const [hiddenCodes, setHiddenCodes] = useState(new Set());
  const [excludedUrls, setExcludedUrls] = useState(new Set());
  const [sortBy, setSortBy] = useState('page-asc');         // page-asc | page-desc | count-asc | count-desc | code-asc | code-desc
  const [viewMode, setViewMode] = useState('by-page');      // by-page | by-link
  const [defaultCollapsed, setDefaultCollapsed] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);  // panel open
  const searchRef = useRef(null);

  useEffect(() => {
    fetch('./output.json')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => setData(json))
      .catch(err => setLoadError(err.message));
  }, []);

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

  const toggleHideCode = (code) => {
    setHiddenCodes(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const excludeUrl = (url) => {
    setExcludedUrls(prev => new Set([...prev, url]));
  };

  const unexcludeUrl = (url) => {
    setExcludedUrls(prev => {
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
  };

  // Derive rows
  const activeTabConfig = TABS.find(t => t.id === activeTab);
  const allRows = data ? flattenMap(data[activeTabConfig.mapKey]) : [];

  // Collect all codes in this tab for the hide-code chips
  const codesInTab = [...new Set(allRows.map(r => r.status?.code).filter(Boolean))].sort((a, b) => a - b);

  // Apply all filters
  const filtered = allRows.filter(row => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q
      || row.page.toLowerCase().includes(q)
      || row.url.toLowerCase().includes(q)
      || String(row.status?.code).includes(q);
    const matchCode = codeFilter === 'all' || String(row.status?.code) === codeFilter;
    const notHidden = !hiddenCodes.has(row.status?.code);
    const notExcluded = !excludedUrls.has(row.url);
    return matchSearch && matchCode && notHidden && notExcluded;
  });

  // All codes across all tabs (for code filter dropdown)
  const allCodes = data
    ? [...new Set(TABS.flatMap(t => flattenMap(data[t.mapKey]).map(r => r.status?.code)).filter(Boolean))].sort((a, b) => a - b)
    : [];

  // ─── By-Page view ───────────────────────────────────────────
  const grouped = groupByPage(filtered);

  const sortedPageEntries = Object.entries(grouped).sort(([pageA, linksA], [pageB, linksB]) => {
    switch (sortBy) {
      case 'page-asc':   return pageA.localeCompare(pageB);
      case 'page-desc':  return pageB.localeCompare(pageA);
      case 'count-asc':  return linksA.length - linksB.length;
      case 'count-desc': return linksB.length - linksA.length;
      case 'code-asc': {
        const minA = Math.min(...linksA.map(l => l.status?.code ?? 0));
        const minB = Math.min(...linksB.map(l => l.status?.code ?? 0));
        return minA - minB;
      }
      case 'code-desc': {
        const minA = Math.min(...linksA.map(l => l.status?.code ?? 0));
        const minB = Math.min(...linksB.map(l => l.status?.code ?? 0));
        return minB - minA;
      }
      default: return 0;
    }
  });

  // ─── By-Link (deduplicated) view ────────────────────────────
  const linkGroups = groupByLink(filtered);

  const sortedLinkEntries = Object.values(linkGroups).sort((a, b) => {
    switch (sortBy) {
      case 'page-asc':   return a.url.localeCompare(b.url);
      case 'page-desc':  return b.url.localeCompare(a.url);
      case 'count-asc':  return a.pages.length - b.pages.length;
      case 'count-desc': return b.pages.length - a.pages.length;
      case 'code-asc':   return (a.status?.code ?? 0) - (b.status?.code ?? 0);
      case 'code-desc':  return (b.status?.code ?? 0) - (a.status?.code ?? 0);
      default: return 0;
    }
  });

  const total = data?.total ?? 0;
  const secs = data?.duration_secs ?? '?';

  const pageCount = sortedPageEntries.length;
  const linkCount = filtered.length;
  const dedupeCount = sortedLinkEntries.length;

  return (
    <>
      <div className="app-wrapper">

        {/* Header */}
        <header className="header">
          <div>
            <p className="header-wordmark">MSU College of Engineering</p>
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

          {/* ── Filter Bar ── */}
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

            {/* Code filter dropdown */}
            <select
              className="select-field"
              aria-label="Filter by HTTP status code"
              value={codeFilter}
              onChange={e => setCodeFilter(e.target.value)}
            >
              <option value="all">All codes</option>
              {allCodes.map(c => <option key={c} value={String(c)}>{c}</option>)}
            </select>

            {/* Sort dropdown */}
            <select
              className="select-field"
              aria-label="Sort results"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              <optgroup label="Sort by Page / URL">
                <option value="page-asc">Page A → Z</option>
                <option value="page-desc">Page Z → A</option>
              </optgroup>
              <optgroup label="Sort by Count">
                <option value="count-desc">Most links first</option>
                <option value="count-asc">Fewest links first</option>
              </optgroup>
              <optgroup label="Sort by Code">
                <option value="code-asc">Code low → high</option>
                <option value="code-desc">Code high → low</option>
              </optgroup>
            </select>

            {/* View mode toggle */}
            <div className="view-toggle" role="group" aria-label="View mode">
              <button
                className={`view-toggle-btn${viewMode === 'by-page' ? ' active' : ''}`}
                onClick={() => setViewMode('by-page')}
                title="Group by page"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/>
                </svg>
                By Page
              </button>
              <button
                className={`view-toggle-btn${viewMode === 'by-link' ? ' active' : ''}`}
                onClick={() => setViewMode('by-link')}
                title="Deduplicate links"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
                By Link
              </button>
            </div>

            {/* Collapse toggle (only in by-page mode) */}
            {viewMode === 'by-page' && (
              <button
                className="btn-collapse-toggle"
                onClick={() => setDefaultCollapsed(c => !c)}
                title={defaultCollapsed ? 'Expand all groups' : 'Collapse all groups'}
              >
                {defaultCollapsed ? '▶ Expand All' : '▼ Collapse All'}
              </button>
            )}

            <span className="filter-count" aria-live="polite" aria-atomic="true">
              {data && viewMode === 'by-page' && `${pageCount} page${pageCount !== 1 ? 's' : ''} · ${linkCount} link${linkCount !== 1 ? 's' : ''}`}
              {data && viewMode === 'by-link' && `${dedupeCount} unique link${dedupeCount !== 1 ? 's' : ''}`}
            </span>
          </div>

          {/* ── Hide Codes Row ── */}
          {codesInTab.length > 0 && (
            <div className="hide-codes-row" aria-label="Toggle visibility by status code">
              <span className="hide-codes-label">Hide codes:</span>
              {codesInTab.map(code => (
                <button
                  key={code}
                  className={`code-chip ${badgeClass(code)}${hiddenCodes.has(code) ? ' code-chip--hidden' : ''}`}
                  onClick={() => toggleHideCode(code)}
                  aria-pressed={hiddenCodes.has(code)}
                  title={hiddenCodes.has(code) ? `Show ${code}` : `Hide ${code}`}
                >
                  {hiddenCodes.has(code) ? <s>{code}</s> : code}
                </button>
              ))}
              {hiddenCodes.size > 0 && (
                <button className="clear-hidden-btn" onClick={() => setHiddenCodes(new Set())}>
                  Reset
                </button>
              )}
            </div>
          )}

          {/* ── Excluded URLs panel ── */}
          {excludedUrls.size > 0 && (
            <div className="excluded-panel">
              <button
                className="excluded-panel-toggle"
                onClick={() => setShowExcluded(o => !o)}
                aria-expanded={showExcluded}
              >
                <span>{showExcluded ? '▾' : '▸'}</span>
                {excludedUrls.size} hidden URL{excludedUrls.size !== 1 ? 's' : ''}
              </button>
              {showExcluded && (
                <ul className="excluded-list">
                  {[...excludedUrls].map(url => (
                    <li key={url} className="excluded-item">
                      <span className="excluded-url" title={url}>{url}</span>
                      <button
                        className="restore-btn"
                        onClick={() => unexcludeUrl(url)}
                        aria-label={`Restore ${url}`}
                      >Restore</button>
                    </li>
                  ))}
                  <li>
                    <button className="clear-hidden-btn" style={{ marginTop: '0.25rem' }} onClick={() => setExcludedUrls(new Set())}>
                      Restore all
                    </button>
                  </li>
                </ul>
              )}
            </div>
          )}

          {/* ── Results ── */}
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
                <p>Could not load <code>./output.json</code>. Make sure the file exists and the page is served over HTTP.</p>
              </div>
            ) : !data ? (
              <div className="empty-state" role="status">
                <span className="empty-icon" aria-hidden="true">⏳</span>
                <p>Loading…</p>
              </div>
            ) : viewMode === 'by-page' ? (
              sortedPageEntries.length === 0 ? (
                <EmptyState hasData={allRows.length > 0} />
              ) : (
                <div className="results-list">
                  {sortedPageEntries.map(([page, links], i) => (
                    <PageGroup
                      key={`${page}-${defaultCollapsed}`}
                      page={page}
                      links={links}
                      index={i}
                      defaultOpen={!defaultCollapsed}
                      onExclude={excludeUrl}
                    />
                  ))}
                </div>
              )
            ) : (
              /* By-Link deduped view */
              sortedLinkEntries.length === 0 ? (
                <EmptyState hasData={allRows.length > 0} />
              ) : (
                <div className="results-list">
                  <ul className="dedupe-list">
                    {sortedLinkEntries.map((entry, i) => (
                      <LinkDedupeRow key={entry.url} entry={entry} onExclude={excludeUrl} />
                    ))}
                  </ul>
                </div>
              )
            )}
          </div>

        </main>
      </div>
    </>
  );
}