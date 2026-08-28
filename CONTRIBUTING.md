# Đóng góp

Yêu cầu: macOS, Node.js 20.18.1 trở lên và npm.

```bash
npm ci
npm test
npm start
```

Trước khi gửi pull request:

1. Không thêm token, log thật, transcript hay đường dẫn máy cá nhân.
2. Provider chỉ được đọc credential, không tự làm mới hoặc ghi lại credential.
3. Mọi dữ liệu từ mạng/đĩa phải được kiểm kiểu trước khi đưa sang giao diện.
4. Thêm kiểm thử cho lỗi được sửa.
5. Chạy `npm audit` và `npm test`.

Ứng dụng hiện dùng giao diện tiếng Việt. Thay đổi câu chữ cần giữ ngắn để widget không tràn.
