# AI Usage Widget for macOS

Widget nổi trên macOS để xem nhanh hạn mức đã dùng của Claude, GPT Plus/Codex, Antigravity,
Grok và OpenRouter. Ứng dụng đọc phiên đăng nhập có sẵn trên máy; không có máy chủ trung gian và
không tự làm mới hay ghi lại token.

> Dự án cộng đồng, không phải sản phẩm chính thức của Anthropic, OpenAI, Google, xAI hoặc
> OpenRouter. Tên và nhãn hiệu thuộc về chủ sở hữu tương ứng.

## Tính năng

- Hiển thị phần trăm đã dùng, thời gian đặt lại và cảnh báo 80%/95%.
- Năm bố cục, tám bảng màu, độ trong và vị trí tùy chỉnh.
- Thống kê ngữ cảnh Claude Code, token hôm nay từ CLI và Claude Desktop/IDE.
- Tự phát hiện nguồn đã đăng nhập; provider không có trên máy sẽ không được gọi.
- Chạy ở thanh menu, có phím tắt, khóa vị trí và tùy chọn mở cùng macOS.
- Giao diện Electron cách ly, không tải nội dung web vào cửa sổ.

Giao diện hiện dùng tiếng Việt.

## Nguồn dữ liệu

| Nguồn | Credential cục bộ | Nơi app hỏi hạn mức |
|---|---|---|
| Claude | OAuth Claude Code; dự phòng lịch sử hạn mức cục bộ của Claude Desktop/IDE | Anthropic hoặc cache IDE |
| GPT Plus/Codex | `~/.codex/auth.json` | ChatGPT |
| Antigravity | Không đọc token; nói chuyện với tiến trình `agy` | `127.0.0.1` |
| Grok | `~/.grok/auth.json` | Grok |
| OpenRouter | Biến môi trường hoặc file cấu hình riêng | OpenRouter |

Chi tiết đầy đủ về file được đọc và kết nối mạng nằm trong [PRIVACY.md](PRIVACY.md).

Các API hạn mức của Claude, ChatGPT và Grok không phải API ổn định dành riêng cho ứng dụng bên
thứ ba. Chúng có thể đổi; khi đó provider tương ứng sẽ báo lỗi cho tới khi dự án được cập nhật.

## Cài đặt

### Từ mã nguồn

Yêu cầu macOS 12 trở lên, Node.js 20.18.1 trở lên và npm.

```bash
git clone https://github.com/TruongAn0209/claude-usage-widget-mac.git
cd claude-usage-widget-mac
npm ci
npm test
npm start
```

### Bản DMG

Chỉ tải artifact từ trang Releases của đúng kho này và đối chiếu SHA-256 trong ghi chú phát hành.
Bản ký ad-hoc có thể bị Gatekeeper cảnh báo; bản phát hành rộng nên được ký Developer ID và
notarize bởi Apple.

## OpenRouter

Ứng dụng đóng gói không luôn nhận biến môi trường của Terminal. Có thể tạo file riêng:

```bash
mkdir -p "$HOME/.config/ai-usage-widget"
printf 'OPENROUTER_API_KEY=%s\n' 'dán-key-vào-đây' > "$HOME/.config/ai-usage-widget/openrouter.env"
chmod 600 "$HOME/.config/ai-usage-widget/openrouter.env"
```

File này đã nằm ngoài kho Git. Không gửi hoặc commit nó.

## Phát triển và kiểm thử

```bash
npm ci
npm audit
npm test
bash build-mac.sh
```

`build-mac.sh` tạo DMG Intel và Apple Silicon trong `dist/`, ký ad-hoc, kiểm chữ ký, kiểm đường
dẫn máy build và ghi SHA-256. Xem [docs/PUBLISHING.md](docs/PUBLISHING.md) trước khi public binary.

## Nguyên tắc an toàn

- Credential chỉ tồn tại ở tiến trình chính và chỉ được gửi tới đúng nhà cung cấp.
- App không có telemetry, quảng cáo, analytics hoặc backend riêng.
- File cấu hình xuất ra không chứa token.
- Không đăng credential/log thật vào issue. Xem [SECURITY.md](SECURITY.md).

## Giấy phép

[MIT](LICENSE). Các nhãn hiệu và dịch vụ bên thứ ba không thuộc giấy phép này.
