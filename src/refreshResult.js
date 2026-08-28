function providerResults(list) {
  return list.map((provider) => ({
    id: provider.id,
    name: provider.name,
    ok: provider.ok === true,
    error: provider.ok === true ? null : (provider.error || 'UNKNOWN'),
  }))
}

function aggregateRefreshResults(results) {
  const providerList = results.flatMap((result) => result && result.providers ? result.providers : [])
  const failed = providerList.filter((provider) => !provider.ok)
  const succeeded = providerList.length - failed.length
  let status = 'success'
  if (failed.length && succeeded) status = 'partial'
  else if (failed.length) status = 'failure'
  return {
    ok: failed.length === 0,
    status,
    providers: providerList,
    succeeded,
    failed: failed.length,
  }
}

module.exports = { providerResults, aggregateRefreshResults }
