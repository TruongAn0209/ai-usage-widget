## Mô tả thay đổi
<!-- Tóm tắt ngắn gọn những gì PR này thực hiện -->

## Nền tảng bị ảnh hưởng
- [ ] macOS (Apple Silicon / Intel)
- [ ] Windows (x64)
- [ ] Documentation / CI

## Checklist kiểm tra
- [ ] Đã chạy `npm test` ở root và tất cả test đều pass.
- [ ] Đã chạy `npm run check:public` xác nhận KHÔNG có rò rỉ đường dẫn cá nhân, secret hoặc token.
- [ ] Đã kiểm tra trực tiếp trên môi trường ứng dụng thực tế.
- [ ] Mã nguồn tuân thủ nguyên tắc Privacy: credentials chỉ lưu trong main process, không gửi ra ngoài.
