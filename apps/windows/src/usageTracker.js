const fs = require('fs');
const path = require('path');
const os = require('os');

// $/million tokens, ap dung theo prefix ten model. Uoc tinh, co the lech so voi hoa don that.
const PRICE_TABLE = [
  { match: /opus/i, input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  { match: /sonnet/i, input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  { match: /haiku/i, input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
];
const DEFAULT_PRICE = PRICE_TABLE[1]; // sonnet lam mac dinh khi khong nhan dien duoc

function priceFor(model) {
  return PRICE_TABLE.find((p) => p.match.test(model || '')) || DEFAULT_PRICE;
}

function findJsonlFiles(rootDir, maxAgeMs) {
  const results = [];
  const cutoff = Date.now() - maxAgeMs;
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try {
          const stat = fs.statSync(full);
          if (stat.mtimeMs >= cutoff) results.push({ file: full, mtimeMs: stat.mtimeMs });
        } catch {
          // skip
        }
      }
    }
  }
  walk(rootDir);
  return results;
}

function tokensForEntry(usage, cacheReadWeight) {
  if (!usage) return 0;
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheCreate = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  return input + output + cacheCreate + cacheRead * cacheReadWeight;
}

function costForEntry(usage, model) {
  if (!usage) return 0;
  const p = priceFor(model);
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheCreate = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  return (
    (input * p.input +
      output * p.output +
      cacheCreate * p.cacheWrite +
      cacheRead * p.cacheRead) /
    1e6
  );
}

function nextWeeklyReset(now, weekday, hour) {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  let diffDays = (weekday - d.getDay() + 7) % 7;
  if (diffDays === 0 && d.getTime() <= now.getTime()) diffDays = 7;
  d.setDate(d.getDate() + diffDays);
  return d;
}

function startOfToday(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Chi tinh phan "chi tiet hom nay" tu transcript local (token/chi phi/burn/model).
// Hai thanh chinh 5h & weekly KHONG tinh o day nua — lay so THAT tu rateLimits.js.
function computeTodayStats(config) {
  const claudeDir = config.claudeDir || path.join(os.homedir(), '.claude');
  const projectsDir = path.join(claudeDir, 'projects');
  const now = new Date();
  const nowMs = now.getTime();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const burnWindowMs = 5 * 60 * 1000;
  const todayStartMs = startOfToday(now);

  const files = findJsonlFiles(projectsDir, weekMs);

  let todayTokens = 0;
  let todayCost = 0;
  let burnTokens = 0;
  const modelTokens = {};
  const todaySessions = new Set();
  let todayMessages = 0;
  let lastEntryTs = null;

  for (const { file } of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const usage = obj.message && obj.message.usage;
      if (!usage || !obj.timestamp) continue;
      const ts = new Date(obj.timestamp).getTime();
      if (Number.isNaN(ts)) continue;
      const ageMs = nowMs - ts;
      if (ageMs < 0) continue;

      const tokens = tokensForEntry(usage, config.cacheReadWeight);
      const model = obj.message.model || 'unknown';

      if (ageMs <= burnWindowMs) burnTokens += tokens;

      if (ts >= todayStartMs) {
        todayTokens += tokens;
        todayCost += costForEntry(usage, model);
        todayMessages += 1;
        modelTokens[model] = (modelTokens[model] || 0) + tokens;
        if (obj.sessionId) todaySessions.add(obj.sessionId);
      }

      if (lastEntryTs === null || ts > lastEntryTs) lastEntryTs = ts;
    }
  }

  const burnRatePerMin = burnTokens / (burnWindowMs / 60000);

  const modelBreakdown = Object.entries(modelTokens)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([model, tokens]) => ({ model, tokens: Math.round(tokens) }));

  return {
    todayTokens: Math.round(todayTokens),
    todayCost: Math.round(todayCost * 100) / 100,
    todayMessages,
    todaySessions: todaySessions.size,
    burnRatePerMin: Math.round(burnRatePerMin),
    modelBreakdown,
    lastEntryTs,
  };
}

function projectName(cwd, file) {
  if (cwd) {
    const parts = cwd
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .filter((p) => p && !/^[A-Za-z]:$/.test(p)); // bo o dia "D:"
    if (parts.length >= 2) return parts.slice(-2).join('/');
    if (parts.length === 1) return parts[0];
  }
  // fallback: ten thu muc project (D--02-CLAUDE-WORKSPACE -> 02-CLAUDE-WORKSPACE)
  const dir = path.basename(path.dirname(file));
  return dir.replace(/^[A-Za-z]--/, '');
}

// Doc context hien tai cua tung phien = usage cua message assistant CUOI cung
// (input + cache_read + cache_creation ~ so token dang nam trong context).
function computeSessions(config) {
  const claudeDir = config.claudeDir || path.join(os.homedir(), '.claude');
  const projectsDir = path.join(claudeDir, 'projects');
  const activeWindowMs = (config.sessionActiveMinutes || 30) * 60 * 1000;
  const contextLimit = config.contextLimitTokens || 1000000;
  const nowMs = Date.now();

  const files = findJsonlFiles(projectsDir, activeWindowMs);
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const sessions = [];
  for (const { file, mtimeMs } of files.slice(0, 12)) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    let lastUsage = null;
    let model = null;
    let cwd = null;
    let sid = null;
    // duyet nguoc de lay entry co usage gan cuoi nhat cho nhanh
    for (let i = lines.length - 1; i >= 0 && !lastUsage; i--) {
      if (!lines[i] || !lines[i].includes('"usage"')) continue;
      try {
        const o = JSON.parse(lines[i]);
        const u = o.message && o.message.usage;
        if (u && (u.input_tokens || u.cache_read_input_tokens || u.cache_creation_input_tokens)) {
          lastUsage = u;
          model = o.message.model;
          cwd = o.cwd || cwd;
          sid = o.sessionId;
        }
      } catch {
        // skip
      }
    }
    // lay cwd tu bat ky dong nao neu chua co
    if (!cwd) {
      for (const line of lines) {
        if (line.includes('"cwd"')) {
          try {
            cwd = JSON.parse(line).cwd;
            if (cwd) break;
          } catch {
            // skip
          }
        }
      }
    }
    if (!lastUsage) continue;
    const ctx =
      (lastUsage.input_tokens || 0) +
      (lastUsage.cache_read_input_tokens || 0) +
      (lastUsage.cache_creation_input_tokens || 0);
    sessions.push({
      project: projectName(cwd, file),
      model: model || 'unknown',
      contextTokens: ctx,
      contextPct: Math.round((ctx / contextLimit) * 1000) / 10,
      ageMinutes: Math.floor((nowMs - mtimeMs) / 60000),
      sessionId: sid ? sid.slice(0, 8) : null,
    });
  }

  return {
    sessions,
    contextLimit,
    contextLimitSource: 'config',
    current: sessions[0] || null,
  };
}

module.exports = { computeTodayStats, computeSessions };
