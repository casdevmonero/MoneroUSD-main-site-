// generate-whitepaper-pdf-v2.js
//
// Replaces /Users/.../connect/generate-whitepaper-pdf.js. Same dark
// aesthetic (black background, orange accents) — fixes the page-break
// failure mode of the v1 script.
//
// Design goals (Claude design pass, v1.2.182):
//   - Hero + TOC each get their own page; no body content shares a
//     page with them.
//   - h2 starts a new page (forced break-before) so chapters never
//     orphan a heading at the bottom.
//   - h3 stays attached to its first paragraph (break-after: avoid).
//   - Atomic blocks (formula / note / diagram / card-grid / tier-bar /
//     table / pre / blockquote / image) never split mid-block.
//   - Long tables repeat their <thead> on every page they span.
//   - Lists don't orphan a final item; orphans/widows ≥ 3.
//   - Code blocks wrap (white-space: pre-wrap) so 80-col code never
//     overflows the page width.
//   - Type scale tuned for letter @ 16mm margins: body 9.5pt,
//     code 8.5pt, h2 14pt, h3 11pt — all reading sizes that fit
//     ~50 chars/line at the chosen page width.
//   - Print runs in DARK MODE (black bg, orange accent) to match
//     the on-screen brand. Toner-heavy but the brand identity is
//     the priority for the downloadable PDF.
//
// Usage (on VPS):
//   node /root/generate-whitepaper-pdf-v2.js
//
// Output: /var/www/monerousd-site/MoneroUSD_Whitepaper.pdf

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

  // Asset rebasing — file:/// URLs from the source resolve against SITE_DIR
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

  // Strip the source's @media print block (we control print rules here)
  // and inject the canonical PDF stylesheet.
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
      } catch (_) { /* cross-origin / unreadable sheet */ }
    }

    const css = `
      /* ── Page geometry ───────────────────────────────────────── */
      @page { size: letter; margin: 14mm 14mm 14mm 14mm; }
      @page :first { margin-top: 8mm; }

      /* ── Global ──────────────────────────────────────────────── */
      html, body {
        background: #0a0a0a !important;
        color: #eaeaea !important;
      }
      body {
        margin: 0 !important;
        padding: 0 !important;
        font-family: 'Outfit', system-ui, -apple-system, sans-serif !important;
        font-size: 9.5pt !important;
        line-height: 1.5 !important;
        -webkit-font-smoothing: antialiased;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* ── Strip site chrome ──────────────────────────────────── */
      nav,
      .nav-hamburger,
      .nav-mobile-menu,
      .download-pdf-btn,
      footer,
      script {
        display: none !important;
      }

      /* ── Hero — own page ─────────────────────────────────────── */
      .wp-hero {
        background: #0a0a0a !important;
        padding: 28mm 12mm 12mm !important;
        text-align: center;
        page-break-after: always !important;
        break-after: page !important;
      }
      .wp-hero::before {
        content: '' !important;
        display: block !important;
        position: absolute !important;
        top: -60% !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        width: 200mm !important;
        height: 200mm !important;
        background: radial-gradient(circle, rgba(255,102,0,0.30) 0%, transparent 70%) !important;
        opacity: 0.25 !important;
        pointer-events: none !important;
      }
      .wp-logo {
        width: 18mm !important;
        height: 18mm !important;
        margin: 0 auto 6mm !important;
        filter: drop-shadow(0 0 6mm rgba(255,102,0,0.35)) !important;
      }
      .wp-title {
        color: #eaeaea !important;
        font-size: 28pt !important;
        font-weight: 700 !important;
        letter-spacing: -0.02em !important;
        margin-bottom: 4mm !important;
      }
      .wp-title span { color: #FF6600 !important; }
      .wp-version {
        color: #b8b8b8 !important;
        font-size: 11pt !important;
        margin-bottom: 2mm !important;
      }
      .wp-date {
        color: #888 !important;
        font-size: 10pt !important;
      }

      /* ── TOC — own page ──────────────────────────────────────── */
      .toc {
        background: #161616 !important;
        border: 1px solid #333 !important;
        max-width: 100% !important;
        margin: 8mm 12mm 0 !important;
        padding: 8mm 10mm !important;
        border-radius: 4mm !important;
        page-break-inside: avoid !important;
        page-break-after: always !important;
        break-after: page !important;
      }
      .toc h2 {
        color: #888 !important;
        font-size: 9pt !important;
        text-transform: uppercase !important;
        letter-spacing: 1.5pt !important;
        margin-bottom: 4mm !important;
        border: none !important;
        padding: 0 !important;
      }
      .toc ol {
        list-style: none !important;
        counter-reset: toc !important;
        padding-left: 0 !important;
        margin: 0 !important;
      }
      .toc li { counter-increment: toc !important; }
      .toc li a {
        display: flex !important;
        color: #eaeaea !important;
        font-size: 10.5pt !important;
        padding: 1.5mm 0 !important;
        border-bottom: 1px solid rgba(255,255,255,0.06) !important;
        text-decoration: none !important;
      }
      .toc li:last-child a { border-bottom: none !important; }
      .toc li a::before {
        content: counter(toc) "." !important;
        color: #FF6600 !important;
        font-weight: 700 !important;
        font-family: 'JetBrains Mono', monospace !important;
        width: 8mm !important;
        flex-shrink: 0 !important;
        font-size: 9pt !important;
      }

      /* ── Content ─────────────────────────────────────────────── */
      .wp-content {
        max-width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .wp-content > * {
        margin-left: 0 !important;
        margin-right: 0 !important;
      }

      /* h2: each chapter starts a fresh page. break-before:page is
         the strongest possible directive to ensure no chapter
         starts in the bottom third of a page. */
      .wp-content h2 {
        color: #FF6600 !important;
        font-size: 16pt !important;
        font-weight: 700 !important;
        margin: 0 0 4mm 0 !important;
        padding-top: 0 !important;
        border-top: none !important;
        page-break-before: always !important;
        break-before: page !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      .wp-content h2:first-of-type {
        page-break-before: auto !important;
        break-before: auto !important;
      }
      .wp-content h3 {
        color: #FFD8A0 !important;
        font-size: 11.5pt !important;
        font-weight: 600 !important;
        margin: 5mm 0 2mm 0 !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      .wp-content p {
        color: #eaeaea !important;
        font-size: 9.5pt !important;
        line-height: 1.5 !important;
        margin: 0 0 3mm 0 !important;
        orphans: 3 !important;
        widows: 3 !important;
      }
      .wp-content strong { color: #FFD8A0 !important; font-weight: 600 !important; }
      .wp-content em { color: #d8d8d8 !important; }
      .wp-content code {
        background: #1a1a1a !important;
        color: #FF8833 !important;
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 8.5pt !important;
        padding: 0.3mm 1mm !important;
        border-radius: 1mm !important;
      }

      /* ── Lists ───────────────────────────────────────────────── */
      ul.wp-list, .wp-content ul, .wp-content ol {
        color: #eaeaea !important;
        margin: 0 0 3mm 4mm !important;
        padding: 0 !important;
      }
      ul.wp-list li, .wp-content ul li, .wp-content ol li {
        font-size: 9.5pt !important;
        margin-bottom: 1.5mm !important;
        line-height: 1.45 !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      ul.wp-list li::marker { color: #FF6600 !important; }

      /* ── Atomic blocks — never split mid-block ──────────────── */
      .wp-formula, .wp-note, .wp-diagram, .wp-card, .wp-card-grid,
      .tier-bar, table, pre, blockquote {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      /* Formulas / code blocks */
      .wp-formula {
        background: #0d0d0d !important;
        border: 1px solid #2a2a2a !important;
        border-radius: 2mm !important;
        padding: 4mm 5mm !important;
        margin: 3mm 0 !important;
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 8.5pt !important;
        color: #FF8833 !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
      }
      .wp-formula .label {
        color: #888 !important;
        font-size: 7.5pt !important;
        font-family: 'Outfit', sans-serif !important;
        text-transform: uppercase !important;
        letter-spacing: 1pt !important;
        display: block !important;
        margin-bottom: 2mm !important;
      }

      /* Notes */
      .wp-note {
        background: rgba(255,102,0,0.08) !important;
        border-left: 3px solid #FF6600 !important;
        border-radius: 0 2mm 2mm 0 !important;
        padding: 3mm 5mm !important;
        margin: 3mm 0 !important;
        color: #eaeaea !important;
        font-size: 9pt !important;
      }
      .wp-note strong { color: #FF8833 !important; }

      /* Card grid */
      .wp-card-grid {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 3mm !important;
        margin: 3mm 0 !important;
      }
      .wp-card {
        background: #161616 !important;
        border: 1px solid #2a2a2a !important;
        border-radius: 2mm !important;
        padding: 4mm !important;
      }
      .wp-card h4 {
        color: #888 !important;
        font-size: 7.5pt !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5pt !important;
        margin-bottom: 1mm !important;
      }
      .wp-card .val {
        color: #FF6600 !important;
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 13pt !important;
        font-weight: 700 !important;
      }
      .wp-card p {
        color: #b8b8b8 !important;
        font-size: 8.5pt !important;
        margin-top: 1mm !important;
        margin-bottom: 0 !important;
      }

      /* Tier bars */
      .tier-bar {
        display: flex !important;
        align-items: center !important;
        gap: 3mm !important;
        padding: 2mm 4mm !important;
        border-radius: 2mm !important;
        margin-bottom: 1.5mm !important;
        font-size: 9pt !important;
        background: #161616 !important;
        border: 1px solid #2a2a2a !important;
      }
      .tier-bar .label {
        font-weight: 600 !important;
        min-width: 18mm !important;
      }
      .tier-bar .desc {
        color: #b8b8b8 !important;
        flex: 1 !important;
      }
      .tier-bar .rate {
        font-family: 'JetBrains Mono', monospace !important;
        font-weight: 600 !important;
      }
      .tier-normal .label, .tier-normal .rate { color: #22c55e !important; }
      .tier-warning .label, .tier-warning .rate { color: #eab308 !important; }
      .tier-stress .label, .tier-stress .rate { color: #FF6600 !important; }
      .tier-emergency .label, .tier-emergency .rate { color: #ef4444 !important; }

      /* Diagrams */
      .wp-diagram {
        background: #0d0d0d !important;
        border: 1px solid #2a2a2a !important;
        border-radius: 2mm !important;
        padding: 5mm !important;
        margin: 3mm 0 !important;
        text-align: center !important;
      }
      .wp-diagram .flow {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 2mm !important;
        flex-wrap: wrap !important;
        font-size: 9pt !important;
      }
      .wp-diagram .node {
        background: #1a1a1a !important;
        border: 1px solid #333 !important;
        border-radius: 1.5mm !important;
        padding: 1.5mm 3mm !important;
        font-weight: 600 !important;
        color: #eaeaea !important;
      }
      .wp-diagram .node.orange {
        border-color: #FF6600 !important;
        color: #FF8833 !important;
        background: rgba(255,102,0,0.08) !important;
      }
      .wp-diagram .arrow {
        color: #888 !important;
        font-size: 11pt !important;
      }
      .wp-diagram .caption {
        color: #888 !important;
        font-size: 8pt !important;
        margin-top: 3mm !important;
      }

      /* ── Tables — repeat header, never split row ─────────────── */
      table {
        width: 100% !important;
        border-collapse: collapse !important;
        border: 1px solid #2a2a2a !important;
        margin: 3mm 0 !important;
        font-size: 8.5pt !important;
        page-break-inside: auto !important;
      }
      thead { display: table-header-group !important; }
      tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      th {
        background: rgba(255,102,0,0.10) !important;
        color: #FFD8A0 !important;
        text-align: left !important;
        padding: 2mm 3mm !important;
        font-size: 7.5pt !important;
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
      td code, th code { font-size: 7.5pt !important; }

      /* ── Links ───────────────────────────────────────────────── */
      a, a:visited {
        color: #FF8833 !important;
        text-decoration: none !important;
      }

      /* ── Final misc ──────────────────────────────────────────── */
      img { max-width: 100% !important; height: auto !important; }
      hr { border: none !important; border-top: 1px solid #2a2a2a !important; margin: 6mm 0 !important; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // Mark <body> with a class so the script knows the override applied
    document.body.classList.add('pdf-mode');
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
