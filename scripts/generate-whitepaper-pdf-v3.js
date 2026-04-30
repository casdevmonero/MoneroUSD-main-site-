// generate-whitepaper-pdf-v3.js
//
// v3 fixes the v2 formatting failures (visible in the on-device review):
//   - White page margins around the black body — fixed by `@page {
//     margin: 0 }` + content padding on .wp-hero, .toc, .wp-content,
//     so the entire page is filled with our dark background.
//   - Type too small (9.5pt body, unreadable on a printed letter
//     page) — bumped to 11pt body / 18pt h2 / 13pt h3 / 10pt code.
//   - Every h2 forced a new page → most pages were 80% blank
//     (especially short sections like Abstract). Removed the forced
//     `break-before: page` on h2; chapters now flow naturally.
//     `break-after: avoid` on h2/h3 still keeps headings stuck to
//     their first paragraph.
//   - Hero padding rebalanced so the title is vertically centered
//     in the upper third, not floating at the top of a 90% empty
//     page.

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SITE_DIR = process.env.SITE_DIR || '/var/www/monerousd-site';
const SOURCE = process.env.WP_SOURCE || path.join(SITE_DIR, 'whitepaper.html');
const OUTPUT = process.env.WP_OUTPUT || path.join(SITE_DIR, 'MoneroUSD_Whitepaper.pdf');

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'],
    headless: 'new',
  });
  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('file:///') && !url.startsWith('file://' + SITE_DIR)) {
      const relPath = url.replace('file:///', '');
      const localPath = path.join(SITE_DIR, relPath);
      if (fs.existsSync(localPath)) {
        req.continue({ url: 'file://' + localPath });
        return;
      }
    }
    req.continue();
  });

  await page.goto('file://' + SOURCE, {
    waitUntil: 'networkidle0',
    timeout: 30000,
  });

  await page.evaluate(() => {
    for (let i = document.styleSheets.length - 1; i >= 0; i--) {
      try {
        const sheet = document.styleSheets[i];
        for (let j = sheet.cssRules.length - 1; j >= 0; j--) {
          if (sheet.cssRules[j].type === CSSRule.MEDIA_RULE &&
              sheet.cssRules[j].conditionText &&
              sheet.cssRules[j].conditionText.indexOf('print') !== -1) {
            sheet.deleteRule(j);
          }
        }
      } catch (_) { /* unreadable sheet */ }
    }

    const css = `
      /* ── Page geometry — ZERO margin so background reaches edges ─ */
      @page { size: letter; margin: 0; }

      /* ── Global ─────────────────────────────────────────────── */
      html, body {
        background: #0a0a0a !important;
        color: #eaeaea !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      body {
        font-family: 'Outfit', system-ui, -apple-system, sans-serif !important;
        font-size: 11pt !important;
        line-height: 1.5 !important;
        -webkit-font-smoothing: antialiased;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* ── Strip site chrome ──────────────────────────────────── */
      nav, .nav-hamburger, .nav-mobile-menu, .download-pdf-btn, footer, script {
        display: none !important;
      }

      /* ── Hero — centered, own page, full bleed ──────────────── */
      .wp-hero {
        background: #0a0a0a !important;
        padding: 60mm 18mm 40mm !important;
        text-align: center !important;
        position: relative !important;
        overflow: hidden !important;
        min-height: 100vh !important;
        page-break-after: always !important;
        break-after: page !important;
      }
      .wp-hero::before {
        content: '' !important;
        display: block !important;
        position: absolute !important;
        top: 30% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        width: 160mm !important;
        height: 160mm !important;
        background: radial-gradient(circle, rgba(255,102,0,0.32) 0%, transparent 65%) !important;
        opacity: 0.4 !important;
        pointer-events: none !important;
        z-index: 0 !important;
      }
      .wp-hero > * { position: relative !important; z-index: 1 !important; }
      .wp-logo {
        width: 28mm !important;
        height: 28mm !important;
        margin: 0 auto 8mm !important;
        filter: drop-shadow(0 0 10mm rgba(255,102,0,0.45)) !important;
      }
      .wp-title {
        color: #eaeaea !important;
        font-size: 36pt !important;
        font-weight: 700 !important;
        letter-spacing: -0.02em !important;
        margin: 0 0 6mm !important;
      }
      .wp-title span { color: #FF6600 !important; }
      .wp-version { color: #b8b8b8 !important; font-size: 12pt !important; margin: 0 0 3mm !important; }
      .wp-date { color: #888 !important; font-size: 11pt !important; margin: 0 !important; }

      /* ── TOC — own page, all items on ONE page ──────────────── */
      .toc {
        background: #0a0a0a !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 22mm 22mm 22mm !important;
        border-radius: 0 !important;
        border: none !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: always !important;
        break-after: page !important;
      }
      .toc h2 {
        color: #FF6600 !important;
        font-size: 14pt !important;
        text-transform: uppercase !important;
        letter-spacing: 2pt !important;
        margin: 0 0 6mm !important;
        border: none !important;
        padding: 0 !important;
        text-align: center !important;
      }
      .toc ol {
        list-style: none !important;
        counter-reset: toc !important;
        padding: 0 !important;
        margin: 0 auto !important;
        max-width: 130mm !important;
      }
      .toc li {
        counter-increment: toc !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .toc li a {
        display: flex !important;
        align-items: baseline !important;
        color: #eaeaea !important;
        font-size: 11.5pt !important;
        padding: 1.8mm 0 !important;
        border-bottom: 1px solid rgba(255,255,255,0.08) !important;
        text-decoration: none !important;
      }
      .toc li:last-child a { border-bottom: none !important; }
      .toc li a::before {
        content: counter(toc) "." !important;
        color: #FF6600 !important;
        font-weight: 700 !important;
        font-family: 'JetBrains Mono', monospace !important;
        width: 10mm !important;
        flex-shrink: 0 !important;
        font-size: 11pt !important;
      }

      /* ── Content — full-bleed, 18mm side padding ────────────── */
      .wp-content {
        max-width: 100% !important;
        margin: 0 !important;
        padding: 16mm 18mm 24mm !important;
        background: #0a0a0a !important;
      }

      /* h2: chapter headers DON'T force a new page. They stay
         attached to their first paragraph (break-after: avoid)
         and accept natural pagination — content flows around them
         filling the page. */
      .wp-content h2 {
        color: #FF6600 !important;
        font-size: 18pt !important;
        font-weight: 700 !important;
        margin: 8mm 0 3mm 0 !important;
        padding-top: 5mm !important;
        border-top: 1px solid #2a2a2a !important;
        page-break-before: auto !important;
        break-before: auto !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      .wp-content h2:first-of-type {
        margin-top: 0 !important;
        padding-top: 0 !important;
        border-top: none !important;
      }
      /* Conclusion: short closing chapter (4 paragraphs + sign-off).
         Let it flow naturally INTO the page 28 gap (the gap is ~200mm
         after Future Work ends; the conclusion is ~150mm, so the
         entire conclusion fits there cleanly). page-break-inside:
         avoid keeps it whole — if for some reason it doesn't fit on
         page 28, it moves to page 29 entirely instead of splitting. */
      .wp-content h2[id="conclusion"] {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .wp-content h3 {
        color: #FFD8A0 !important;
        font-size: 13pt !important;
        font-weight: 600 !important;
        margin: 4mm 0 2mm !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      .wp-content p {
        color: #eaeaea !important;
        font-size: 11pt !important;
        line-height: 1.5 !important;
        margin: 0 0 2.5mm !important;
        orphans: 3 !important;
        widows: 3 !important;
      }
      .wp-content strong { color: #FFD8A0 !important; font-weight: 600 !important; }
      .wp-content em { color: #d8d8d8 !important; }
      .wp-content code {
        background: #1a1a1a !important;
        color: #FF8833 !important;
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 10pt !important;
        padding: 0.5mm 1.5mm !important;
        border-radius: 1mm !important;
      }

      /* ── Lists ───────────────────────────────────────────────── */
      ul.wp-list, .wp-content ul, .wp-content ol {
        color: #eaeaea !important;
        margin: 0 0 3mm 6mm !important;
        padding: 0 !important;
      }
      ul.wp-list li, .wp-content ul li, .wp-content ol li {
        font-size: 11pt !important;
        margin-bottom: 1.5mm !important;
        line-height: 1.45 !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      ul.wp-list li::marker { color: #FF6600 !important; }

      /* ── Charts/graphs/callouts — never split ───────────────── */
      /* Visual atomic units (cards, diagrams, single tier-bars,
         notes) stay whole on a page. NOTE: .wp-formula (code +
         wire-format blocks) and table (data tables) are
         deliberately NOT in this list — they are TEXT, and splitting
         them at line/row boundaries reads cleanly. Charts split
         visually look broken; text split at a natural boundary
         does not. See the dedicated rules below for both. */
      .wp-note, .wp-diagram, .wp-card, .wp-card-grid,
      .tier-bar, blockquote, figure, .wp-content > svg {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      /* Code/formula blocks flow at line boundaries — eliminates the
         gap when a 25-line code block does not fit at the bottom of
         a page. The pre-wrap on the contents means a long line never
         overflows the page width, and a clean line break at the page
         edge reads naturally. */
      .wp-formula, pre {
        page-break-inside: auto !important;
        break-inside: auto !important;
      }

      /* Grouped tier-bars: consecutive bars stick together so the
         4-tier reserve-health chart never splits between bars. The
         :has() selector targets each bar that has another bar after
         it; the LAST bar in a group can break naturally. */
      .tier-bar:has(+ .tier-bar) {
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      /* Adjacent card grids stay glued (rare layout — most pages
         have at most one). */
      .wp-card-grid + .wp-card-grid {
        page-break-before: avoid !important;
        break-before: avoid !important;
      }

      .wp-formula {
        background: #0d0d0d !important;
        border: 1px solid #2a2a2a !important;
        border-radius: 2mm !important;
        padding: 5mm 6mm !important;
        margin: 4mm 0 !important;
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 10pt !important;
        color: #FF8833 !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
      }
      .wp-formula .label {
        color: #888 !important;
        font-size: 9pt !important;
        font-family: 'Outfit', sans-serif !important;
        text-transform: uppercase !important;
        letter-spacing: 1pt !important;
        display: block !important;
        margin-bottom: 3mm !important;
      }

      .wp-note {
        background: rgba(255,102,0,0.10) !important;
        border-left: 3px solid #FF6600 !important;
        border-radius: 0 2mm 2mm 0 !important;
        padding: 4mm 6mm !important;
        margin: 4mm 0 !important;
        color: #eaeaea !important;
        font-size: 10.5pt !important;
      }
      .wp-note strong { color: #FF8833 !important; }

      .wp-card-grid {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 4mm !important;
        margin: 4mm 0 !important;
      }
      .wp-card {
        background: #161616 !important;
        border: 1px solid #2a2a2a !important;
        border-radius: 2mm !important;
        padding: 5mm !important;
      }
      .wp-card h4 {
        color: #888 !important;
        font-size: 9pt !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5pt !important;
        margin: 0 0 1.5mm !important;
      }
      .wp-card .val {
        color: #FF6600 !important;
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 16pt !important;
        font-weight: 700 !important;
      }
      .wp-card p {
        color: #b8b8b8 !important;
        font-size: 10pt !important;
        margin: 1.5mm 0 0 0 !important;
      }

      .tier-bar {
        display: flex !important;
        align-items: center !important;
        gap: 3mm !important;
        padding: 3mm 5mm !important;
        border-radius: 2mm !important;
        margin-bottom: 1.5mm !important;
        font-size: 10.5pt !important;
        background: #161616 !important;
        border: 1px solid #2a2a2a !important;
      }
      .tier-bar .label { font-weight: 600 !important; min-width: 24mm !important; }
      .tier-bar .desc { color: #b8b8b8 !important; flex: 1 !important; }
      .tier-bar .rate { font-family: 'JetBrains Mono', monospace !important; font-weight: 600 !important; }
      .tier-normal .label, .tier-normal .rate { color: #22c55e !important; }
      .tier-warning .label, .tier-warning .rate { color: #eab308 !important; }
      .tier-stress .label, .tier-stress .rate { color: #FF6600 !important; }
      .tier-emergency .label, .tier-emergency .rate { color: #ef4444 !important; }

      .wp-diagram {
        background: #0d0d0d !important;
        border: 1px solid #2a2a2a !important;
        border-radius: 2mm !important;
        padding: 6mm !important;
        margin: 4mm 0 !important;
        text-align: center !important;
      }
      .wp-diagram .flow {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 2.5mm !important;
        flex-wrap: wrap !important;
        font-size: 10.5pt !important;
      }
      .wp-diagram .node {
        background: #1a1a1a !important;
        border: 1px solid #333 !important;
        border-radius: 1.5mm !important;
        padding: 2mm 3.5mm !important;
        font-weight: 600 !important;
        color: #eaeaea !important;
      }
      .wp-diagram .node.orange {
        border-color: #FF6600 !important;
        color: #FF8833 !important;
        background: rgba(255,102,0,0.10) !important;
      }
      .wp-diagram .arrow { color: #888 !important; font-size: 12pt !important; }
      .wp-diagram .caption { color: #888 !important; font-size: 9.5pt !important; margin-top: 4mm !important; }

      table {
        width: 100% !important;
        border-collapse: collapse !important;
        border: 1px solid #2a2a2a !important;
        margin: 3mm 0 !important;
        font-size: 10pt !important;
        /* TABLES FLOW NATURALLY across pages with thead repeating
           on every page they touch. This is the right policy: keeping
           the whole table together pushes it to the next page entirely
           and leaves a giant gap on the prior page. Tables are DATA
           grids, not visual atomic units — splitting them between
           rows is the standard PDF behavior readers expect. Individual
           rows still never split (tr rule below). */
        page-break-inside: auto !important;
        break-inside: auto !important;
      }
      thead {
        display: table-header-group !important;
      }
      /* Rows never split mid-row, so a row's cells don't end up on
         two different pages. */
      tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      th {
        background: rgba(255,102,0,0.12) !important;
        color: #FFD8A0 !important;
        text-align: left !important;
        padding: 2mm 3mm !important;
        font-size: 9pt !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5pt !important;
        border-bottom: 1px solid #444 !important;
      }
      td {
        background: #111 !important;
        color: #eaeaea !important;
        padding: 2mm 3mm !important;
        border-bottom: 1px solid #1f1f1f !important;
        vertical-align: top !important;
      }
      tr:nth-child(even) td { background: #161616 !important; }
      tr:hover td { background: #111 !important; }
      td code, th code { font-size: 9pt !important; }

      a, a:visited { color: #FF8833 !important; text-decoration: none !important; }
      img { max-width: 100% !important; height: auto !important; }
      hr { border: none !important; border-top: 1px solid #2a2a2a !important; margin: 8mm 0 !important; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  });

  await page.pdf({
    path: OUTPUT,
    format: 'Letter',
    printBackground: true,
    displayHeaderFooter: false,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
    preferCSSPageSize: true,
  });

  await browser.close();
  const stats = fs.statSync(OUTPUT);
  console.log('PDF generated: ' + OUTPUT);
  console.log('Size: ' + (stats.size / 1024).toFixed(1) + ' KB');
})();
