# Lịch sử thay đổi

## 1.4.1 — 2026-09-11

- **Nâng cấp giao diện Terminal (`layout: terminal`):** Thêm dòng phụ `  └─ ...` hiển thị chi tiết đếm ngược reset, dự báo ETA, và trạng thái offline/stale; nhóm model AI có header `// GROUP`.
- **Thẻ trạng thái đa AI (Status Chips):** Đổi từ text xám mờ sang Pill Badges bo góc có chấm LED trạng thái động.
- **Bảng màu mới:** Bổ sung `oled` (OLED Pure Black) và `tokyo-night` trên cả macOS và Windows.
- **Trang Cài đặt nâng cấp:** Toggle switches native, Live Preview Mini-Card phản chiếu tức thì khi chọn bố cục/màu sắc, công tắc hiện % trên Menu Bar macOS.
- **Icon SVG:** Thay toàn bộ ký tự text cũ bằng SVG icons sắc nét.
- **Độ ổn định macOS:** Sửa lỗi app đóng gói bị chặn khởi tạo giao diện; bổ sung `singleInstanceLock` và tự động unhide/focus khi click lại app từ Finder/Spotlight.
- **Đồng bộ song song:** Toàn bộ tính năng giao diện mới được đồng bộ 100% giữa hai nền tảng macOS và Windows.

## 1.4.0 — 2026-08-29

- Nhận token ngày từ cả Claude CLI và Claude Desktop/IDE.
- Theo dõi trạng thái làm việc của Claude CLI hoặc IDE.
- Dò đủ provider cục bộ ngay khi khởi động.
- Thêm vị trí cấu hình OpenRouter trung tính cho người dùng công khai.
- Nâng Electron và electron-builder, xử lý toàn bộ cảnh báo phụ thuộc đã biết.
- Thêm hồ sơ quyền riêng tư, bảo mật, giấy phép, CI và kiểm tra chống lộ bí mật.

## 1.3.3

- Bổ sung Claude Desktop/IDE.

## 1.3.2

- Bổ sung GPT Plus/Codex, Grok và OpenRouter.
