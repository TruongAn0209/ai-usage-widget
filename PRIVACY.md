# Quyền riêng tư

AI Usage Widget không có máy chủ trung gian, tài khoản riêng, quảng cáo hay đo hành vi người dùng.

## Dữ liệu app đọc

- Claude Code: thông tin OAuth trong macOS Keychain hoặc `~/.claude/.credentials.json`.
- Claude Desktop/IDE: bộ đếm token ngày và lịch sử phần trăm hạn mức trong thư mục Application
  Support của Claude.
- GPT Plus/Codex: OAuth trong `~/.codex/auth.json`.
- Grok CLI: OAuth và bản ghi hạn mức gần nhất trong `~/.grok/`.
- Antigravity: trạng thái hạn mức từ tiến trình cục bộ đang chạy trên `127.0.0.1`.
- OpenRouter: `OPENROUTER_API_KEY` trong môi trường hoặc file
  `~/.config/ai-usage-widget/openrouter.env`.
- Claude Code: transcript cục bộ trong `~/.claude/projects/` để tính ngữ cảnh và thống kê ngày.

App chỉ đọc các nguồn trên, không sửa hoặc làm mới token. Token không được ghi vào cấu hình, log,
thông báo hay giao diện.

## Kết nối mạng

Mỗi credential chỉ được gửi thẳng tới dịch vụ đã cấp nó để đọc hạn mức: Anthropic, ChatGPT,
Grok hoặc OpenRouter. Antigravity chỉ dùng loopback cục bộ. App không gửi dữ liệu tới tác giả.

## Dữ liệu app ghi

App ghi cấu hình hiển thị và ảnh chụp hạn mức Antigravity gần nhất vào Application Support. File
cấu hình xuất ra không chứa token. Gỡ app không tự xóa các file này.

## Xóa dữ liệu

Thoát app, rồi xóa thư mục:

```bash
rm -r "$HOME/Library/Application Support/claude-usage-widget-mac"
```

Thao tác này chỉ xóa dữ liệu của widget, không xóa đăng nhập của các CLI/IDE.
