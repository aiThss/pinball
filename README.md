# Pinball Deposit Manager

Web app nội bộ để nhân viên lưu và truy xuất khách gửi giữ thẻ đổi quà và bi pinball.

## Stack

- Next.js app router
- MongoDB + Mongoose
- JWT trong HTTP-only cookie
- Role `admin` và `staff`
- Timezone nghiệp vụ: UTC+7, Hà Nội
- Dockerfile sẵn cho Dokploy

## Chức năng

- Đăng nhập mới xem được dữ liệu khách.
- Form tạo gửi giữ tự điền ngày/giờ hiện tại theo UTC+7.
- Bảng: `Họ và tên | SĐT | Ngày gửi | Giờ gửi | Thẻ | Bi | Tổng`.
- Tìm theo số điện thoại, họ tên, ngày gửi, trạng thái.
- Bản ghi mới nhất lên đầu.
- Cập nhật thẻ, bi, trạng thái; Admin sửa thêm thông tin khách/ngày giờ và xóa.
- Lưu lịch sử cập nhật gồm thời gian, nhân viên thao tác và nội dung thay đổi.
- Admin quản lý tài khoản nhân viên, tối đa 10 tài khoản hoạt động.

## Biến môi trường

Tạo `.env.local` khi chạy local, hoặc cấu hình trong Dokploy:

```env
MONGODB_URI=mongodb://localhost:27017/pinball
AUTH_SECRET=replace-with-a-long-random-secret-at-least-32-chars
NEXT_PUBLIC_APP_URL=https://pinball.babyress.games
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-password
ADMIN_DISPLAY_NAME=Admin
```

`ADMIN_USERNAME` và `ADMIN_PASSWORD` chỉ dùng để bootstrap khi collection `users` còn trống. Lần đăng nhập đầu tiên bằng tài khoản này sẽ tự tạo Admin.

## Chạy local

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`, đăng nhập bằng tài khoản admin bootstrap trong `.env.local`.

Tạo admin thủ công nếu muốn:

```bash
npm run seed:admin
```

## Production

```bash
npm ci
npm run build
npm run start
```

App chạy mặc định ở port `3000`.

## Deploy bằng Dokploy

1. Push repo lên `github.com/aiThss/pinball`.
2. Trong Dokploy, tạo app mới từ GitHub repo.
3. Chọn build bằng `Dockerfile`.
4. Cấu hình env: `MONGODB_URI`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
5. Trỏ domain `pinball.babyress.games` vào server Dokploy, gắn domain cho app và bật HTTPS.
6. Deploy, mở domain và đăng nhập lần đầu bằng admin bootstrap.
7. Vào tab `Nhân viên` để tạo tài khoản Staff/Admin thật, sau đó đổi hoặc gỡ `ADMIN_PASSWORD` nếu không cần bootstrap nữa.

## MongoDB

Collection chính:

- `customers_deposits`
- `users`

Schema `customers_deposits` gồm: `fullName`, `phone`, `depositDate`, `depositTime`, `cards`, `balls`, `totalText`, `status`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `history[]`.

## Bảo mật vận hành

- Dùng `AUTH_SECRET` dài, ngẫu nhiên, không commit lên Git.
- MongoDB không public Internet nếu không cần; nếu dùng managed MongoDB thì giới hạn IP hoặc user quyền hẹp.
- Staff không xóa bản ghi và không quản lý nhân viên.
- API validate số điện thoại Việt Nam và chặn số âm cho thẻ/bi.
