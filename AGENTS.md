# Chỉ dẫn cho Codex trong dự án P-099

Trước khi sửa mã, hãy đọc `.agents/rules/README.md` và các rule được liên kết phù hợp với phạm vi công việc. Với thay đổi liên quan AI, agent, prompt, ingest CV, retrieval, matching, ranking, guardrail hoặc evaluation, bắt buộc đọc toàn bộ các file trong `.agents/rules/`.

Ưu tiên tài liệu mô tả code đang chạy là `docs/architecture-agent-backend.md` và code thực tế. `docs/ai_agent_matching_system_spec.md` là kiến trúc mục tiêu; không mặc định rằng mọi phần trong spec đã được triển khai.

Nếu rule và code mâu thuẫn, không âm thầm chọn một phía: nêu rõ mâu thuẫn, kiểm tra test và luồng gọi thật, rồi chọn thay đổi nhỏ nhất bảo toàn hành vi an toàn. Các yêu cầu trực tiếp của người dùng có độ ưu tiên cao hơn rule dự án, nhưng không được làm suy yếu bảo mật, quyền riêng tư hoặc tính trung thực của kết quả đánh giá mà không cảnh báo rõ.
