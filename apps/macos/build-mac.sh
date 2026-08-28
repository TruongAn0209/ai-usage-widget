#!/usr/bin/env bash
# Đóng gói .dmg cho macOS — CẢ Intel (x64) và Apple Silicon (arm64). Chạy TRÊN Mac (Electron
# không build chéo hệ điều hành được).
#
# Tạo file cài đặt độc lập, không cần thư mục mã nguồn/node_modules. Script này:
#   1. Đóng gói DMG cho cả 2 kiến trúc (electron-builder tự tải Electron đúng kiến trúc nếu chưa có).
#   2. Kiểm .app KHÔNG nhúng đường dẫn của máy build (chỉ có $HOME của MÁY BUILD mới lộ ra — nếu
#      dính, nghĩa là có chỗ nào trong code lỡ hardcode path thay vì dùng app.getPath()/os.homedir()).
#   3. Tính SHA-256 + ghi RELEASE_NOTES cho từng file để máy nhận tự đối chiếu.
#   4. Dừng ngay khi kiểm thử hoặc kiểm tra public thất bại.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -f node_modules/electron/path.txt ] || [ ! -d "node_modules/electron/dist/Electron.app/Contents/Frameworks" ]; then
  echo "❌ Electron chưa được cài đầy đủ. Chạy: npm ci" >&2
  exit 1
fi

echo "==> Chạy test trước (mục 16 — cấm đóng gói khi test đỏ)..."
npm test

echo "==> Đóng gói .dmg (x64 + arm64)..."
rm -rf -- "$(pwd)/dist"
# Ghi đè riêng cho bản kiểm thử: ký ad-hoc và tắt Hardened Runtime. `npm run dist` không có hai
# ghi đè này, nên khi có Developer ID electron-builder sẽ dùng luồng ký phát hành chuẩn.
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac \
  --config.mac.identity=- --config.mac.hardenedRuntime=false

echo "==> Xác minh chữ ký ad-hoc của cả hai app bundle..."
for APP in "dist/mac/AI Usage Widget.app" "dist/mac-arm64/AI Usage Widget.app"; do
  [ -d "$APP" ] || { echo "❌ Thiếu app bundle: $APP" >&2; exit 1; }
  codesign --verify --deep --strict --verbose=2 "$APP"
done

echo
echo "==> Kiểm .app KHÔNG nhúng đường dẫn máy build ($HOME)..."
LEAK=0
for APP_DIR in dist/mac dist/mac-arm64; do
  [ -d "$APP_DIR" ] || continue
  ASAR="$APP_DIR/AI Usage Widget.app/Contents/Resources/app.asar"
  if [ -f "$ASAR" ] && grep -aFq "$HOME" "$ASAR"; then
    echo "❌ $APP_DIR: có file nhúng \$HOME của máy build — SAI, phải sửa code trước khi phát bản rộng."
    LEAK=1
  fi
done
[ "$LEAK" -eq 0 ] && echo "✅ Sạch — không file nào trong .app nhúng đường dẫn máy build."
[ "$LEAK" -eq 0 ] || exit 1

VERSION=$(node -e "console.log(require('./package.json').version)")
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo source-export)
NOTES="dist/RELEASE_NOTES.txt"
{
  echo "AI Usage Widget for macOS — bản kiểm thử ký ad-hoc, chưa notarize"
  echo "Phiên bản: $VERSION"
  echo "Commit: $COMMIT_SHA"
  echo "Ngày đóng gói: $(date '+%Y-%m-%d %H:%M %Z')"
  echo
  echo "Checksum SHA-256:"
  ( cd dist && shasum -a 256 *.dmg )
  echo
  echo "Cài đặt (macOS 12+, bản ký ad-hoc chỉ dùng kiểm thử):"
  echo "  1. Mở file .dmg đúng kiến trúc máy (Apple Silicon → *-arm64.dmg, Intel → còn lại)."
  echo "     Không chắc máy nào: menu  → Giới thiệu về máy Mac này → xem 'Chip'."
  echo "  2. Kéo 'AI Usage Widget.app' vào Applications (thả đúng vào cửa sổ Applications hiện"
  echo "     ra khi mở .dmg — không copy qua Terminal/AirDrop rồi lại 'App Translocation' phiền)."
  echo "  3. Lần đầu mở: CHUỘT PHẢI vào app trong Applications → Open → Open nếu Gatekeeper cảnh báo."
  echo "  4. Nếu macOS báo 'damaged' (do build lại nhiều lần dính quarantine cũ):"
  echo "     xattr -cr \"/Applications/AI Usage Widget.app\""
  echo
  echo "CẦN NGƯỜI KIỂM TAY: cài/mở/thoát/mở lại trên Intel và Apple Silicon trước khi gửi."
  echo "Phát hành rộng: bắt buộc ký Developer ID + notarize + staple; xem docs/PUBLISHING.md."
} > "$NOTES"

echo
echo "✅ Xong. File trong dist/:"
ls -lh dist/*.dmg 2>/dev/null || true
echo
cat "$NOTES"
