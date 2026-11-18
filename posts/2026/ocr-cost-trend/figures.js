// Figures for the OCR cost-trend post.
// Ported from the figure-options page (chart/interactive/blog-figure-options.html).
// Each figure function takes its control values and a width, and returns one DOM
// element: title, legend, chart(s) and notes. Plot and d3 are passed in from the
// OJS cells so the versions are pinned in one place.

export function makeFigures(DATA, Plot, d3) {
  const PRICE = DATA.meta.price_per_hour;
  const PTS = DATA.page_types; // books, dense, typed
  const PT_KEYS = PTS.map(p => p.key);
  const PT_LABEL = { all: "All 850 pages", books: "Book pages", dense: "Dense print", typed: "Typed pages" };
  const PT_LOWER = { all: "all 850 pages", books: "book pages", dense: "dense print", typed: "typed pages" };
  const PT_N = Object.fromEntries(PTS.map(p => [p.key, p.n]));
  PT_N.all = d3.sum(PTS, p => p.n);
  const SYMBOL = { books: "circle", dense: "square", typed: "triangle" };

  const parseDate = s => new Date(s + "T00:00:00Z");
  const models = DATA.models.map(m => ({ ...m, date: parseDate(m.release) }));
  const bySlug = Object.fromEntries(models.map(m => [m.slug, m]));
  const byRelease = [...models].sort((a, b) => a.date - b.date);
  const first = byRelease[0];
  const newest = byRelease[byRelease.length - 1];
  const baseline = bySlug[DATA.baseline];
  const variant = DATA.variant;
  const fmtMonth = d3.utcFormat("%b %Y");
  const fmtDay = d3.utcFormat("%-d %b %Y");
  const MONTH_MS = 86400000 * 30.4375;

  // Light theme tokens (the blog uses the light Cosmo theme only).
  const T = {
    bg: "#ffffff", ink: "#1d1f21", ink2: "#44484d", ink3: "#63686e", rule: "#cfd2d5", grid: "#ebecec",
    mark: "#7d8389", markLight: "#c3c7cb", markDark: "#4f545a", accent: "#0f766e", heat: "#d9924a",
    font: "inherit",
    pt: { books: "#3a6ea5", dense: "#b5762a", typed: "#7a5aa0" }
  };

  // ---------- formatting ----------
  function money(v) {
    if (v == null || isNaN(v)) return "n/a";
    if (v >= 1000) return d3.format("$,.0f")(v);
    if (v >= 100) return "$" + v.toFixed(0);
    if (v >= 0.1) return "$" + v.toFixed(2);
    return "$" + v.toFixed(3);
  }
  const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
  const times = v => v.toFixed(1) + "×";
  const intf = d3.format(",");
  function plainNum(v) { return v >= 1e6 ? (v / 1e6).toLocaleString("en-GB", { maximumFractionDigits: 1 }) + " million" : intf(Math.round(v)); }
  function duration(sec) {
    if (sec < 90) return Math.round(sec) + " seconds";
    if (sec < 5400) return Math.round(sec / 60) + " minutes";
    if (sec < 2 * 86400) return (sec / 3600).toFixed(sec < 36000 ? 1 : 0) + " hours";
    return (sec / 86400).toFixed(sec < 864000 ? 1 : 0) + " days";
  }
  function logTicks(domain, narrow) {
    const all = narrow ? [0.01, 0.05, 0.1, 0.5, 1, 5] : [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];
    return all.filter(t => t >= domain[0] && t <= domain[1]);
  }
  const tickMoney = v => (v < 0.1 ? "$" + v.toFixed(2).replace(/0$/, "") : "$" + v.toFixed(2));
  function costAll(m) { return m.cost.all; }
  function ppsAll(m) { // page-weighted harmonic rate for all pages
    const secs = d3.sum(PT_KEYS, k => PT_N[k] / m.pages_per_s[k]);
    return PT_N.all / secs;
  }
  function cappedAll(m) { return d3.sum(PT_KEYS, k => m.capped_share[k] * PT_N[k]) / PT_N.all; }

  function style() {
    return { background: "transparent", color: T.ink3, fontFamily: T.font, fontSize: "13px", overflow: "visible" };
  }
  const tipOpts = () => ({ fill: T.bg, stroke: T.rule, fontSize: 13, textPadding: 7 });
  function ptColor() { return { domain: PT_KEYS, range: PT_KEYS.map(k => T.pt[k]) }; }
  function ptSymbol() { return { domain: PT_KEYS, range: PT_KEYS.map(k => SYMBOL[k]) }; }

  // ---------- DOM helpers ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function shapeSVG(shape, color, hollow, outline) {
    const f = hollow ? "none" : color, s = color;
    const body = {
      circle: `<circle cx="7" cy="7" r="5" fill="${f}" stroke="${s}" stroke-width="1.5"/>`,
      square: `<rect x="2.5" y="2.5" width="9" height="9" fill="${f}" stroke="${s}" stroke-width="1.5"/>`,
      triangle: `<path d="M7 1.8 L12.4 11.6 L1.6 11.6 Z" fill="${f}" stroke="${s}" stroke-width="1.5"/>`,
      line: `<line x1="0" y1="7" x2="14" y2="7" stroke="${s}" stroke-width="2"/>`,
      dash: `<line x1="0" y1="7" x2="14" y2="7" stroke="${s}" stroke-width="2" stroke-dasharray="4 3"/>`,
      bar: `<rect x="0.5" y="3.5" width="13" height="7" fill="${f}"${outline ? ` stroke="${T.rule}"` : ""}/>`
    }[shape];
    return `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">${body}</svg>`;
  }
  function legendEl(items) {
    const d = el("div", "ocf-legend");
    d.innerHTML = items.map(i => `<span>${shapeSVG(i.shape, i.color, i.hollow, i.outline)}${i.label}</span>`).join("");
    return d;
  }
  const ptLegendItems = () => PT_KEYS.map(k => ({ shape: SYMBOL[k], color: T.pt[k], label: PT_LABEL[k] }));
  // Assemble a figure: title, legend, one or more charts (panels), notes.
  function figure({ title, legend, charts, panels, notes }) {
    const f = el("div", "ocf");
    if (title) f.append(el("p", "ocf-title", title));
    if (legend) f.append(legendEl(legend));
    if (charts) charts.forEach(c => { const d = el("div", "ocf-chart"); d.append(c); f.append(d); });
    if (panels) {
      const p = el("div", "ocf-panels");
      panels.forEach(({ label, node }) => {
        const d = el("div");
        if (label) d.append(el("p", "ocf-panel-title", label));
        const c = el("div", "ocf-chart"); c.append(node); d.append(c);
        p.append(d);
      });
      f.append(p);
    }
    (notes || []).filter(Boolean).forEach(n => f.append(el("p", "ocf-notes", n)));
    return f;
  }

  const SETUP_MARKS = { "paddleocr-vl": "¹", "deepseek-ocr": "²", "glm-ocr": "³" };
  function setupMark(m) { return SETUP_MARKS[m.slug] || ""; }
  const NOISE_TEXT = pt => (pt === "all" ? "Differences under about a quarter between models are not meaningful." : "For one page type, differences under about a half between models are not meaningful.");
  function judgeNote(pt) {
    const sp = DATA.judge_split_share;
    const lo = d3.min(PT_KEYS, k => sp[k]), hi = d3.max(PT_KEYS, k => sp[k]);
    let t = `On ${PT_LOWER[pt]}, ${pct(sp[pt], 0)} of pages got opposite verdicts in the two display orders (${pct(lo, 0)} to ${pct(hi, 0)} across page types); these count as no clear preference.`;
    const j = newest.judge && newest.judge[pt];
    if (j && j.win_share_decisive > 0.5 && j.ci95[0] < 0.5) t += ` The newest model's preference here is weak: ${j.model_wins} pages against ${j.baseline_wins}, ${j.no_clear} undecided.`;
    return t;
  }
  function cerNote() {
    const b = baseline.cer_books.tolerant;
    const worse = models.filter(m => m.cer_books.tolerant / b >= 1.4);
    return `Accuracy is measured on the ${DATA.meta.books_pages_with_gt} book pages with checked transcriptions only. All medians are under 1%. ` +
      worse.map(m => `${m.name} has ${(m.cer_books.tolerant / b).toFixed(1)} times`).join(" and ") + ` the April 2025 model's median; a paired comparison shows ${worse.length > 1 ? "these differences are" : "this difference is"} real.`;
  }
  function setupEffectText(m) {
    const e = m.setup_effect;
    return `${m.name} ran with its plain-text prompt. With its default document prompt, the share of pages that hit the limit falls on book pages from ${pct(e.capped_share_plain.books)} to ${pct(e.capped_share_default.books)}, on dense print from ${pct(e.capped_share_plain.dense)} to ${pct(e.capped_share_default.dense)} and on typed pages from ${pct(e.capped_share_plain.typed)} to ${pct(e.capped_share_default.typed)}, and its median error on book pages rises from ${pct(e.cer_tolerant_plain, 2)} to ${pct(e.cer_tolerant_default, 2)}. So most of its book-page figure here comes from my prompt choice.`;
  }
  const SETUP_NOTE_TEXT = () => models.filter(m => m.setup_note).sort((a, b) => setupMark(a).localeCompare(setupMark(b))).map(m => `${setupMark(m)} ` + (m.setup_effect ? setupEffectText(m) : `${m.name}: ${m.setup_note.replace(/\.$/, "")}; its results may partly reflect this setup.`)).join(" ");
  function fitLog(points) { // points: [months, cost]
    const xs = points.map(p => p[0]), ys = points.map(p => Math.log2(p[1]));
    const mx = d3.mean(xs), my = d3.mean(ys);
    const b = d3.sum(xs, (x, i) => (x - mx) * (ys[i] - my)) / d3.sum(xs, x => (x - mx) ** 2);
    const a = my - b * mx;
    const ssr = d3.sum(xs, (x, i) => (ys[i] - (a + b * x)) ** 2), sst = d3.sum(ys, y => (y - my) ** 2);
    return { a, b, r2: 1 - ssr / sst, at: d => 2 ** (a + b * (d.getTime() / MONTH_MS)) };
  }
  function dodge(items, gap) {
    const s = [...items].sort((a, b) => a.py - b.py);
    if (s.length) s[0].ly = s[0].py;
    for (let i = 1; i < s.length; i++) s[i].ly = Math.max(s[i].py, s[i - 1].ly + gap);
    return items;
  }
  function facetLabels(domain, ml) {
    return Plot.text(domain, { fy: d => d, text: d => d, frameAnchor: "top-left", textAnchor: "start", dy: -14, dx: -ml, fill: T.ink2, fontWeight: 600, fontSize: 12.5 });
  }
  const clampW = w => Math.min(900, Math.max(280, w || 600));

  // =====================================================================
  // A. Cost over time
  // =====================================================================
  function figA({ pt = "all", showVar = false, showTrend = false }, width) {
    const w = clampW(width), narrow = w < 560;
    const pts = byRelease.map(m => ({ m, x: m.date, y: m.cost[pt] }));
    const vPoint = { x: first.date, y: variant.cost[pt], y0: first.cost[pt] };
    const fit = fitLog(pts.map(p => [p.x.getTime() / MONTH_MS, p.y]));
    const trendEnd = parseDate("2027-12-31");
    const xEnd = showTrend ? trendEnd : parseDate("2026-12-15");
    const proj = fit.at(trendEnd);
    let ymin = d3.min(pts, p => p.y), ymax = d3.max(pts, p => p.y);
    if (showVar) ymin = Math.min(ymin, vPoint.y);
    if (showTrend) { ymin = Math.min(ymin, proj); ymax = Math.max(ymax, fit.at(first.date)); }
    const yDomain = [ymin * (showTrend ? 0.55 : 0.72), ymax * 1.35];

    let run = Infinity;
    const steps = pts.map(p => ({ x: p.x, y: (run = Math.min(run, p.y)) }));
    steps.push({ x: xEnd, y: run });

    const mid = pts.slice(2, -1);
    const midMin = d3.min(mid, p => p.y), midMax = d3.max(mid, p => p.y);
    const midIsGroup = midMax / midMin < 1.25;

    const marks = [Plot.gridY(logTicks(yDomain, narrow), { stroke: T.grid, strokeOpacity: 1 })];
    if (midIsGroup) {
      marks.push(
        Plot.rect([0], { x1: d3.utcDay.offset(mid[0].x, -20), x2: d3.utcDay.offset(mid[mid.length - 1].x, 20), y1: midMin * 0.93, y2: midMax * 1.07, fill: T.grid, fillOpacity: 1 }),
        narrow ? null : Plot.text([`${mid.length} models, ${fmtMonth(mid[0].x)} to ${fmtMonth(mid[mid.length - 1].x)}:\ntoo close to rank`], { x: d3.utcDay.offset(mid[mid.length - 1].x, 20), y: midMax * 1.07, textAnchor: "end", dy: -16, fill: T.ink3, fontSize: 12, lineHeight: 1.1 })
      );
    }
    marks.push(Plot.line(steps, { x: "x", y: "y", curve: "step-after", stroke: T.markLight, strokeWidth: 2 }));
    if (showTrend) {
      const months = d3.utcMonth.range(first.date, d3.utcDay.offset(newest.date, 1)).concat([newest.date]);
      const ahead = d3.utcMonth.range(newest.date, trendEnd).concat([trendEnd]);
      marks.push(
        Plot.line(months.map(d => ({ x: d, y: fit.at(d) })), { x: "x", y: "y", stroke: T.ink3, strokeWidth: 1.5, strokeDasharray: "5 4" }),
        Plot.line(ahead.map(d => ({ x: d, y: fit.at(d) })), { x: "x", y: "y", stroke: T.ink3, strokeWidth: 1.5, strokeDasharray: "1.5 4" }),
        Plot.dot([{ x: trendEnd, y: proj }], { x: "x", y: "y", r: 3, fill: T.ink3 }),
        Plot.text([{ x: trendEnd, y: proj }], {
          x: "x", y: "y", textAnchor: "end", lineAnchor: "top", dy: 10, fill: T.ink2, fontSize: 12, lineHeight: 1.15,
          text: () => `1 million pages: about $${Math.round(proj * 1000)}?\nby end of 2027, if the trend held`
        })
      );
    }
    if (showVar) {
      marks.push(
        Plot.link([vPoint], { x1: "x", x2: "x", y1: "y0", y2: "y", stroke: T.mark, strokeWidth: 1 }),
        Plot.dot([vPoint], { x: "x", y: "y", r: 5, fill: T.bg, stroke: T.mark, strokeWidth: 1.5,
          title: () => `${variant.name}\nSame model, page image 1,288 px\n${money(vPoint.y)} per 1,000 pages (${PT_LOWER[pt]})\n${times(vPoint.y0 / vPoint.y)} cheaper than at 2,048 px`, tip: tipOpts() }),
        narrow ? null : Plot.text([vPoint], { x: "x", y: "y", text: () => "same model\nat 1,288 px", textAnchor: "start", dx: 9, dy: 2, fill: T.ink3, fontSize: 12, lineHeight: 1.1 })
      );
    }
    marks.push(
      Plot.dot(pts, {
        x: "x", y: "y", r: 5, fill: p => (p.m === newest ? T.accent : T.mark), stroke: T.bg, strokeWidth: 1,
        title: p => `${p.m.name}\nreleased ${fmtDay(p.x)}\n${money(p.y)} per 1,000 pages (${PT_LOWER[pt]})\n${(pt === "all" ? ppsAll(p.m) : p.m.pages_per_s[pt]).toFixed(1)} pages a second`,
        tip: tipOpts()
      }),
      Plot.text([pts[0]], { x: "x", y: "y", text: p => `${p.m.name}\n${fmtMonth(p.x)}`, textAnchor: "start", dx: 9, dy: -14, fill: T.ink, fontSize: 12.5, lineHeight: 1.1 }),
      Plot.text([pts[pts.length - 1]], { x: "x", y: "y", text: p => `${p.m.name}\n${fmtMonth(p.x)}`, textAnchor: "end", dx: -10, dy: 2, fill: T.ink, fontSize: 12.5, fontWeight: 600, lineHeight: 1.1 })
    );
    const plot = Plot.plot({
      width: w, height: narrow ? 340 : 400, marginLeft: 50, marginRight: 16, marginTop: 24, marginBottom: 36, style: style(),
      ariaLabel: "Cost per 1,000 pages by model release date",
      x: { type: "utc", domain: [parseDate("2025-02-15"), xEnd], ticks: d3.utcMonth.every(narrow ? (showTrend ? 12 : 6) : (showTrend ? 6 : 3)), tickFormat: narrow ? d3.utcFormat("%b %y") : fmtMonth, label: null },
      y: { type: "log", domain: yDomain, ticks: logTicks(yDomain, false), tickFormat: tickMoney, label: "$ per 1,000 pages (lower is cheaper)", labelAnchor: "top", labelArrow: "none" },
      marks
    });
    const ratio = first.cost[pt] / newest.cost[pt];
    const title = `Reading 1,000 ${pt === "all" ? "pages" : PT_LOWER[pt]} fell from ${money(first.cost[pt])} with the April 2025 model to ${money(newest.cost[pt])} with the newest, ${ratio.toFixed(1)} times less at the same image size` +
      (showVar ? `; about ${(variant.cost[pt] / newest.cost[pt]).toFixed(1)} times less against the April 2025 model's smaller-image setting` : "");
    const leg = [
      { shape: "circle", color: T.mark, label: "one model, at its release date" },
      { shape: "circle", color: T.accent, label: "newest model" },
      { shape: "line", color: T.markLight, label: "cheapest so far" }
    ];
    if (midIsGroup) leg.push({ shape: "bar", color: T.grid, outline: true, label: `${mid.length} models released ${fmtMonth(mid[0].x)} to ${fmtMonth(mid[mid.length - 1].x)}, ${money(midMin)} to ${money(midMax)}: too close to rank` });
    if (showVar) leg.push({ shape: "circle", color: T.mark, hollow: true, label: "April 2025 model, 1,288 px image" });
    if (showTrend) leg.push({ shape: "dash", color: T.ink3, label: `fitted trend: halves every ${(-1 / fit.b).toFixed(1)} months (dotted: continued)` });
    const notes = `Cost at $${PRICE.toFixed(2)} an hour from a 10-minute steady feed per page type; server start not included. Release date = date the model's Hub repository was created. Hover a dot for exact values. ${NOISE_TEXT(pt)}` +
      (showVar && midIsGroup && vPoint.y >= midMin * 0.93 && vPoint.y <= midMax * 1.07 ? ` The hollow dot, the April 2025 model with 1,288 px images, costs ${money(vPoint.y)}: inside the ${money(midMin)} to ${money(midMax)} range of the ${mid.length} later models.` : "") +
      (showTrend ? ` Trend: least-squares line through the eight log costs, R² ${fit.r2.toFixed(2)}. It rests on eight points, one of which does most of the work; treat the projection as a toy.` : "");
    return figure({ title, legend: leg, charts: [plot], notes: [notes] });
  }

  // =====================================================================
  // B. Cost by page type
  // =====================================================================
  function figB({ order = "release" }, width) {
    const w = clampW(width), narrow = w < 560;
    const ord = (order === "cost" ? [...models].sort((a, b) => costAll(a) - costAll(b)) : byRelease).map(m => m.name);
    const rows = models.flatMap(m => PT_KEYS.map(k => ({ m, name: m.name, pt: k, cost: m.cost[k] })));
    const spans = models.map(m => {
      const c = PT_KEYS.map(k => m.cost[k]);
      const hi = PT_KEYS[c.indexOf(d3.max(c))], lo = PT_KEYS[c.indexOf(d3.min(c))];
      return { m, name: m.name, min: d3.min(c), max: d3.max(c), ratio: d3.max(c) / d3.min(c), hi, lo };
    });
    const xDomain = [0.05, 1.1];
    const plot = Plot.plot({
      width: w, height: 40 + ord.length * (narrow ? 34 : 38), marginLeft: narrow ? 112 : 130, marginRight: 8, marginTop: 8, marginBottom: 38, style: style(),
      ariaLabel: "Cost per page type for each model",
      x: { type: "log", domain: xDomain, ticks: logTicks(xDomain, narrow), tickFormat: tickMoney, label: "$ per 1,000 pages (lower is cheaper)", labelAnchor: "center", labelArrow: "none" },
      y: { domain: ord, label: null, tickSize: 0, tickFormat: n => n },
      color: ptColor(), symbol: ptSymbol(),
      marks: [
        Plot.gridX(logTicks(xDomain, narrow), { stroke: T.grid, strokeOpacity: 1 }),
        Plot.ruleY(spans, { y: "name", x1: "min", x2: "max", stroke: T.markLight, strokeWidth: 2 }),
        Plot.dot(rows, {
          x: "cost", y: "name", fill: "pt", symbol: "pt", r: 5.5, stroke: T.bg, strokeWidth: 1,
          title: d => `${d.name}, ${PT_LOWER[d.pt]}\n${money(d.cost)} per 1,000 pages\n${d.m.pages_per_s[d.pt].toFixed(1)} pages a second`, tip: tipOpts()
        }),
        Plot.text(spans, { y: "name", x: "max", text: d => times(d.ratio), dx: 10, textAnchor: "start", fill: T.ink3, fontSize: 12 })
      ]
    });
    const maxR = d3.max(spans, s => s.ratio);
    const dearest = d3.rollups(spans, v => v.length, s => s.hi).sort((a, b) => b[1] - a[1]);
    return figure({
      title: `Page type moves cost by up to ${maxR.toFixed(1)} times, and the dearest page type differs by model`,
      legend: ptLegendItems(), charts: [plot],
      notes: [`The number at the end of each row is the dearest page type divided by the cheapest. Dearest page type: ${dearest.map(([k, n]) => `${PT_LOWER[k]} for ${n} model${n > 1 ? "s" : ""}`).join(", ")}. Cost at $${PRICE.toFixed(2)} an hour; ${PT_N.books} book pages, ${PT_N.dense} dense-print pages, ${PT_N.typed} typed pages. ${NOISE_TEXT("books")}`]
    });
  }

  // =====================================================================
  // C. Cost against quality
  // =====================================================================
  const C_OPTIONS = new Map([
    ["Error rate, books, without headers", "cer_tol"],
    ["Error rate, books, plain", "cer_plain"],
    ["Judge preference, book pages", "judge_books"],
    ["Judge preference, typed documents", "judge_typed"],
    ["Judge preference, dense print", "judge_dense"]
  ]);
  function figC({ q = "cer_tol" }, width) {
    const w = clampW(width), narrow = w < 560;
    const isJudge = q.startsWith("judge");
    const pt = isJudge ? q.split("_")[1] : "books";
    let pts, yOpts, yLab, refMarks = [], titleText;
    if (!isJudge) {
      const key = q === "cer_tol" ? "tolerant" : "plain";
      pts = models.map(m => ({ m, x: m.cost.books, y: m.cer_books[key], lo: m.cer_books[key + "_ci95"][0], hi: m.cer_books[key + "_ci95"][1] }));
      const yMax = d3.max(pts, p => p.hi) * 1.12;
      yOpts = { domain: [0, yMax], reverse: true, tickFormat: v => (v * 100).toFixed(1) + "%", ticks: narrow ? 4 : 6 };
      yLab = `Median character error rate, ${DATA.meta.books_pages_with_gt} book pages (up is fewer errors)`;
      const lo = d3.min(pts, p => p.y), hi = d3.max(pts, p => p.y);
      titleText = key === "tolerant"
        ? `On book pages, every model's median error rate is under 1%, from ${pct(lo, 2)} to ${pct(hi, 2)} of characters, whatever it costs`
        : `Counting running headers and page numbers, error rates spread from ${pct(lo, 1)} to ${pct(hi, 1)}; this mostly measures whether a model copies the header`;
    } else {
      pts = models.filter(m => m.judge).map(m => {
        const j = m.judge[pt];
        return { m, x: m.cost[pt], y: j.win_share_decisive, lo: j.ci95[0], hi: j.ci95[1], j };
      });
      yOpts = { domain: [0, 1], tickFormat: v => Math.round(v * 100) + "%", ticks: narrow ? 4 : 5 };
      yLab = "Preferred over the April 2025 model, share of decisive pages (up is better)";
      refMarks = [
        Plot.ruleY([0.5], { stroke: T.mark, strokeWidth: 1, strokeDasharray: "3 3" }),
        Plot.dot([{ x: baseline.cost[pt], y: 0.5 }], { x: "x", y: "y", r: 5, fill: T.bg, stroke: T.mark, strokeWidth: 1.5,
          title: () => `${baseline.name} (April 2025), the baseline\n${money(baseline.cost[pt])} per 1,000 pages (${PT_LOWER[pt]})\nLevel with itself by definition`, tip: tipOpts() }),
        Plot.text([{ x: baseline.cost[pt], y: 0.5 }], { x: "x", y: "y", text: () => `${baseline.name}, the baseline`, dy: 14, textAnchor: "end", dx: 4, fill: T.ink3, fontSize: 12 })
      ];
      const better = pts.filter(p => p.y > 0.5).length;
      titleText = better === 0 ? `On ${PT_LOWER[pt]}, none of the ${pts.length} later models was preferred over the April 2025 model more often than not` : `On ${PT_LOWER[pt]}, ${better} of ${pts.length} later models were preferred over the April 2025 model more often than not`;
    }
    const allX = pts.map(p => p.x).concat(isJudge ? [baseline.cost[pt]] : []);
    const xDomain = [d3.min(allX) * 0.75, d3.max(allX) * (isJudge ? 1.3 : 1.6)];
    const label = isJudge ? [newest] : [newest, baseline];
    const plot = Plot.plot({
      width: w, height: narrow ? 340 : 380, marginLeft: 50, marginRight: 16, marginTop: 30, marginBottom: 40, style: style(),
      ariaLabel: "Cost against quality for each model",
      x: { type: "log", domain: xDomain, ticks: logTicks(xDomain, narrow), tickFormat: tickMoney, label: `$ per 1,000 ${PT_LOWER[pt]} (lower is cheaper)`, labelAnchor: "center", labelArrow: "none" },
      y: { ...yOpts, label: narrow ? yLab.replace(/, .*?\(/, " (") : yLab, labelAnchor: "top", labelArrow: "none" },
      marks: [
        Plot.gridY({ stroke: T.grid, strokeOpacity: 1, ticks: yOpts.ticks }),
        ...refMarks,
        Plot.ruleX(pts, { x: "x", y1: "lo", y2: "hi", stroke: T.markLight, strokeWidth: 2 }),
        Plot.dot(pts, {
          x: "x", y: "y", r: 5.5, fill: p => (p.m === newest ? T.accent : T.mark), stroke: T.bg, strokeWidth: 1,
          title: p => isJudge
            ? `${p.m.name}, ${PT_LOWER[pt]}\nPreferred on ${p.j.model_wins} pages, the April 2025 model on ${p.j.baseline_wins}, no clear preference on ${p.j.no_clear} (of ${p.j.pages})\n${pct(p.y, 0)} of decisive pages (95% interval ${pct(p.lo, 0)} to ${pct(p.hi, 0)})\n${money(p.x)} per 1,000 pages`
            : `${p.m.name}\nMedian error rate ${pct(p.y, 2)} (95% interval ${pct(p.lo, 2)} to ${pct(p.hi, 2)})\n${money(p.x)} per 1,000 book pages`,
          tip: tipOpts()
        }),
        Plot.text(pts.filter(p => p.m === newest), { x: "x", y: "y", text: p => p.m.name, dx: 10, textAnchor: "start", dy: -10, fill: T.ink, fontSize: 12.5, fontWeight: 600 }),
        Plot.text(pts.filter(p => p.m !== newest && label.includes(p.m)), { x: "x", y: "y", text: p => p.m.name, dx: 10, textAnchor: "start", dy: 0, fill: T.ink, fontSize: 12.5 }),
        Plot.text(["↖ cheaper and better"], { frameAnchor: "top-left", dx: 6, dy: 6, fill: T.ink3, fontSize: 12 })
      ]
    });
    const leg = [
      { shape: "circle", color: T.mark, label: "one model" },
      { shape: "circle", color: T.accent, label: "newest model" },
      { shape: "line", color: T.markLight, label: "95% interval" }
    ].concat(isJudge ? [{ shape: "circle", color: T.mark, hollow: true, label: "April 2025 baseline" }] : []);
    const notes = isJudge
      ? `Judge = a vision model (Qwen3.8-27B) shown the page image and both outputs, in both display orders, on 50 pages per page type. "Decisive" leaves out pages with no clear preference or where the verdict flipped with display order. The judge picked the lower-error side in 82% of book-page pairs where it gave a clear verdict and the error rates differed by at least half a point. ${judgeNote(pt)}`
      : `Median character error rate on the ${DATA.meta.books_pages_with_gt} book pages with human-corrected transcriptions, with bootstrap 95% intervals. "Without headers" does not count running headers and page numbers. Cost axis is book pages. ${cerNote()}`;
    return figure({ title: titleText, legend: leg, charts: [plot], notes: [notes] });
  }

  // =====================================================================
  // Chain: three steps, GLM-OCR on the Britannica pages
  // =====================================================================
  function figChain(width) {
    const w = clampW(width), narrow = w < 560;
    const C = DATA.chain;
    const steps = C.steps.map((s, i) => ({ ...s, i, label: `${i + 1}. ${s.label}` }));
    const ml = narrow ? 150 : 190;
    const plot = Plot.plot({
      width: w, height: 40 + steps.length * 62, marginLeft: ml, marginRight: narrow ? 46 : 60, marginTop: 8, marginBottom: 36, style: style(),
      ariaLabel: "Cost per 1,000 Britannica pages at three steps",
      y: { domain: steps.map(s => s.label), label: null, tickSize: 0, padding: 0.35, tickFormat: d => d },
      x: { domain: [0, 1.75], ticks: narrow ? 4 : 8, tickFormat: v => "$" + v.toFixed(2), label: "$ per 1,000 Britannica pages (lower is cheaper)", labelAnchor: "center", labelArrow: "none" },
      marks: [
        Plot.gridX({ stroke: T.grid, strokeOpacity: 1, ticks: narrow ? 4 : 8 }),
        Plot.barX(steps, {
          y: "label", x: "cost", fill: s => (s.key === "newest" ? T.accent : T.mark),
          title: s => `${s.label}\n${s.detail}\n${money(s.cost)} per 1,000 pages\nmodel: ${s.model}`, tip: tipOpts()
        }),
        Plot.text(steps, { y: "label", x: "cost", text: s => money(s.cost), dx: 6, textAnchor: "start", fill: T.ink, fontSize: 12.5, fontWeight: 600 }),
        Plot.text(steps.slice(1), { y: "label", x: "cost", text: s => `${(steps[s.i - 1].cost / s.cost).toFixed(1)}× cheaper`, dx: 6, dy: 15, textAnchor: "start", fill: T.ink3, fontSize: 12 })
      ]
    });
    return figure({
      title: `GLM-OCR on ${C.pages} Britannica pages: ${money(steps[0].cost)} the February way, ${money(steps[1].cost)} the way I run it now, ${money(steps[2].cost)} with the newest model`,
      charts: [plot],
      notes: steps.map(s => `${s.label}: ${s.detail}.`).concat([`Step 1 is the February 2026 script rebuilt with packages from that date; its cost counts inference only. Steps 2 and 3 are the main benchmark setup.`])
    });
  }

  // =====================================================================
  // F. Image size
  // =====================================================================
  function figF({ pt = "all" }, width) {
    const full = clampW(width);
    const side = full >= 680;
    const w = side ? Math.floor((full - 28) / 2) : full;
    const narrow = w < 360;
    const X = ["1,288 px", "2,048 px", "Native scan"];
    const series = [
      { name: baseline.name, a: X[0], b: X[1], ca: variant.cost[pt], cb: baseline.cost[pt], ea: variant.cer_books.tolerant, eb: baseline.cer_books.tolerant, eaci: variant.cer_books.tolerant_ci95, ebci: baseline.cer_books.tolerant_ci95, run: "final run" },
      ...DATA.native.map(n => ({ name: n.name, a: X[1], b: X[2], ca: n.fit.cost[pt], cb: n.native.cost[pt], ea: n.fit.cer_tolerant, eb: n.native.cer_tolerant, eaci: n.fit.cer_tolerant_ci95, ebci: n.native.cer_tolerant_ci95, run: "first run" }))
    ];
    function panel(kind) {
      const get = s => kind === "cost" ? [s.ca, s.cb] : [s.ea, s.eb];
      const all = series.flatMap(get);
      const height = 300, mt = 16, mb = 30;
      const yDomain = kind === "cost" ? [d3.min(all) * 0.8, d3.max(all) * 1.25] : [0, 0.0115];
      const yScale = (kind === "cost" ? d3.scaleLog() : d3.scaleLinear()).domain(yDomain).range([height - mb, mt]);
      const pts = series.flatMap(s => [{ s, x: s.a, y: get(s)[0], ci: s.eaci, end: "a" }, { s, x: s.b, y: get(s)[1], ci: s.ebci, end: "b" }]);
      const labs = series.map(s => {
        const left = s.name === baseline.name;
        const y = left ? get(s)[0] : get(s)[1];
        const r = get(s)[1] / get(s)[0];
        const txt = kind === "cost" ? `${s.name} ${times(r)}` : s.name;
        return { s, x: left ? s.a : s.b, y, py: yScale(y), left, txt };
      });
      dodge(labs.filter(l => !l.left), 14);
      labs.filter(l => l.left).forEach(l => { l.ly = l.py; });
      const yTicks = kind === "cost" ? logTicks(yDomain, false) : [0, 0.004, 0.008];
      return Plot.plot({
        width: w, height, marginLeft: kind === "cost" ? 46 : 40, marginRight: narrow ? 92 : 108, marginTop: mt, marginBottom: mb, style: style(),
        ariaLabel: kind === "cost" ? "Cost at each image size" : "Book-page error rate at each image size",
        x: { domain: X, type: "point", padding: 0.25, label: null, tickSize: 0, tickFormat: x => (narrow ? x.replace(" scan", "") : x) },
        y: kind === "cost"
          ? { type: "log", domain: yDomain, ticks: yTicks, tickFormat: tickMoney, label: null }
          : { domain: yDomain, ticks: yTicks, tickFormat: v => (v * 100).toFixed(1) + "%", label: null },
        marks: [
          Plot.gridY(yTicks, { stroke: T.grid, strokeOpacity: 1 }),
          Plot.line(pts, { x: "x", y: "y", z: d => d.s.name, stroke: T.mark, strokeWidth: 2 }),
          kind === "cer" ? Plot.ruleX(pts, { x: "x", y1: d => d.ci[0], y2: d => d.ci[1], stroke: T.markLight, strokeWidth: 2 }) : null,
          Plot.dot(pts, {
            x: "x", y: "y", r: 5, fill: T.mark, stroke: T.bg, strokeWidth: 1,
            title: d => kind === "cost"
              ? `${d.s.name} at ${d.x}\n${money(d.y)} per 1,000 pages (${PT_LOWER[pt]}, ${d.s.run})`
              : `${d.s.name} at ${d.x}\nmedian error rate ${pct(d.y, 2)} on book pages (95% interval ${pct(d.ci[0], 2)} to ${pct(d.ci[1], 2)})`,
            tip: tipOpts()
          }),
          Plot.text(labs.filter(l => l.left), { x: "x", y: "y", dy: 16, textAnchor: "middle", text: "txt", fill: T.ink2, fontSize: 12 }),
          Plot.text(labs.filter(l => !l.left), { x: "x", y: l => yScale.invert(l.ly), dx: 9, textAnchor: "start", text: "txt", fill: T.ink2, fontSize: 12 })
        ]
      });
    }
    const slices = pt === "all" ? PT_KEYS : [pt];
    const ratios = DATA.native.flatMap(n => slices.map(k => n.native.cost[k] / n.fit.cost[k]));
    const vr = slices.map(k => baseline.cost[k] / variant.cost[k]);
    const jd = variant.judge_vs_2048.dense;
    const judgeText = "Judge, " + baseline.name + " at 1,288 px against 2,048 px (50 pages each, smaller image wins to larger image wins): " +
      PT_KEYS.map(k => { const j = variant.judge_vs_2048[k]; return `${PT_LOWER[k]} ${j.wins_small} to ${j.wins_2048}`; }).join("; ") +
      `. On dense print the larger image was preferred on ${jd.wins_2048} pages and the smaller on ${jd.wins_small}.`;
    const cp = variant.cer_pairs_vs_2048;
    const vrText = vr.length === 1 ? `${vr[0].toFixed(1)} times` : `${d3.min(vr).toFixed(1)} to ${d3.max(vr).toFixed(1)} times`;
    return figure({
      title: `Native scan size cost ${d3.min(ratios).toFixed(1)} to ${d3.max(ratios).toFixed(1)} times more than 2,048 px with no gain on book pages; 1,288 px cut the cost by ${vrText} but lost on dense print`,
      panels: [
        { label: `Cost per 1,000 pages, ${PT_LOWER[pt]} (lower is cheaper)`, node: panel("cost") },
        { label: "Median error rate, book pages (lower is fewer errors)", node: panel("cer") }
      ],
      notes: [
        judgeText,
        `Each line is one model at two image sizes; the ratio after each name is right point divided by left point. Native-size costs come from the first run (2-minute feed, trimmed rate), compared with that run's 2,048 px costs; the 1,288 px comparison is from the final run. Error bars are 95% intervals. Page by page, 1,288 px was worse than 2,048 px by more than 0.5 points on ${cp.small_worse} of ${cp.pages} book pages and better on ${cp.small_better}.`
      ]
    });
  }

  // =====================================================================
  // H. Small models on small GPUs
  // =====================================================================
  function figH(width) {
    const full = clampW(width);
    const side = full >= 680;
    const w = side ? Math.floor((full - 28) / 2) : full;
    const S = DATA.small;
    const order = ["lighton-ocr3", "olmocr2", "rolmocr"];
    const weights = {};
    S.runs.forEach(r => { if (r.weights_gib) weights[r.slug] = r.weights_gib; });
    const short = { "lighton-ocr3": "LightOnOCR-3", olmocr2: "olmOCR-2 (8-bit)", rolmocr: "RolmOCR" };
    const rows = S.cards.flatMap(c => order.map(slug => {
      const run = S.runs.find(r => r.slug === slug && r.card === c.key);
      const wg = weights[slug];
      const status = run ? "run" : (wg > c.memory_gib ? "does not fit" : "not run");
      return { card: c, cardLabel: `${c.label}, $${c.price_per_hour.toFixed(2)}/h`, slug, name: short[slug], m: bySlug[slug], run, wg, status, left: c.memory_gib - wg };
    }));
    const fy = { domain: S.cards.map(c => `${c.label}, $${c.price_per_hour.toFixed(2)}/h`), label: null };
    const common = { height: 56 + rows.length * 30, marginTop: 22, marginBottom: 34, style: style() };
    const yOpts = { domain: order.map(s => short[s]), label: null, tickSize: 0, padding: 0.25 };
    const memMax = 24;
    const p1 = Plot.plot({
      ...common, width: w, marginLeft: 118, marginRight: 8,
      ariaLabel: "GPU memory taken by model weights",
      fy: { ...fy, axis: null, padding: 0.3 }, y: yOpts,
      x: { domain: [0, memMax], ticks: [0, 8, 16, 24], label: "GiB", labelAnchor: "right", labelArrow: "none" },
      facet: { label: null },
      marks: [
        facetLabels(fy.domain, 118),
        Plot.barX(rows, { fy: "cardLabel", y: "name", x1: 0, x2: d => d.card.memory_gib, fill: T.grid, stroke: T.rule, strokeWidth: 1 }),
        Plot.barX(rows, {
          fy: "cardLabel", y: "name", x1: 0, x2: "wg", fill: d => (d.status === "does not fit" ? T.markLight : d.slug === newest.slug ? T.accent : T.mark), insetTop: 3, insetBottom: 3,
          title: d => `${d.m.name} on ${d.card.label}\nweights ${d.wg.toFixed(1)} GiB of about ${d.card.memory_gib} GiB` +
            (d.status === "does not fit" ? "\nthe weights alone do not fit; not run" : d.status === "not run" ? `\n${d.left.toFixed(1)} GiB left after weights; not run` :
              `\n${d.left.toFixed(1)} GiB left after weights\ncache for ${intf(d.run.kv_cache_tokens)} tokens, about ${intf(Math.round(d.run.kv_cache_tokens / S.typical_page_tokens))} typical pages\nthe client kept ${S.client_in_flight} pages in flight`),
          tip: tipOpts()
        }),
        Plot.text(rows, { fy: "cardLabel", y: "name", x: d => Math.min(d.wg, d.card.memory_gib), dx: 5, textAnchor: "start", fill: T.ink2, fontSize: 12,
          text: d => d.status === "does not fit" ? "weights do not fit" : `${d.left.toFixed(0)} GiB left` })
      ]
    });
    const costs = rows.flatMap(d => d.run ? PT_KEYS.filter(k => d.run.cost[k] != null).map(k => ({ ...d, pt: k, cost: d.run.cost[k] })) : []);
    const xDomain = [0.05, 4];
    const p2 = Plot.plot({
      ...common, width: w, marginLeft: 118, marginRight: 12,
      ariaLabel: "Measured cost per 1,000 pages on small GPUs",
      fy: { ...fy, axis: null, padding: 0.3 }, y: { ...yOpts },
      facet: { label: null },
      x: { type: "log", domain: xDomain, ticks: [0.1, 0.5, 2], tickFormat: tickMoney, label: "$ per 1,000 pages (lower is cheaper)", labelAnchor: "center", labelArrow: "none" },
      color: ptColor(), symbol: ptSymbol(),
      marks: [
        facetLabels(fy.domain, 118),
        Plot.gridX([0.1, 0.5, 2], { stroke: T.grid, strokeOpacity: 1 }),
        Plot.dot(costs, {
          fy: "cardLabel", y: "name", x: "cost", fill: "pt", symbol: "pt", r: 5, stroke: T.bg, strokeWidth: 1,
          title: d => `${d.m.name} on ${d.card.label}, ${PT_LOWER[d.pt]}\n${money(d.cost)} per 1,000 pages (rough: 2-minute feed, one run)\non the RTX PRO 6000: ${money(d.m.cost[d.pt])}`, tip: tipOpts()
        }),
        Plot.text(rows.filter(d => !d.run), { fy: "cardLabel", y: "name", x: xDomain[0], dx: 2, textAnchor: "start", fill: T.ink3, fontSize: 12, text: d => d.status })
      ]
    });
    const t4 = S.runs.find(r => r.slug === newest.slug && r.card === "t4-small");
    const t4c = S.cards.find(c => c.key === "t4-small");
    const t4costs = PT_KEYS.map(k => t4.cost[k]);
    const rol = S.runs.find(r => r.slug === "rolmocr");
    return figure({
      title: `The newest model runs on a 16 GB card with ${(t4c.memory_gib - t4.weights_gib).toFixed(0)} GiB to spare, for roughly ${money(d3.min(t4costs))} to ${money(d3.max(t4costs))} per 1,000 pages`,
      legend: [{ shape: "bar", color: T.mark, label: "model weights" }, { shape: "bar", color: T.grid, outline: true, label: "rest of the card" }].concat(ptLegendItems()),
      panels: [{ label: "GPU memory (GiB)", node: p1 }, { label: "Measured cost on that card (rough)", node: p2 }],
      notes: [`100 pages per page type on each card, a 2-minute feed and one run, so these costs are rougher than the main results (whole-run rate, slow pages included). Weights and cache size from the server logs; card memory approximate (about ${t4c.memory_gib} and ${S.cards[1].memory_gib} GiB). On the 24 GB card the April 2025 model's cache held about ${intf(rol.kv_cache_tokens)} tokens, about ${Math.round(rol.kv_cache_tokens / S.typical_page_tokens)} typical pages. olmOCR-2 is a sister model with 8-bit weights that also reads smaller images (1,288 px), so its lower cost is not due to the 8-bit weights alone. RolmOCR's typed pages on the 24 GB card were not measured (the job timed out). The cheapest cost per page is still on the large GPU (hover a dot to compare).`]
    });
  }

  // =====================================================================
  // J. Calculator
  // =====================================================================
  const modelOptions = new Map(byRelease.map(m => [m.name + (m === newest ? " (newest)" : ""), m.slug]));
  function figJ({ n = 1e6, pt = "all", slug = newest.slug }, width) {
    const w = clampW(width), narrow = w < 560;
    n = Math.max(1000, Math.min(1e8, Number(n) || 1e6));
    const m = bySlug[slug];
    const costOf = mm => n / 1000 * mm.cost[pt];
    const ppsOf = mm => (pt === "all" ? ppsAll(mm) : mm.pages_per_s[pt]);
    const all = models.map(mm => ({ m: mm, c: costOf(mm) }));
    const lo = d3.min(all, a => a.c), hi = d3.max(all, a => a.c);
    const noise = pt === "all" ? 1.25 : 1.5;
    const xDomain = [Math.min(lo, costOf(m) / noise) * 0.8, Math.max(hi, costOf(m) * noise) * 1.25];
    const plot = Plot.plot({
      width: w, height: 108, marginLeft: 12, marginRight: 12, marginTop: 26, marginBottom: 42, style: style(),
      ariaLabel: "Cost for this many pages across all models",
      x: { type: "log", domain: xDomain, ticks: narrow ? 3 : 6, tickFormat: v => money(v), label: `GPU cost for ${plainNum(n)} pages (lower is cheaper)`, labelAnchor: "center", labelArrow: "none" },
      y: { axis: null, domain: [0, 1] },
      marks: [
        Plot.rect([0], { x1: costOf(m) / noise, x2: costOf(m) * noise, y1: 0.25, y2: 0.75, fill: T.grid }),
        Plot.ruleY([0.5], { x1: lo, x2: hi, stroke: T.markLight, strokeWidth: 1 }),
        Plot.tickX(all, { x: "c", y1: 0.25, y2: 0.75, stroke: T.mark, strokeWidth: 1.5,
          title: a => `${a.m.name}\n${money(a.c)} and ${duration(n / ppsOf(a.m))} for ${plainNum(n)} ${PT_LOWER[pt]}`, tip: tipOpts() }),
        Plot.dot([{ c: costOf(m) }], { x: "c", y: 0.5, r: 6, fill: T.accent, stroke: T.bg, strokeWidth: 1.5 }),
        Plot.text([{ c: costOf(m) }], { x: "c", y: 0.75, dy: -10, text: () => m.name, fill: T.ink, fontSize: 12.5, fontWeight: 600 })
      ]
    });
    const f = el("div", "ocf");
    const out = el("div", "ocf-calc-out");
    out.innerHTML = `<div><div class="ocf-calc-num">${money(costOf(m))}</div><div class="ocf-calc-lab">GPU cost</div></div>` +
      `<div><div class="ocf-calc-num">${duration(n / ppsOf(m))}</div><div class="ocf-calc-lab">time on one GPU</div></div>`;
    f.append(out);
    f.append(legendEl([{ shape: "circle", color: T.accent, label: "chosen model" },
      { shape: "bar", color: T.grid, outline: true, label: `differences inside this band are not meaningful (about ${pt === "all" ? "a quarter" : "a half"} either way)` },
      { shape: "line", color: T.mark, label: `ticks: all eight models, ${money(lo)} to ${money(hi)}` }]));
    const c = el("div", "ocf-chart"); c.append(plot); f.append(c);
    f.append(el("p", "ocf-notes", `Conditions: one rented RTX PRO 6000 at $${PRICE.toFixed(2)} an hour, running without a break. Start-up time (3 to 5 minutes per job) is not included. Your pages will differ from these 850, so treat this as an estimate. Hover a tick to see each model.`));
    return f;
  }

  // =====================================================================
  // K. Full table (rows for Inputs.table)
  // =====================================================================
  function tableK() {
    const rows = models.map(m => ({
      Model: m.name + setupMark(m),
      Released: m.date,
      "Size (B params)": m.params_b,
      "$ / 1k books": m.cost.books,
      "$ / 1k dense": m.cost.dense,
      "$ / 1k typed": m.cost.typed,
      "$ / 1k all": m.cost.all,
      "Error rate, books (tolerant)": m.cer_books.tolerant,
      "Error rate, books (plain)": m.cer_books.plain,
      "Runaway pages, all": cappedAll(m),
      "Output limit (tokens)": m.max_tokens
    })).sort((a, b) => a.Released - b.Released);
    rows.push({
      Model: `${variant.name} (variant)`,
      Released: parseDate(variant.release),
      "Size (B params)": baseline.params_b,
      "$ / 1k books": variant.cost.books,
      "$ / 1k dense": variant.cost.dense,
      "$ / 1k typed": variant.cost.typed,
      "$ / 1k all": variant.cost.all,
      "Error rate, books (tolerant)": variant.cer_books.tolerant,
      "Error rate, books (plain)": variant.cer_books.plain,
      "Runaway pages, all": d3.sum(PT_KEYS, k => variant.capped_share[k] * PT_N[k]) / PT_N.all,
      "Output limit (tokens)": baseline.max_tokens
    });
    const fmtP = v => pct(v, 2);
    const format = {
      Released: d => fmtDay(d),
      "Size (B params)": v => v.toFixed(2),
      "$ / 1k books": money, "$ / 1k dense": money, "$ / 1k typed": money, "$ / 1k all": money,
      "Error rate, books (tolerant)": fmtP, "Error rate, books (plain)": fmtP,
      "Runaway pages, all": v => pct(v),
      "Output limit (tokens)": v => intf(v)
    };
    const notes = `${SETUP_NOTE_TEXT()} Cost at $${PRICE.toFixed(2)} an hour, final run. Error rates are medians over ${DATA.meta.books_pages_with_gt} book pages; "tolerant" does not count running headers and page numbers. Runaway = share of all 850 pages that hit the output limit (limits differ by model). Accuracy is measured on book pages only. The "(variant)" row is the April 2025 model with a 1,288 px page image. Size = parameter count on the Hub. Click a column heading to sort.`;
    return { rows, format, notes };
  }

  return {
    figA, figB, figC, figChain, figF, figH, figJ, tableK,
    C_OPTIONS, modelOptions, newestSlug: newest.slug,
    PT_OPTIONS: new Map([["All pages", "all"], ["Book pages", "books"], ["Dense print (1771 Britannica)", "dense"], ["Typed pages", "typed"]])
  };
}
