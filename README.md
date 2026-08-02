# [Tên Dự Án]

> Tóm tắt 1 câu: [Vấn đề] → [Giải pháp AI] cho [Target User]

## Vấn đề (Problem)

- Ai đang gặp vấn đề?
> Vấn đề 1: Ứng viên đi xin việc không biết thị trường việc làm hiện đang như thế nào, nhà tuyển dụng muốn tuyển ứng viên nhưng không biết thị trường nhân sự đang như thế nào.
> Vấn đề 2: Ứng viên mỗi khi tạo CV cần điền thông tin giống nhau, lặp lại.
- Vấn đề tốn bao nhiêu thời gian/tiền?
> Đối với ứng viên: phải đi tìm hiểu, hỏi chi tiết hoặc xem các thông tin rải rác của các công ty trên thị trường thông qua các kênh như TopCV, các web giới thiệu việc làm, các mạng xã hội. Đối với nhà tuyển dụng: sử dụng các nền tảng trên và chỉ thu thập được các CV được submit.
- Tại sao các giải pháp hiện tại chưa đủ?
> Hiện tại các trang như TopCV chưa có tính năng gợi ý việc làm phù hợp theo khả năng ứng viên mà chỉ đơn thuần là "việc làm tương tự" những vị trí đã submit CV.
## Giải pháp (Solution)

Sản phẩm giải quyết vấn đề như thế nào bằng AI:
- Feature 1: agent giúp gợi ý việc làm phù hợp cho ứng viên dựa trên khả năng, kinh nghiệm của ứng viên, kết hợp thuật toán matching.
- Feature 2: agent gợi ý ứng viên phù hợp với vị trí cho nhà tuyển dụng, dựa trên yêu cầu công việc, kết hợp thuật toán matching.
- Feature 3: Lưu trữ thông tin ứng viên như "feature" và cho phép tái sử dụng để tạo CV mới nhanh/đơn giản, giúp CV match yêu cầu công việc tốt hơn.

## Target User

- Primary: người tìm việc
- Secondary: nhà tyển dụng 
## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Agent | LangGraph + [LLM] |
| Backend | FastAPI + Python 3.11+ |
| Frontend | React/Next.js + TypeScript |
| Database | PostgreSQL / SQLite |
| DevOps | Docker + GitHub Actions |

## Deliverables Checklist

- [x] Source Code (GitHub)
- [x] README.md
- [ ] Architecture Diagram (`docs/architecture_diagram.md`)
- [ ] AI Logs (auto-collected)
- [ ] Live URL / Deploy
- [ ] Video Demo
- [ ] Pitch Deck (`presentation/`)
- [x] Weekly Journal (`JOURNAL.md`)
- [x] Worklog (`WORKLOG.md`)
- [ ] Evaluation Evidence (`eval/results/`)

## Team

| Member | Role | Student ID |
|--------|------|-----------|
| Nguyễn Việt Linh | Product owner / Product manager | 2A202601211 |
| Nguyễn Văn Dương | Fullstack developer | 2A202601400|
| Trần Duy Khánh | AI engineer | 2A202601696 |
| Ngô Trọng Bảo | Fullstack developer | 2A202601024 |

