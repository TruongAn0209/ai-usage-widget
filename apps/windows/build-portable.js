// Dong goi portable khong can electron-builder / khong can quyen admin.
// Copy Electron runtime, nhung app vao resources/app, doi ten exe.
const fs = require('fs');
const path = require('path');

const root = __dirname;
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
const outDir = path.join(root, 'dist', 'ClaudeUsageWidget');
const appName = 'ClaudeUsageWidget';

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

console.log('Cleaning output...');
rmrf(outDir);
fs.mkdirSync(outDir, { recursive: true });

console.log('Copying Electron runtime...');
copyDir(electronDist, outDir);

// Bo default_app de Electron dung app cua minh
const defaultApp = path.join(outDir, 'resources', 'default_app.asar');
if (fs.existsSync(defaultApp)) fs.rmSync(defaultApp);

console.log('Copying app files...');
const appDest = path.join(outDir, 'resources', 'app');
fs.mkdirSync(appDest, { recursive: true });
copyDir(path.join(root, 'src'), path.join(appDest, 'src'));
fs.copyFileSync(path.join(root, 'config.json'), path.join(appDest, 'config.json'));

// package.json toi gian cho ban dong goi (khong can devDeps)
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const runtimePkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  main: pkg.main,
};
fs.writeFileSync(path.join(appDest, 'package.json'), JSON.stringify(runtimePkg, null, 2));

console.log('Renaming executable...');
const oldExe = path.join(outDir, 'electron.exe');
const newExe = path.join(outDir, appName + '.exe');
if (fs.existsSync(oldExe)) fs.renameSync(oldExe, newExe);

console.log('\\nDone! Portable app o:');
console.log('  ' + outDir);
console.log('Chay bang: ' + appName + '.exe');
