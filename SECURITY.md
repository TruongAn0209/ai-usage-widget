# Bảo mật

## Báo lỗi

Không đăng token, credential, transcript hoặc ảnh có dữ liệu riêng tư vào issue công khai. Hãy mở
GitHub Security Advisory riêng tại mục **Security → Report a vulnerability** của kho mã.

Kèm phiên bản app, phiên bản macOS, cách tái hiện và log đã che bí mật. Không gửi file
`auth.json`, `.credentials.json`, `.env` hoặc nội dung Keychain.

## Mô hình bảo mật

- Hai cửa sổ Electron bật `contextIsolation`, `sandbox`, tắt `nodeIntegration` và dùng CSP chỉ cho
  tài nguyên cục bộ.
- Cửa sổ widget không có quyền ghi cấu hình; IPC kiểm đúng trang gửi yêu cầu.
- Credential chỉ được đọc tại tiến trình chính, không chuyển sang giao diện.
- App không tự làm mới token và không ghi ngược vào nơi CLI/IDE lưu đăng nhập.

Các API hạn mức của nhà cung cấp có thể thay đổi mà không báo trước. Lỗi API nên làm provider báo
lỗi, không được khiến app lộ credential hoặc tự chuyển sang endpoint khác.
