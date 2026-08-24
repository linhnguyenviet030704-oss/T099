# Hướng dẫn sử dụng NextJob

> Tài liệu mô tả **cách dùng giao diện web** NextJob (https://nextjob-ten.vercel.app) cho từng vai trò
> người dùng, dựa trên đọc trực tiếp source code frontend (`frontend/src/pages/`, `frontend/src/lib/`).
> SPA render phía client nên không thể "xem" nội dung qua fetch tĩnh — nội dung dưới đây phản ánh đúng
> route, form, nút bấm và luồng gọi API/Supabase đang có trong code tại thời điểm viết.
>
> Muốn hiểu kiến trúc/agent phía sau các tính năng AI, xem [`architecture-agent-backend.md`](architecture-agent-backend.md).
> Muốn chạy dự án ở local, xem [`README.md`](../README.md).

## 1. Tổng quan

NextJob là nền tảng tuyển dụng có AI matching hai chiều:

- **Ứng viên (candidate)**: tạo/tải CV, tìm việc, nộp đơn, nhận gợi ý việc làm phù hợp từ AI.
- **Nhà tuyển dụng (recruiter)**: đăng tin tuyển dụng, quản lý ứng viên nộp đơn, nhận gợi ý ứng viên phù hợp từ AI theo từng tin.
- **Admin**: duyệt đơn đăng ký trở thành nhà tuyển dụng, quản lý role người dùng.

Tài khoản mới đăng ký mặc định có role `candidate`. Muốn trở thành `recruiter` phải nộp đơn và được
`admin` phê duyệt (mục 4). Role `admin` chỉ được gán tay qua trang Admin hoặc trực tiếp trong Supabase.

## 2. Đăng ký / Đăng nhập

- **`/register`** — form Họ và tên, Email, Mật khẩu (tối thiểu 8 ký tự, có thanh đo độ mạnh Yếu/Trung bình/Mạnh).
  Ba trường hợp sau khi bấm "Đăng ký":
  1. Có session ngay → màn hình "Đăng ký thành công!" rồi tự chuyển tới `/profile` sau 1.5s.
  2. Cần xác minh email → hệ thống gửi lại email xác nhận, hiển thị "Kiểm tra email".
  3. Lỗi → banner đỏ hiển thị thông báo lỗi.
- **`/login`** — form Email/Mật khẩu (có nút hiện/ẩn mật khẩu). Đăng nhập thành công sẽ quay lại đúng
  trang người dùng định vào trước đó (hoặc `/`). Nếu đã đăng nhập, truy cập `/login` hay `/register` sẽ
  tự chuyển hướng đi nơi khác.

Sau khi đăng nhập, avatar/tên hiển thị ở góc phải Navbar mở menu: Hồ sơ, Tủ hồ sơ/CV (candidate),
Đơn ứng tuyển (candidate), Đăng ký làm NTD (candidate), Bàn tuyển dụng (recruiter), Quản trị (admin),
Đăng xuất. Có thêm nút đổi ngôn ngữ VI/EN và đổi giao diện sáng/tối ở Navbar.

## 3. Dành cho Ứng viên (candidate)

### 3.1 Trang chủ (`/`)

Trang giới thiệu: hero + nút CTA (đổi theo trạng thái đăng nhập/role), 4 số liệu thống kê minh hoạ
(không phải dữ liệu thời gian thực), danh sách 3 tin tuyển dụng mới nhất kéo trực tiếp từ Supabase,
và 3 thẻ tính năng dẫn tới hồ sơ/bàn tuyển dụng/trang admin tương ứng.

### 3.2 Tìm việc (`/jobs`, `/jobs/:id`)

- Trang danh sách hiển thị số tin đang tuyển, ô tìm kiếm (khớp tiêu đề/công ty/địa điểm/mô tả), panel
  "Lọc" theo loại hình công việc + địa điểm, và (nếu đã đăng nhập) bật lọc "Đã lưu" để chỉ xem tin đã
  bookmark. Mỗi thẻ tin có icon bookmark để lưu/bỏ lưu (`saved_jobs`), có toast xác nhận.
- Trang chi tiết hiển thị đầy đủ mô tả/yêu cầu/quyền lợi, badge còn hạn/hết hạn, mục "Việc tương tự".
  Panel nộp đơn bên phải thay đổi theo trạng thái:
  - Chưa đăng nhập → yêu cầu đăng nhập.
  - Đăng nhập nhưng không phải candidate → thông báo tính năng chỉ dành cho Ứng viên.
  - Đã nộp đơn → hiển thị trạng thái đơn + link "Xem đơn của tôi".
  - Chưa có CV nào → nhắc vào Tủ hồ sơ/CV để tạo/tải CV trước.
  - Đủ điều kiện → chọn CV (mặc định là CV đang đặt default), nhập thư giới thiệu (tuỳ chọn), bấm
    "Nộp đơn". Hệ thống lưu đơn (`job_submits`) rồi tự động ingest CV cho matching; nếu bước ingest lỗi,
    đơn vẫn được ghi nhận thành công (chỉ cảnh báo nhẹ).

### 3.3 Hồ sơ (`/profile`)

- **Thông tin cá nhân**: sửa Họ tên/Điện thoại/URL ảnh đại diện, bấm "Lưu thông tin".
- **Dòng hồ sơ** (`profile_lines`): các khối nội dung tái sử dụng (kinh nghiệm, học vấn, kỹ năng...)
  dùng để dựng CV nhanh. Thêm dòng mới qua form loại + nội dung; xoá dòng có xác nhận trước khi xoá.
- Nút "Tủ hồ sơ/CV" dẫn sang mục 3.4.

### 3.4 Tủ hồ sơ/CV (`/cv-vault`)

- **Tạo CV** → sang trình dựng CV (mục 3.5).
- **Tải lên** → chọn file PDF/DOC/DOCX (tối đa 10MB), đặt tên, tải lên Storage; CV đầu tiên tự động
  đặt làm mặc định. Sau khi upload, hệ thống tự ingest (trích skill + embedding) để phục vụ AI matching;
  lỗi ingest không chặn việc lưu CV.
- Mỗi CV trong danh sách hiển thị tên/ngày tạo/số đơn đã dùng CV này, kèm hành động: đặt làm mặc định
  (icon sao), đổi tên (icon bút, sửa inline), mở file (icon link ngoài, mở qua signed URL).

### 3.5 Trình dựng CV (`/cv-builder`)

Giao diện 2 cột chia đôi màn hình:

- **Cột trái**: kho "Dòng hồ sơ Master" (các dòng chưa đưa vào CV hiện tại, có nút thêm từng dòng hoặc
  "+ Thêm tất cả"), nút "Tạo dòng mới" (dòng trống), và "Tải CV bóc tách" (upload CV có sẵn để hệ thống
  tự trích thêm dòng hồ sơ mới nạp vào kho). Danh sách các dòng đã đưa vào CV hỗ trợ kéo-thả sắp xếp,
  tick chọn/bỏ chọn từng dòng, xoá dòng khỏi CV, và có ô sửa Họ tên/Email/Số điện thoại hiển thị trên CV.
- **Chọn mẫu (template)**: 10 mẫu (Modern, Sidebar, Classic, Compact, Elegant, Minimal, Professional,
  Creative, Timeline, Two Column) — chọn mẫu sẽ đổi ngay bản xem trước.
- **Cột phải**: bản xem trước CV dạng A4, tự cập nhật theo dòng/mẫu đã chọn.
- **Xuất CV**: mở modal chọn kiểu PDF — "Bản dựng hình ảnh" (khớp chính xác bản xem trước, phù hợp
  tiếng Việt có dấu, dung lượng lớn hơn) hoặc "Bản chữ sắc nét" (văn bản có thể chọn/tìm kiếm, nhẹ hơn);
  đặt tên hồ sơ CV; nếu có sửa/thêm dòng trong phiên làm việc, có thể tick để lưu ngược các thay đổi đó
  vào kho dòng hồ sơ gốc. Bấm "Tạo & lưu CV" để xuất, lưu vào Tủ hồ sơ/CV và tự ingest.

### 3.6 Đơn ứng tuyển của tôi (`/applications`)

Danh sách đơn đã nộp (mới nhất trước), mỗi đơn hiển thị tin/công ty/ngày nộp/trạng thái, có thể mở
rộng xem lịch sử thay đổi trạng thái. Đơn chưa ở trạng thái cuối có thể "Rút đơn" (yêu cầu xác nhận,
không thể hoàn tác — hệ thống ghi nhận là một bước trạng thái mới `withdrawn`, không xoá đơn).

### 3.7 Gợi ý việc làm AI (`/ai-suggestions`)

Giao diện chat toàn màn hình. Panel phải hiển thị CV mặc định đang dùng để matching và cho chọn chế
độ rerank: **Qwen AI Reranker** (deep reranking bằng LLM) hoặc **RRF Fusion Match** (trộn điểm vector +
từ khoá BM25). Gõ câu hỏi hoặc bấm gợi ý nhanh "Gợi ý việc phù hợp" để AI trả về tối đa 10 việc làm,
chia 3 nhóm theo điểm phù hợp: **Phù hợp cao** (≥45%), **Bình thường** (≥30%), **Chưa phù hợp** (dưới
30%) — mỗi kết quả kèm giải thích AI vì sao phù hợp và nút xem chi tiết tin. Lịch sử chat chỉ tồn tại
trong phiên hiện tại (không lưu lại sau khi tải lại trang).

### 3.8 Đăng ký làm Nhà tuyển dụng (`/recruiter-register`)

Form: Tên công ty (bắt buộc), Email công ty, Website, Đường dẫn giấy phép kinh doanh. Gửi đơn tạo một
yêu cầu chờ duyệt (`pending`); nếu đã có đơn đang chờ, gửi lại sẽ cập nhật đơn đó thay vì tạo mới.
Trang luôn hiển thị trạng thái đơn gần nhất (chờ duyệt/đã duyệt/đã từ chối, kèm ghi chú của admin nếu
bị từ chối). Sau khi admin phê duyệt, tài khoản tự động được nâng role thành `recruiter` ở lần tải
trang kế tiếp.

## 4. Dành cho Nhà tuyển dụng (recruiter)

### 4.1 Bàn tuyển dụng (`/dashboard`)

Nếu chưa có công ty được duyệt, trang chặn tạo tin và hiển thị lối vào lại mục 3.8. Khi đã có công ty:

- **Danh sách tin**: mỗi tin hiển thị trạng thái, số ứng viên, hạn nộp, và các nút đổi trạng thái nhanh
  (→ Đang tuyển / Closed / Archived). Đăng tin (chuyển "Đang tuyển") sẽ hiển thị công khai ngay trên
  `/jobs`.
- **Tạo/sửa tin**: Tiêu đề và Mô tả công việc bắt buộc. Trường **"Yêu cầu ứng viên (AI Matching)"** là
  cốt lõi để AI gợi ý ứng viên — nếu bỏ trống, hệ thống cảnh báo vì sẽ ảnh hưởng chất lượng matching.
  Ngoài ra có Quyền lợi, Địa điểm, Hình thức làm việc, Lương tối thiểu/tối đa + tiền tệ, Hạn nộp, Trạng
  thái (Bản nháp/Đang tuyển).
- **Danh sách ứng viên** (khi chọn 1 tin): tên, CV (mở qua signed URL), trạng thái hiện tại; đơn chưa ở
  trạng thái cuối có nút "Cập nhật" để đổi trạng thái + ghi chú (lưu thành một bước lịch sử mới).

### 4.2 Gợi ý ứng viên AI (`/ai-candidates`)

Giống giao diện chat của mục 3.7 nhưng phải chọn 1 tin tuyển dụng trước (dropdown ở đầu trang) — ô
nhập và toggle rerank bị khoá cho tới khi chọn tin. Kết quả chỉ gồm ứng viên đã nộp đơn vào đúng tin
đó, chia theo 3 nhóm mức độ phù hợp như mục 3.7, kèm lý do AI và nút xem CV. Panel tham số bên phải
(số lượng tối đa, ngưỡng điểm, trọng số kỹ năng/kinh nghiệm, lọc CV đã xác minh) hiện được đánh dấu
**"Mock — chưa áp dụng"** — các trường này chỉ minh hoạ, chưa có tác dụng thật.

## 5. Dành cho Admin

Trang **`/admin`** có 2 tab:

- **Duyệt đăng ký Recruiter**: danh sách đơn theo trạng thái (chờ duyệt/đã duyệt/đã từ chối) kèm tìm
  kiếm. Với đơn chờ duyệt: nhập ghi chú (bắt buộc nếu từ chối), bấm "Phê duyệt" hoặc "Từ chối". Phê
  duyệt sẽ đồng thời: nâng role người dùng thành `recruiter`, tự tạo công ty (`companies`) và gán họ
  làm `owner` — đây là bước thực sự cấp quyền dùng Bàn tuyển dụng.
- **Quản lý & Sửa quyền**: tìm kiếm và đổi role (candidate/recruiter/admin) trực tiếp cho bất kỳ tài
  khoản nào.

Ghi chú: trang Hồ sơ (`/profile`) cũng có một bảng đổi role rút gọn dành riêng cho admin, độc lập với
tab "Quản lý & Sửa quyền" ở trên — cả hai đều ghi thẳng vào `profiles.role`.

## 6. Lưu ý chung khi vận hành

- Các thao tác **ingest CV** (upload CV, tải CV bóc tách, xuất CV từ trình dựng, nộp đơn) đều gọi ngầm
  `POST /api/v1/resumes/{id}/ingest`. Nếu bước này lỗi (ví dụ thiếu `QWEN_API_KEY` phía backend), thao
  tác chính của người dùng **vẫn thành công** — chỉ hiện cảnh báo "Index CV thất bại — hệ thống sẽ thử
  lại khi matching." CV vẫn được lưu, chỉ chưa có embedding để AI matching cho tới lần ingest kế tiếp.
- Việc **gợi ý việc làm cho candidate** (`/ai-suggestions`) hiện dùng ranking giả lập (`mock_recommend`)
  phía backend, chưa nối vào Matching Agent thật; chỉ nhánh **recruiter → candidate** (`/ai-candidates`)
  đã chạy Matching Agent (LangGraph) thật. Xem chi tiết ở mục 4 "Matching Agent" trong [`architecture-agent-backend.md`](architecture-agent-backend.md).
- Tài khoản seed để test nhanh (mật khẩu `password123`): `candidate@example.com`, `recruiter@example.com`,
  `admin@example.com` (chỉ có khi chạy local theo README, không áp dụng cho môi trường production trên
  Vercel).
