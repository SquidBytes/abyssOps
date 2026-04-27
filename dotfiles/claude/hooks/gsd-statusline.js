#!/usr/bin/env node
// Claude Code StatusLine - GSD Edition
// Shows: time | account | branch | model | current task/GSD state | directory | context usage | limits

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

function readGsdState(dir) {
  const home = os.homedir();
  let current = dir;

  for (let i = 0; i < 10; i++) {
    const candidate = path.join(current, '.planning', 'STATE.md');
    if (fs.existsSync(candidate)) {
      try {
        return parseStateMd(fs.readFileSync(candidate, 'utf8'));
      } catch (_) {
        return null;
      }
    }

    const parent = path.dirname(current);
    if (parent === current || current === home) break;
    current = parent;
  }

  return null;
}

function parseStateMd(content) {
  const state = {};
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const match = line.match(/^(\w+):\s*(.+)/);
      if (!match) continue;

      const [, key, val] = match;
      const value = val.trim().replace(/^["']|["']$/g, '');
      if (key === 'status') state.status = value === 'null' ? null : value;
      if (key === 'milestone') state.milestone = value === 'null' ? null : value;
      if (key === 'milestone_name') state.milestoneName = value === 'null' ? null : value;
    }
  }

  const phaseMatch = content.match(/^Phase:\s*(\d+)\s+of\s+(\d+)(?:\s+\(([^)]+)\))?/m);
  if (phaseMatch) {
    state.phaseNum = phaseMatch[1];
    state.phaseTotal = phaseMatch[2];
    state.phaseName = phaseMatch[3] || null;
  }

  if (!state.status) {
    const bodyStatus = content.match(/^Status:\s*(.+)/m);
    if (bodyStatus) {
      const raw = bodyStatus[1].trim().toLowerCase();
      if (raw.includes('ready to plan') || raw.includes('planning')) state.status = 'planning';
      else if (raw.includes('execut')) state.status = 'executing';
      else if (raw.includes('complet') || raw.includes('archived')) state.status = 'complete';
    }
  }

  return state;
}

function formatGsdState(state) {
  const parts = [];

  if (state.milestone || state.milestoneName) {
    const version = state.milestone || '';
    const name = state.milestoneName && state.milestoneName !== 'milestone'
      ? state.milestoneName
      : '';
    const milestone = [version, name].filter(Boolean).join(' ');
    if (milestone) parts.push(milestone);
  }

  if (state.status) parts.push(state.status);

  if (state.phaseNum && state.phaseTotal) {
    parts.push(
      state.phaseName
        ? `${state.phaseName} (${state.phaseNum}/${state.phaseTotal})`
        : `ph ${state.phaseNum}/${state.phaseTotal}`
    );
  }

  return parts.join(' · ');
}

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

function writeContextBridge(data, session, usedPct) {
  if (session && !/[/\\]|\.\./.test(session)) {
    try {
      fs.writeFileSync(
        path.join(os.tmpdir(), `claude-ctx-${session}.json`),
        JSON.stringify({
          session_id: session,
          remaining_percentage: data.context_window?.remaining_percentage,
          used_pct: usedPct,
          timestamp: Math.floor(Date.now() / 1000)
        })
      );
    } catch (_) {}
  }
}

function getCurrentTask(session) {
  if (!session) return '';

  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const todosDir = path.join(claudeDir, 'todos');
  if (!fs.existsSync(todosDir)) return '';

  try {
    const files = fs.readdirSync(todosDir)
      .filter(file => file.startsWith(session) && file.includes('-agent-') && file.endsWith('.json'))
      .map(file => ({ name: file, mtime: fs.statSync(path.join(todosDir, file)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) return '';

    const todos = JSON.parse(fs.readFileSync(path.join(todosDir, files[0].name), 'utf8'));
    const inProgress = todos.find(todo => todo.status === 'in_progress');
    return inProgress?.activeForm || '';
  } catch (_) {
    return '';
  }
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
      const session = data.session_id || '';
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
      const task = getCurrentTask(session);
      const gsdState = task ? '' : formatGsdState(readGsdState(dir) || {});
      const middle = task
        ? `\x1b[1m${task}\x1b[0m`
        : (gsdState ? `\x1b[2m${gsdState}\x1b[0m` : '');
      const fallbackLimits = [
        data.limits,
        data.rate_limits?.summary,
        data.rate_limits?.display,
        data.rate_limit?.summary
      ].find(v => typeof v === 'string' && v.trim()) || '';
      const limits = formatRateLimits(data.rate_limits) || fallbackLimits;
      const sep = '\x1b[31m│\x1b[0m';
      const parts = [];

      writeContextBridge(data, session, ctx.usedPct);

      if (now) parts.push(`\x1b[33m${now}\x1b[0m`);
      if (account) parts.push(`\x1b[35m${account}\x1b[0m`);
      if (branch) parts.push(`\x1b[32m${branch}\x1b[0m`);
      parts.push(`\x1b[2m${model}\x1b[0m`);
      if (middle) parts.push(middle);
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
  formatGsdState,
  formatRateLimits,
  getAccountLabel,
  getBranch,
  getContextResetClock,
  getCurrentTask,
  parseStateMd,
  readGsdState
};

if (require.main === module) runStatusline();
