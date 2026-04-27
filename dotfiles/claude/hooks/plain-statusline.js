#!/usr/bin/env node
// Claude Code StatusLine - Plain Edition
// Shows: time | account | branch | model | directory | context usage | limits

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

function getAccountLabel() {
  try {
    const labelPath = path.join(
      process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
      'statusline-label.txt'
    );
    return fs.readFileSync(labelPath, 'utf8').trim();
  } catch (_) {
    return '';
  }
}

function getBranch(dir) {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: dir,
      timeout: 1000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();

    if (branch !== 'HEAD') return branch;

    const sha = execSync('git rev-parse --short HEAD', {
      cwd: dir,
      timeout: 1000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return `detached:${sha}`;
  } catch (_) {
    return '';
  }
}

function formatClock(raw) {
  if (raw == null || raw === '') return '';

  let date;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    date = new Date(raw > 1e12 ? raw : raw * 1000);
  } else if (typeof raw === 'string') {
    const n = Number(raw.trim());
    date = raw.trim() && Number.isFinite(n)
      ? new Date(n > 1e12 ? n : n * 1000)
      : new Date(raw);
  } else {
    return '';
  }

  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function formatContext(data) {
  const remaining = data.context_window?.remaining_percentage;
  if (remaining == null) return { display: '', usedPct: null };

  const totalCtx = data.context_window?.total_tokens || 1_000_000;
  const acw = parseInt(process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW || '0', 10);
  const bufferPct = acw > 0 ? Math.min(100, (acw / totalCtx) * 100) : 16.5;
  const usableRemaining = Math.max(0, ((remaining - bufferPct) / (100 - bufferPct)) * 100);
  const used = Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));
  const filled = Math.floor(used / 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

  if (used < 50) return { display: `\x1b[32m${bar} ${used}%\x1b[0m`, usedPct: used };
  if (used < 65) return { display: `\x1b[33m${bar} ${used}%\x1b[0m`, usedPct: used };
  if (used < 80) return { display: `\x1b[38;5;208m${bar} ${used}%\x1b[0m`, usedPct: used };
  return { display: `\x1b[5;31m${bar} ${used}%\x1b[0m`, usedPct: used };
}

function formatRateLimits(rateLimits) {
  if (!rateLimits || typeof rateLimits !== 'object') return '';

  const colorPct = pct => {
    const p = Math.round(pct);
    if (p < 50) return `\x1b[32m${p}%\x1b[0m`;
    if (p < 75) return `\x1b[33m${p}%\x1b[0m`;
    if (p < 90) return `\x1b[38;5;208m${p}%\x1b[0m`;
    return `\x1b[5;31m${p}%\x1b[0m`;
  };

  const segments = [];
  const five = rateLimits.five_hour?.used_percentage;
  const seven = rateLimits.seven_day?.used_percentage;

  if (typeof five === 'number') {
    let segment = `5h ${colorPct(five)}`;
    const reset = formatClock(
      rateLimits.five_hour?.resets_at ??
      rateLimits.five_hour?.reset_at ??
      rateLimits.five_hour?.resetsAt
    );
    if (reset) segment += ` \x1b[2m->${reset}\x1b[0m`;
    segments.push(segment);
  }

  if (typeof seven === 'number') {
    let segment = `7d ${colorPct(seven)}`;
    const reset = formatClock(
      rateLimits.seven_day?.resets_at ??
      rateLimits.seven_day?.reset_at ??
      rateLimits.seven_day?.resetsAt
    );
    if (reset) segment += ` \x1b[2m->${reset}\x1b[0m`;
    segments.push(segment);
  }

  return segments.join(' ');
}

function getContextResetClock(data) {
  return formatClock(
    data.context_window?.resets_at ??
    data.context_window?.reset_at ??
    data.context_window?.resetsAt ??
    data.rate_limits?.five_hour?.resets_at ??
    data.rate_limits?.five_hour?.reset_at ??
    data.rate_limits?.five_hour?.resetsAt
  );
}

function runStatusline() {
  let input = '';
  const stdinTimeout = setTimeout(() => process.exit(0), 3000);

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    input += chunk;
  });

  process.stdin.on('end', () => {
    clearTimeout(stdinTimeout);

    try {
      const data = JSON.parse(input);
      const model = data.model?.display_name || 'Claude';
      const dir = data.workspace?.current_dir || process.cwd();
      const dirname = path.basename(dir) || dir;
      const account = getAccountLabel();
      const branch = getBranch(dir);
      const now = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const ctx = formatContext(data);
      const ctxResetClock = getContextResetClock(data);
      const fallbackLimits = [
        data.limits,
        data.rate_limits?.summary,
        data.rate_limits?.display,
        data.rate_limit?.summary
      ].find(v => typeof v === 'string' && v.trim()) || '';
      const limits = formatRateLimits(data.rate_limits) || fallbackLimits;
      const sep = '\x1b[31m│\x1b[0m';
      const parts = [];

      if (now) parts.push(`\x1b[33m${now}\x1b[0m`);
      if (account) parts.push(`\x1b[35m${account}\x1b[0m`);
      if (branch) parts.push(`\x1b[32m${branch}\x1b[0m`);
      parts.push(`\x1b[2m${model}\x1b[0m`);
      parts.push(`\x1b[36m${dirname}\x1b[0m`);
      if (ctx.display) parts.push(ctx.display.trim());
      if (ctxResetClock) {
        const label = ctx.usedPct == null ? 'ctx' : `ctx ${ctx.usedPct}%`;
        parts.push(`\x1b[2m${label} -> ${ctxResetClock}\x1b[0m`);
      }
      if (limits) parts.push(limits.replace(/^ │ /, '').trim());

      process.stdout.write(parts.join(` ${sep} `));
    } catch (_) {}
  });
}

module.exports = {
  formatClock,
  formatContext,
  formatRateLimits,
  getAccountLabel,
  getBranch,
  getContextResetClock
};

if (require.main === module) runStatusline();
