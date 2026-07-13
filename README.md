# Ký gửi PINBALL

Web app nội bộ để nhân viên lưu và truy xuất khách gửi giữ thẻ đổi quà và bi pinball.

## Stack

- Next.js app router
- MongoDB + Mongoose
- Timezone nghiệp vụ: UTC+7, Hà Nội
- Vercel deployment

## Luồng sử dụng

- Trang chính `/`: nhân viên chỉ nhập tên khi mở trang, không cần tài khoản hoặc mật khẩu.
- Khi tạo bản ghi, hệ thống tự lưu ngày và giờ hiện tại theo UTC+7.
- Mặc định tạo bản ghi ở tùy chọn `Gửi thẻ` và `Gửi bi`; chọn `Lấy thẻ` hoặc `Lấy bi` để tạo dòng lấy và tự trừ khỏi số đang giữ của khách.
- Trang nhân viên không cho nhập ngày/giờ thủ công.
- Trang `/admin`: xem chi tiết ngày/giờ, lọc theo ngày, xem lịch sử, sửa chi tiết và xóa bản ghi.
- Nút `Xuất Excel` tải file `.xlsx` theo dữ liệu đang lọc; ở `/admin` có thêm sheet lịch sử cập nhật.
- Lịch sử cập nhật ghi thời gian, tên nhân viên thao tác và nội dung thay đổi.

## Biến môi trường

Local dùng `.env.local`, Vercel cấu hình trong Project Settings:

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/pinball?retryWrites=true&w=majority&appName=Cluster0
NEXT_PUBLIC_APP_URL=https://pinball.babyress.games
```

Vercel cần MongoDB Atlas hoặc một MongoDB URL truy cập được từ Internet. Không dùng host MongoDB nội bộ của Dokploy.

## Chạy local

```bash
npm install
npm run dev
```

Mở:

- Nhân viên: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`

## Cài app PWA

Mở trang `/install` trên domain production để xem hướng dẫn cài app cho iOS, Android Chrome và Chrome desktop.

- iPhone/iPad: mở bằng Safari, bấm Chia sẻ, chọn Thêm vào Màn hình chính, rồi bấm Thêm.
- Android Chrome: mở bằng Chrome, bấm menu ba chấm, chọn Cài đặt ứng dụng hoặc Thêm vào màn hình chính.
- Chrome desktop: bấm biểu tượng cài đặt trên thanh địa chỉ, hoặc vào menu Chrome và chọn cài trang này dưới dạng ứng dụng.

Nếu máy đã từng cài bản icon lỗi, hãy xóa icon cũ khỏi màn hình chính rồi cài lại từ `/install`.

## Production

```bash
npm ci
npm run build
npm run start
```

## Deploy Vercel

1. Import repo `github.com/aiThss/pinball`.
2. Framework preset: `Next.js`.
3. Root directory: `./`.
4. Thêm env `MONGODB_URI` và `NEXT_PUBLIC_APP_URL`.
5. Deploy.
6. Vào Settings -> Domains, thêm `pinball.babyress.games`.
7. Trong Cloudflare tạo CNAME `pinball` theo giá trị Vercel yêu cầu, proxy để `DNS only` khi xác minh.

## MongoDB

Collection chính:

- `customers_deposits`
- `customers_daily_deposits`

Schema `customers_deposits` gồm: `fullName`, `phone`, `depositDate`, `depositTime`, `cardAction`, `ballAction`, `cards`, `balls`, `remainingCards`, `remainingBalls`, `totalText`, `status`, `createdAt`, `updatedAt`, `createdByName`, `updatedByName`, `history[]`.

`cards`/`balls` là số phát sinh của bản ghi để đối chiếu. `remainingCards`/`remainingBalls` là số còn đang giữ dùng cho phép trừ khi khách lấy lại. `customers_daily_deposits` lưu tổng phát sinh theo `date + phone` để admin xem mỗi khách gửi/lấy bao nhiêu trong ngày.

## Ghi chú vận hành

- Validate số điện thoại Việt Nam.
- Chặn số âm cho thẻ/bi.
- Nhân viên thao tác nhanh ở `/`.
- Admin kiểm tra chi tiết ở `/admin`.
