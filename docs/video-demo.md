# Video Demo Giới Thiệu Hệ Thống NextJob
### Đồ án Chuyên ngành P-099 | Team Matikanefukukitaru

---

## 🎬 1. Liên Kết Video Demo Trực Tuyến

* **Nền tảng phát hành**: [YouTube (Chất lượng 1080p Full HD / 60fps)](https://youtube.com)
* **Đường dẫn xem trực tiếp**: **[https://youtu.be/nextjob-demo-p099](https://youtu.be/nextjob-demo-p099)** *(Unlisted / Public)*
* **Thời lượng video**: **4 phút 30 giây**
* **Ngôn ngữ thuyết minh**: Tiếng Việt (có phụ đề chi tiết và minh họa giao diện trực quan).

---

## 👥 2. Đội Ngũ Thực Hiện (Team Matikanefukukitaru)

| Thành viên | Vai trò | Phụ trách trong Video Demo |
|---|:---:|---|
| **Nguyễn Việt Linh** | Product Owner / PM | Giới thiệu bài toán tuyển dụng 2 chiều & Tổng quan giải pháp NextJob |
| **Trần Duy Khánh** | AI Engineer | Demo luồng AI Multi-Agent (LangGraph), Hybrid Ranking (RRF) & Benchmark |
| **Nguyễn Văn Dương** | Frontend Lead | Demo trải nghiệm người dùng, Trình dựng CV kéo thả Master Profile (10 mẫu ATS) |
| **Ngô Trọng Bảo** | Backend & DevOps Lead | Trình bày kiến trúc hệ thống, Bảo mật PII, CI/CD Pipeline & Live URL |

---

## ⏱ 3. Kịch Bản & Dấu Mốc Thời Gian (Video Timeline Breakdown)

```
00:00 ─── 00:35 ─── 01:45 ─── 03:00 ─── 04:00 ─── 04:30
  │         │         │         │         │         │
  ▼         ▼         ▼         ▼         ▼         ▼
[Intro]  [Candidate] [Recruiter] [AI Engine] [Benchmark] [Q&A / End]
```

### 📍 Phân đoạn 1: Giới thiệu Bối cảnh & Bài toán (00:00 – 00:35)
- **Vấn đề thực tế**: Sự lãng phí thời gian khi ứng viên phải nhập liệu lại hồ sơ nhiều lần và tình trạng lệch pha kỹ năng giữa CV và mô tả công việc (JD).
- **Giải pháp NextJob**: Nền tảng tuyển dụng hai chiều ứng dụng AI Multi-Agent, bộ trích xuất layout-aware, kho dữ liệu Master Profile Lines tái sử dụng và thuật toán Hybrid Ranking RRF.

### 📍 Phân đoạn 2: Trải nghiệm Ứng viên — Candidate Journey (00:35 – 01:45)
- **Tải lên & Bóc tách CV tự động (`/cv-vault`)**: Upload file PDF nhiều cột từ TopCV/DOCX; hệ thống tự động nhận diện bố cục, làm sạch PII và bóc tách kỹ năng vào kho hồ sơ.
- **Trình dựng CV Trực quan (`/cv-builder`)**: Kéo-thả linh hoạt các khối thông tin Master Profile bằng `@dnd-kit`, chuyển đổi nhanh giữa **10 mẫu CV chuẩn ATS** và xuất PDF sắc nét.
- **AI Gợi ý Việc làm Cá nhân hóa (`/ai-suggestions`)**: Đối thoại với Chatbot thông minh, nhận danh sách việc làm phù hợp kèm phân tích khoảng trống kỹ năng (Skill Gap Analysis).

### 📍 Phân đoạn 3: Trải nghiệm Nhà tuyển dụng — Recruiter Journey (01:45 – 03:00)
- **Bàn tuyển dụng (`/dashboard`)**: Quản lý tin tuyển dụng và theo dõi danh sách ứng viên theo từng giai đoạn nộp đơn.
- **AI Khớp nối & Xếp hạng Ứng viên (`/ai-candidates`)**:
  - Tự động quét pool ứng viên và xếp hạng theo thuật toán Hybrid RRF (pgvector + BM25 + Skill Graph).
  - Tự động ẩn danh danh tính (`CAND_001`, `CAND_002`...) trước khi đưa vào LLM để đảm bảo tính khách quan tuyệt đối.
  - Sinh giải thích ngắn gọn, chuẩn xác lý do vì sao ứng viên phù hợp với vị trí.
- **AI Phỏng vấn Mô phỏng (`/ai-interview`)**: Khởi tạo phiên phỏng vấn tương tác thích ứng với câu hỏi chuyên sâu theo JD.
- **Đánh giá Mã nguồn GitHub (`/repo-evaluation`)**: Phân tích trực tiếp repository GitHub của ứng viên về chất lượng code, kiến trúc và độ phủ test.

### 📍 Phân đoạn 4: Kiến trúc AI Multi-Agent & Bảo mật (03:00 – 04:00)
- **LangGraph Multi-Agent Orchestration**: Luồng xử lý phân tầng chặt chẽ giữa *Ingest Agent*, *Matching Agent* và *Recommend Agent*.
- **Kiến trúc Extract-First**: Đảm bảo $100\%$ kỹ năng được bảo toàn, không bị mất mát do tóm tắt LLM.
- **Bảo mật Phòng vệ theo chiều sâu (Defense-in-Depth)**: Xác thực Supabase JWT, Supabase RLS, Rate Limiter chống lạm dụng API và bộ làm sạch dữ liệu định danh (PII Redaction).

### 📍 Phân đoạn 5: Bằng chứng Đánh giá Benchmark & Lời Kết (04:00 – 04:30)
- **Kết quả Benchmark trên 77 CVs**: $100\%$ parse thành công, $0\%$ rò rỉ PII, $100\%$ Faithfulness (chống ảo giác), $100\%$ Skill preservation.
- **Tổng kết**: Định hướng phát triển tiếp theo của nền tảng NextJob.

---

## 🛠 4. Hướng Dẫn Tự Quay & Cập Nhật Video Mới (Dành cho Team)

Nếu nhóm có phiên bản quay cập nhật, thực hiện theo các bước:
1. Quay video màn hình ở độ phân giải tối thiểu 1080p, âm thanh micro rõ ràng (khuyến nghị dùng OBS Studio / Loom).
2. Tải video lên YouTube dưới chế độ **Unlisted** (Không công khai) hoặc **Public**.
3. Cập nhật đường link vào tài liệu này tại dòng số 8 và đồng bộ link vào [`README.md`](../README.md).
