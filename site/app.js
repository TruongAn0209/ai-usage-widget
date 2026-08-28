const releaseUrl = 'https://github.com/TruongAn0209/ai-usage-widget/releases/latest';
const apiUrl = 'https://api.github.com/repos/TruongAn0209/ai-usage-widget/releases/latest';

function assetUrl(assets, pattern) {
  return assets.find((asset) => pattern.test(asset.name))?.browser_download_url || releaseUrl;
}

fetch(apiUrl, { headers: { accept: 'application/vnd.github+json' } })
  .then((response) => {
    if (!response.ok) throw new Error('No release');
    return response.json();
  })
  .then((release) => {
    const assets = release.assets || [];
    const windows = assetUrl(assets, /Windows.*Setup\.exe$/i);
    const macArm = assetUrl(assets, /macOS-arm64\.dmg$/i);
    for (const id of ['download-windows', 'windows-card']) document.getElementById(id).href = windows;
    for (const id of ['download-macos', 'mac-card']) document.getElementById(id).href = macArm;
    const date = new Date(release.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    document.getElementById('release-status').textContent = `${release.tag_name} · ${date}`;
  })
  .catch(() => {
    document.getElementById('release-status').textContent = 'Release builds are being prepared';
  });
