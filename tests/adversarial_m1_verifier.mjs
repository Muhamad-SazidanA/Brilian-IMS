import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const frontendRequire = createRequire(path.join(ROOT, 'frontend', 'package.json'));
const postcss = frontendRequire('postcss');
const tailwindcss = frontendRequire('tailwindcss');

async function runAdversarialM1Verification() {
  console.log('===============================================================');
  console.log('   Adversarial Empirical Verification Harness: Milestone 1    ');
  console.log('===============================================================\n');

  let passedChecks = 0;
  let totalChecks = 0;

  function check(name, fn) {
    totalChecks++;
    try {
      fn();
      console.log(`  ✔ [PASS] ${name}`);
      passedChecks++;
    } catch (err) {
      console.error(`  ✖ [FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  async function checkAsync(name, fn) {
    totalChecks++;
    try {
      await fn();
      console.log(`  ✔ [PASS] ${name}`);
      passedChecks++;
    } catch (err) {
      console.error(`  ✖ [FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 1: Documentation Audit & Style Guide Well-Formedness
  // -------------------------------------------------------------------------
  console.log('--- Section 1: Documentation Well-Formedness & Integrity ---');

  check('docs/AUDIT.md exists and exceeds minimum required length (>5KB)', () => {
    const auditPath = path.join(ROOT, 'docs', 'AUDIT.md');
    assert.ok(fs.existsSync(auditPath), 'docs/AUDIT.md does not exist');
    const content = fs.readFileSync(auditPath, 'utf8');
    assert.ok(content.length > 5000, `AUDIT.md too short (${content.length} bytes)`);
  });

  check('docs/AUDIT.md covers all requirements R1 through R5', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docs', 'AUDIT.md'), 'utf8');
    const requiredSections = [
      'Executive Summary',
      'Technology Stack',
      'Detailed Component Inventory',
      'Requirement R1',
      'Requirement R2',
      'Requirement R3',
      'Requirement R4',
      'Requirement R5',
      'Visual & Aesthetic Audit',
      'Non-Destructive Extension & Hardening Strategy'
    ];
    for (const sec of requiredSections) {
      assert.ok(content.includes(sec), `AUDIT.md is missing section: ${sec}`);
    }
  });

  check('docs/STYLE_GUIDE.md exists and covers all required design tokens', () => {
    const stylePath = path.join(ROOT, 'docs', 'STYLE_GUIDE.md');
    assert.ok(fs.existsSync(stylePath), 'docs/STYLE_GUIDE.md does not exist');
    const content = fs.readFileSync(stylePath, 'utf8');

    // Canonical tokens from C:\Zidan\BrilianAi\design.md
    const tokens = [
      '#FFFFFF', // paper
      '#F6F6F4', // mist
      '#14161B', // ink
      '#6B7078', // slate
      '#2F5DFF', // accent
      '#2447D6', // accent-dark
      '#1C8A5D', // success
      '#B7791F', // warning
      '#D64545', // danger
      '#E7E7E5'  // hairline
    ];
    for (const t of tokens) {
      assert.ok(content.includes(t), `STYLE_GUIDE.md is missing canonical token: ${t}`);
    }
  });

  check('docs/STYLE_GUIDE.md specifies all 6 required application screens', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docs', 'STYLE_GUIDE.md'), 'utf8');
    const screens = [
      'Screen 1: DMS Explorer',
      'Screen 2: File Upload',
      'Screen 3: AI Assistant',
      'Screen 4: Admin Console',
      'Screen 5: Login & Authentication',
      'Screen 6: Executive Dashboard'
    ];
    for (const sc of screens) {
      assert.ok(content.includes(sc), `STYLE_GUIDE.md is missing screen: ${sc}`);
    }
  });

  check('docs/STYLE_GUIDE.md includes anti-slop rules and watermark specifications', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docs', 'STYLE_GUIDE.md'), 'utf8');
    assert.ok(content.includes('Anti-AI-Slop Code Review Checklist'), 'Missing anti-slop checklist');
    assert.ok(content.includes('Dynamic Watermarking Engine Specification'), 'Missing watermark spec');
    assert.ok(content.includes('15% to 25%') || content.includes('15–25%'), 'Missing watermark opacity invariant');
    assert.ok(content.includes('IBM Plex Sans') && content.includes('IBM Plex Mono'), 'Missing IBM Plex typography specs');
  });

  // -------------------------------------------------------------------------
  // SECTION 2: Tailwind Token Compilation & PostCSS Verification
  // -------------------------------------------------------------------------
  console.log('\n--- Section 2: Tailwind Token Compilation & Syntax Testing ---');

  await checkAsync('Tailwind CSS compiles all newly defined tokens correctly', async () => {
    const tailwindConfigPath = path.join(ROOT, 'frontend', 'tailwind.config.js');
    assert.ok(fs.existsSync(tailwindConfigPath), 'tailwind.config.js missing');

    const testClasses = [
      'bg-paper',
      'bg-mist',
      'text-ink',
      'text-slate',
      'text-slate-muted',
      'text-slate-light',
      'border-hairline',
      'border-border-subtle',
      'bg-accent',
      'bg-accent-dark',
      'bg-accent-active',
      'bg-accent-subtle',
      'border-accent-border',
      'text-success',
      'bg-success',
      'bg-success-subtle',
      'text-warning',
      'bg-warning',
      'bg-warning-subtle',
      'text-danger',
      'bg-danger',
      'bg-danger-subtle',
      'font-sans',
      'font-mono',
      'rounded-xs',
      'rounded-sm',
      'rounded-md',
      'rounded-lg',
      'rounded-xl',
      'shadow-float',
      'shadow-subtle',
      // backward compat brand
      'bg-brand-500'
    ];

    const sampleHtml = `<div class="${testClasses.join(' ')}"></div>`;
    const cssInput = `@tailwind utilities;`;

    const tailwindModule = await import(`file://${tailwindConfigPath}`);
    const config = tailwindModule.default;

    // Override content to test string
    const testConfig = {
      ...config,
      content: [{ raw: sampleHtml, extension: 'html' }]
    };

    const result = await postcss([tailwindcss(testConfig)]).process(cssInput, {
      from: undefined
    });

    const compiledCss = result.css;

    // Verify key compiled CSS values
    assert.ok(compiledCss.includes('#FFFFFF') || compiledCss.includes('255 255 255'), 'bg-paper failed');
    assert.ok(compiledCss.includes('#F6F6F4') || compiledCss.includes('246 246 244'), 'bg-mist failed');
    assert.ok(compiledCss.includes('#14161B') || compiledCss.includes('20 22 27'), 'text-ink failed');
    assert.ok(compiledCss.includes('#E7E7E5') || compiledCss.includes('231 231 229'), 'border-hairline failed');
    assert.ok(compiledCss.includes('#2F5DFF') || compiledCss.includes('47 93 255'), 'bg-accent failed');
    assert.ok(compiledCss.includes('#1C8A5D') || compiledCss.includes('28 138 93'), 'bg-success failed');
    assert.ok(compiledCss.includes('#B7791F') || compiledCss.includes('183 121 31'), 'bg-warning failed');
    assert.ok(compiledCss.includes('#D64545') || compiledCss.includes('214 69 69'), 'bg-danger failed');
    assert.ok(compiledCss.includes('IBM Plex Sans'), 'font-sans failed');
    assert.ok(compiledCss.includes('IBM Plex Mono'), 'font-mono failed');
    assert.ok(compiledCss.includes('2px'), 'rounded-xs failed');
    assert.ok(compiledCss.includes('4px'), 'rounded-sm failed');
    assert.ok(compiledCss.includes('8px'), 'rounded-md failed');
    assert.ok(compiledCss.includes('0 8px 24px rgba(20, 22, 27, 0.08)'), 'shadow-float failed');
    assert.ok(compiledCss.includes('0 1px 3px rgba(20, 22, 27, 0.04)'), 'shadow-subtle failed');
    assert.ok(compiledCss.includes('#0284c7') || compiledCss.includes('2 132 199'), 'brand-500 backward compat failed');
  });

  // -------------------------------------------------------------------------
  // SECTION 3: CSS Cascade, Variables, and Font Loading Integrity
  // -------------------------------------------------------------------------
  console.log('\n--- Section 3: CSS Cascade & Font Loading Integrity ---');

  check('frontend/src/index.css defines valid :root CSS variables and body style', () => {
    const cssPath = path.join(ROOT, 'frontend', 'src', 'index.css');
    const content = fs.readFileSync(cssPath, 'utf8');

    // Check @import at the very top (must be first statement)
    assert.ok(content.trim().startsWith('@import url('), '@import font url must be at the top of index.css');
    assert.ok(content.includes('family=IBM+Plex+Mono') && content.includes('family=IBM+Plex+Sans'), 'IBM Plex fonts missing in @import');

    // Check :root variables
    assert.ok(content.includes('--color-paper: #FFFFFF;'), '--color-paper variable missing');
    assert.ok(content.includes('--color-mist: #F6F6F4;'), '--color-mist variable missing');
    assert.ok(content.includes('--color-ink: #14161B;'), '--color-ink variable missing');
    assert.ok(content.includes('--color-hairline: #E7E7E5;'), '--color-hairline variable missing');
    assert.ok(content.includes('--color-accent: #2F5DFF;'), '--color-accent variable missing');

    // Check body styling
    assert.ok(content.includes('background-color: var(--color-paper);'), 'body background must default to paper');
    assert.ok(content.includes('color: var(--color-ink);'), 'body text color must default to ink');
    assert.ok(content.includes("font-family: 'IBM Plex Sans'"), 'body font-family must specify IBM Plex Sans');

    // Check focus ring
    assert.ok(content.includes('*:focus-visible'), 'focus-visible ring missing');
    assert.ok(content.includes('var(--color-accent)'), 'focus-visible ring must use accent color');
  });

  check('frontend/index.html includes correct preconnect and Google Fonts links', () => {
    const htmlPath = path.join(ROOT, 'frontend', 'index.html');
    const content = fs.readFileSync(htmlPath, 'utf8');

    assert.ok(content.includes('<link rel="preconnect" href="https://fonts.googleapis.com" />'), 'Missing fonts.googleapis.com preconnect');
    assert.ok(content.includes('rel="preconnect" href="https://fonts.gstatic.com" crossorigin'), 'Missing fonts.gstatic.com crossorigin preconnect');
    assert.ok(content.includes('family=IBM+Plex+Mono') && content.includes('family=IBM+Plex+Sans'), 'Missing Google Fonts stylesheet link');
    assert.ok(content.includes('class="bg-paper text-ink font-sans antialiased'), 'body class missing canonical paper/mist/ink tokens');
  });

  // -------------------------------------------------------------------------
  // SECTION 4: Production Build Verification
  // -------------------------------------------------------------------------
  console.log('\n--- Section 4: Production Bundle Artifact Verification ---');

  check('frontend/dist contains built index.html, CSS, and JS', () => {
    const distPath = path.join(ROOT, 'frontend', 'dist');
    assert.ok(fs.existsSync(distPath), 'frontend/dist does not exist (must be built)');
    assert.ok(fs.existsSync(path.join(distPath, 'index.html')), 'dist/index.html missing');

    const assetsDir = path.join(distPath, 'assets');
    assert.ok(fs.existsSync(assetsDir), 'dist/assets missing');

    const files = fs.readdirSync(assetsDir);
    const cssFile = files.find(f => f.endsWith('.css'));
    const jsFile = files.find(f => f.endsWith('.js'));

    assert.ok(cssFile, 'dist CSS file missing');
    assert.ok(jsFile, 'dist JS file missing');

    const cssContent = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');
    assert.ok(cssContent.includes('IBM Plex Sans'), 'IBM Plex Sans missing in compiled CSS');
    assert.ok(cssContent.includes('IBM Plex Mono'), 'IBM Plex Mono missing in compiled CSS');
    assert.ok(cssContent.includes('--color-paper'), 'CSS variables missing in compiled CSS');
  });

  console.log('\n===============================================================');
  console.log(`   Verification Summary: ${passedChecks}/${totalChecks} checks passed cleanly.`);
  console.log('===============================================================\n');
}

runAdversarialM1Verification().catch(err => {
  console.error('\nAdversarial verification failed:', err);
  process.exit(1);
});
