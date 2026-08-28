# Phát hành công khai

## 1. Tạo kho Git riêng

Không đẩy thư mục này bằng lịch sử của kho làm việc chung. Tạo kho mới và chỉ sao chép cây nguồn
hiện tại để lịch sử nội bộ không đi theo:

```bash
rsync -a --exclude node_modules --exclude dist --exclude .git \
  ./claude-usage-widget-mac/ /đường/dẫn/claude-usage-widget-mac/
cd /đường/dẫn/claude-usage-widget-mac
git init
git add .
npm ci
npm audit
npm test
git commit -m "Initial public release"
```

Chạy `git status --ignored` và `npm run check:public` trước khi thêm remote.

## 2. Ký ứng dụng

`build-mac.sh` chỉ ký ad-hoc để kiểm thử nội bộ. Phát hành rộng cần:

1. Tài khoản Apple Developer và chứng chỉ Developer ID Application.
2. Hardened Runtime.
3. Notarization và staple cho cả DMG Intel lẫn Apple Silicon.
4. Kiểm `codesign --verify --deep --strict` và `spctl --assess` trên máy sạch.

Không đưa certificate, file `.p12`, mật khẩu Apple hoặc khóa notarization vào GitHub. Chỉ lưu
trong GitHub Actions Secrets nếu sau này thiết lập luồng ký tự động.

## 3. Kiểm trước khi tạo Release

```bash
npm ci
npm audit --audit-level=high
npm test
bash build-mac.sh
shasum -a 256 dist/*.dmg
```

Cài và thử đúng các ca sau trên một tài khoản macOS sạch:

- Intel và Apple Silicon.
- Chưa đăng nhập provider nào.
- Chỉ đăng nhập Claude Desktop; chỉ Claude CLI; cả hai cùng chạy.
- Bật/tắt mở cùng macOS.
- Từ chối quyền Automation rồi mở lại app.
- Mất mạng, token hết hạn và provider trả 429.

## 4. Nội dung Release

- DMG đúng hai kiến trúc.
- SHA-256.
- Thay đổi từ `CHANGELOG.md`.
- Phiên bản macOS tối thiểu.
- Nêu rõ đây là dự án cộng đồng và API nhà cung cấp có thể thay đổi.
