// Danh muc cac AI ho tro. Moi provider tu doc credential CUA MAY NGUOI DUNG.
// Them AI moi: viet 1 file trong thu muc nay (co detect + fetchUsage) roi khai bao o day.

const claude = require('./claude');
const codex = require('./codex');
const antigravity = require('./antigravity');
const grok = require('./grok');
const gemini = require('./gemini');
const openrouter = require('./openrouter');

// Con lai: copilot...
const ALL = [claude, codex, antigravity, grok, gemini, openrouter];

// Nguoi dung co the tat rieng tung AI trong Cai dat (config.disabledProviders = mang id).
// Mac dinh (mang rong) = hien TAT CA AI tim thay, giu dung hanh vi tu truoc gio.
function enabledList(config = {}) {
  const disabled = new Set((config && config.disabledProviders) || []);
  return ALL.filter((p) => !disabled.has(p.id));
}

// Tra ve cac provider TIM THAY tren may nay (da loai AI bi tat trong Cai dat).
function detectAvailable(config = {}) {
  const overrides = config.providerDirs || {};
  return enabledList(config).filter((p) => {
    try {
      return p.detect(overrides[p.id]);
    } catch {
      return false;
    }
  });
}

async function fetchFrom(found, config = {}) {
  const overrides = config.providerDirs || {};
  return Promise.all(
    found.map(async (p) => {
      try {
        return await p.fetchUsage(overrides[p.id]);
      } catch (e) {
        return {
          providerId: p.id,
          providerName: p.name,
          error: String(e.message || e),
        };
      }
    })
  );
}

// Lay usage cua tat ca provider tim thay. Loi 1 cai khong lam hong cai khac.
async function fetchAll(config = {}) {
  return fetchFrom(detectAvailable(config), config);
}

// Chi lay usage cua cac provider CUC BO (khong goi API tu xa, vd Antigravity) — dung cho
// nhip lam moi nhanh, khong bi ep sang 180s nhu cac provider goi may chu tu xa.
async function fetchLocal(config = {}) {
  return fetchFrom(
    detectAvailable(config).filter((p) => p.local),
    config
  );
}

module.exports = { ALL, detectAvailable, fetchAll, fetchLocal };
