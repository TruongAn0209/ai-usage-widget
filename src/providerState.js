const providerGood = new Map()
const providerById = new Map()

function fmtHHMM(ms) {
  if (!ms) return '?'
  const d = new Date(ms)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

function wrapStale(good, errorCode) {
  const hhmm = fmtHHMM(good.fetchedAt)
  return {
    ...good, ok: true, stale: true, error: errorCode,
    metrics: (good.metrics || []).map((metric) => ({
      ...metric, resetAt: null, stale: true, info: `mất mạng · số lúc ${hhmm}`,
    })),
  }
}

function buildEntry(provider) {
  if (provider.ok) {
    const dataStale = !!(provider.local && (provider.metrics || []).some((metric) => metric.stale))
    if (dataStale) {
      const previous = providerGood.get(provider.id)
      return { ...provider, fetchedAt: previous ? previous.fetchedAt : null, stale: true }
    }
    const withTime = { ...provider, fetchedAt: Date.now(), stale: false }
    providerGood.set(provider.id, withTime)
    return withTime
  }
  if (provider.local) return { ...provider, stale: false }
  const good = providerGood.get(provider.id)
  if (good) return wrapStale(good, provider.error)
  return { ...provider, stale: false }
}

function upsertProviders(list) {
  for (const provider of list) providerById.set(provider.id, buildEntry(provider))
  return [...providerById.values()]
}

function reconcileProviders(list, sourceIds) {
  const present = new Set(list.map((provider) => provider.id))
  for (const id of sourceIds) {
    if (!present.has(id)) {
      providerById.delete(id)
      providerGood.delete(id)
    }
  }
  return upsertProviders(list)
}

function removeProviders(ids) {
  for (const id of ids) {
    providerById.delete(id)
    providerGood.delete(id)
  }
  return [...providerById.values()]
}

module.exports = {
  buildEntry, wrapStale, upsertProviders, reconcileProviders, removeProviders,
  providerGood, providerById,
}
