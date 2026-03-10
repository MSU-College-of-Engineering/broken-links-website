(function () {
  "use strict";

  /* ─── State ─────────────────────────────────────────────── */
  let state = {
    data: {},
    activeTab: "errors",
    search: "",
    codeFilter: "all",
    expanded: {},
  };

  /* ─── Config ─────────────────────────────────────────────── */
  const TABS = [
    { id: "errors", label: "Errors", mapKey: "error_map", color: "#e05555" },
    {
      id: "redirects",
      label: "Redirects",
      mapKey: "redirect_map",
      color: "#7BBD00",
    },
    {
      id: "excluded",
      label: "Excluded",
      mapKey: "excluded_map",
      color: "#0B9A6D",
    },
    {
      id: "suggestions",
      label: "Suggestions",
      mapKey: "suggestion_map",
      color: "#008934",
    },
  ];

  const STATS = [
    { key: "total", label: "Total", color: "#4d7a65" },
    { key: "successful", label: "Successful", color: "#0B9A6D" },
    { key: "redirects", label: "Redirects", color: "#7BBD00" },
    { key: "errors", label: "Errors", color: "#e05555" },
    { key: "cached", label: "Cached", color: "#008208" },
    { key: "excludes", label: "Excludes", color: "#008934" },
    { key: "timeouts", label: "Timeouts", color: "#d97f3c" },
    { key: "unknown", label: "Unknown", color: "#4d7a65" },
  ];

  /* ─── Helpers ────────────────────────────────────────────── */
  function badgeClass(code) {
    if (!code) return "badge-unknown";
    const p = Math.floor(code / 100);
    return (
      { 2: "badge-2xx", 3: "badge-3xx", 4: "badge-4xx", 5: "badge-5xx" }[p] ||
      "badge-unknown"
    );
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function flattenMap(map) {
    if (!map || typeof map !== "object") return [];
    return Object.entries(map).flatMap(([page, links]) => {
      const arr = Array.isArray(links)
        ? links
        : Object.entries(links).map(([url, status]) => ({ url, status }));
      return arr.map((link) => ({
        page,
        url: link.url ?? link,
        status: link.status ?? { code: 200, text: "OK" },
      }));
    });
  }

  function countMap(map) {
    return flattenMap(map).length;
  }
  function getTabRows(tab) {
    return flattenMap(state.data[tab.mapKey]);
  }

  function groupByPage(rows) {
    return rows.reduce((acc, row) => {
      (acc[row.page] ??= []).push(row);
      return acc;
    }, {});
  }

  /* ─── Render: Stats ─────────────────────────────────────── */
  function renderStats() {
    const total = state.data.total || 1;
    const grid = document.getElementById("stats-grid");
    grid.innerHTML = STATS.map((s, i) => {
      const val = state.data[s.key] ?? 0;
      const pct = Math.min(100, (val / total) * 100).toFixed(1);
      return `
        <article class="stat-card" role="listitem" style="animation-delay:${i * 40}ms">
          <span class="stat-label">${esc(s.label)}</span>
          <span class="stat-value" style="color:${s.color}">${val.toLocaleString()}</span>
          <div class="stat-bar" role="meter" aria-valuenow="${val}" aria-valuemin="0" aria-valuemax="${total}" aria-label="${s.label} percentage">
            <div class="stat-bar-fill" style="width:${pct}%;background:${s.color}"></div>
          </div>
        </article>`;
    }).join("");
  }

  /* ─── Render: Tabs ──────────────────────────────────────── */
  function renderTabs() {
    const tablist = document.getElementById("tablist");
    tablist.innerHTML = TABS.map((t) => {
      const count = countMap(state.data[t.mapKey]);
      const selected = t.id === state.activeTab;
      return `
        <button
          role="tab"
          class="tab-btn"
          id="tab-${t.id}"
          aria-selected="${selected}"
          aria-controls="tabpanel-${t.id}"
          data-tab="${t.id}"
          style="--tab-color:${t.color}"
          ${selected ? "" : 'tabindex="-1"'}
        >
          ${esc(t.label)}
          <span class="tab-count" aria-label="${count} items">${count}</span>
        </button>`;
    }).join("");
  }

  /* ─── Render: Code Filter Options ──────────────────────── */
  function populateCodeFilter() {
    const allRows = TABS.flatMap((t) => getTabRows(t));
    const codes = [
      ...new Set(allRows.map((r) => r.status?.code).filter(Boolean)),
    ].sort((a, b) => a - b);
    const sel = document.getElementById("code-filter");
    sel.innerHTML =
      '<option value="all">All codes</option>' +
      codes.map((c) => `<option value="${c}">${c}</option>`).join("");
    sel.value = state.codeFilter;
  }

  /* ─── Render: Results ───────────────────────────────────── */
  function renderResults() {
    const container = document.getElementById("results-container");
    const tab = TABS.find((t) => t.id === state.activeTab);
    const rows = getTabRows(tab);

    const q = state.search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      const matchSearch =
        !q ||
        row.page.toLowerCase().includes(q) ||
        row.url.toLowerCase().includes(q) ||
        String(row.status?.code).includes(q);
      const matchCode =
        state.codeFilter === "all" ||
        String(row.status?.code) === state.codeFilter;
      return matchSearch && matchCode;
    });

    const grouped = groupByPage(filtered);
    const pageCount = Object.keys(grouped).length;

    document.getElementById("filter-count").textContent =
      `${pageCount} page${pageCount !== 1 ? "s" : ""} · ${filtered.length} link${filtered.length !== 1 ? "s" : ""}`;

    if (pageCount === 0) {
      container.innerHTML = `
        <div class="empty-state" role="status">
          <span class="empty-icon" aria-hidden="true">∅</span>
          <p>${rows.length === 0 ? "No data for this category." : "No results match your filters."}</p>
        </div>`;
      return;
    }

    const html = Object.entries(grouped)
      .map(([page, links], gi) => {
        const isOpen = state.expanded[page] !== false;
        const codes = [...new Set(links.map((l) => l.status?.code))];
        const badgesHtml = codes
          .map(
            (c) =>
              `<span class="badge ${badgeClass(c)}" aria-label="HTTP ${c}">${c}</span>`,
          )
          .join("");

        const linksHtml = links
          .map(
            (link) => `
        <li class="link-row">
          <span class="badge ${badgeClass(link.status?.code)}" aria-label="HTTP status ${link.status?.code ?? "unknown"}">
            ${esc(link.status?.code ?? "?")}
          </span>
          <div class="link-info">
            <a href="${esc(link.url)}" class="link-href" target="_blank" rel="noopener noreferrer"
               title="${esc(link.url)}">${esc(link.url)}</a>
            ${link.status?.text ? `<p class="link-status-text">${esc(link.status.text)}</p>` : ""}
          </div>
        </li>`,
          )
          .join("");

        return `
        <article class="page-group" style="animation-delay:${gi * 30}ms">
          <button
            class="page-group-header"
            aria-expanded="${isOpen}"
            aria-controls="group-body-${gi}"
            data-page="${esc(page)}"
            title="${esc(page)}"
          >
            <span class="chevron" aria-hidden="true">▶</span>
            <span class="page-url">${esc(page)}</span>
            <span class="page-meta">
              ${badgesHtml}
              <span class="link-count">${links.length} link${links.length !== 1 ? "s" : ""}</span>
            </span>
          </button>
          <div id="group-body-${gi}" class="page-group-body" ${isOpen ? "" : "hidden"} role="region" aria-label="Links for ${esc(page)}">
            <ul>${linksHtml}</ul>
          </div>
        </article>`;
      })
      .join("");

    container.innerHTML = `<div class="results-list" id="tabpanel-${state.activeTab}" role="tabpanel" aria-labelledby="tab-${state.activeTab}">${html}</div>`;
  }

  /* ─── Header Meta ───────────────────────────────────────── */
  function renderMeta() {
    const d = state.data;
    const secs = d.duration_secs ?? "?";
    document.getElementById("header-meta").innerHTML =
      `Scanned <strong>${(d.total ?? 0).toLocaleString()}</strong> links in <strong>${secs}s</strong>`;
  }

  /* ─── Full Render ───────────────────────────────────────── */
  function render() {
    renderMeta();
    renderStats();
    renderTabs();
    populateCodeFilter();
    renderResults();
  }

  /* ─── Event: Tab click ──────────────────────────────────── */
  document.getElementById("tablist").addEventListener("click", (e) => {
    const btn = e.target.closest('[role="tab"]');
    if (!btn) return;
    state.activeTab = btn.dataset.tab;
    state.search = "";
    state.codeFilter = "all";
    state.expanded = {};
    document.getElementById("search-input").value = "";
    render();
    btn.focus();
  });

  document.getElementById("tablist").addEventListener("keydown", (e) => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const idx = tabs.indexOf(document.activeElement);
    if (idx === -1) return;
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    if (next !== -1) {
      e.preventDefault();
      tabs[next].click();
      tabs[next].focus();
    }
  });

  /* ─── Event: Search ─────────────────────────────────────── */
  let searchDebounce;
  document.getElementById("search-input").addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.search = e.target.value;
      renderResults();
    }, 150);
  });

  /* ─── Event: Code Filter ────────────────────────────────── */
  document.getElementById("code-filter").addEventListener("change", (e) => {
    state.codeFilter = e.target.value;
    renderResults();
  });

  /* ─── Event: Toggle page group ──────────────────────────── */
  document
    .getElementById("results-container")
    .addEventListener("click", (e) => {
      const btn = e.target.closest(".page-group-header");
      if (!btn) return;
      const page = btn.dataset.page;
      const body = document.getElementById(btn.getAttribute("aria-controls"));
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", !open);
      body.hidden = open;
      state.expanded[page] = !open;
    });

  /* ─── Keyboard shortcut: '/' to focus search ─────────────── */
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
      e.preventDefault();
      document.getElementById("search-input").focus();
    }
  });

  /* ─── Boot: fetch output.json ───────────────────────────── */
  fetch("./output.json")
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      state.data = data;
      render();
    })
    .catch((err) => {
      document.getElementById("header-meta").textContent =
        `Failed to load output.json: ${err.message}`;
      document.getElementById("results-container").innerHTML = `
        <div class="empty-state" role="status">
          <span class="empty-icon" aria-hidden="true">⚠</span>
          <p>Could not load <code>./src/assets/output.json</code>. Make sure the file exists and the page is served over HTTP.</p>
        </div>`;
    });
})();
