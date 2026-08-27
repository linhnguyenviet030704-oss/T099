# Guardrail hội thoại song ngữ Việt–Anh

## Phạm vi

Lớp định tuyến hội thoại hỗ trợ tiếng Việt, tiếng Việt không dấu và tiếng Anh.
Nội dung dùng hệ chữ Nhật, Trung hoặc Hàn được đóng luồng bằng intent
`UNSUPPORTED_LANGUAGE`; nội dung đó không được gọi cơ sở dữ liệu hoặc provider.

Guardrail vẫn kiểm tra mẫu secret độc lập với ngôn ngữ trước khi phân loại intent.
Các chuỗi có cấu trúc rõ như API key, bearer token và JWT phải bị chặn ngay cả khi
phần văn bản còn lại dùng ngôn ngữ không hỗ trợ.

## Mô hình đe dọa

- Tài sản: API key, JWT, prompt hệ thống, cấu hình công cụ, dữ liệu CV và ngân sách provider.
- Biên tin cậy: trình duyệt đến FastAPI; FastAPI đến DB, LLM, embedding và reranker.
- Rủi ro: secret trong input, yêu cầu tiết lộ thông tin nội bộ, prompt injection trực tiếp,
  Unicode che giấu, phân loại nhầm làm gọi provider và output làm lộ cấu hình.
- Hành vi khi lỗi: chặn hoặc trả phản hồi tĩnh; không tự bỏ qua guardrail để tiếp tục.

## Mã quyết định

| Mã hoặc intent | Ý nghĩa | Hành vi |
|---|---|---|
| `DATA_SECRET_DETECTED` | Input chứa secret có cấu trúc | HTTP 400, không dispatch |
| `DATA_PROTECTED_INFO_REQUEST` | Yêu cầu API key, prompt hoặc cấu hình nội bộ | HTTP 400, không dispatch |
| `DATA_INJECTION_SIGNAL` | Ép đổi vai trò, bỏ chỉ dẫn hoặc gọi công cụ | HTTP 400, không dispatch |
| `UNSUPPORTED_LANGUAGE` | Ngôn ngữ ngoài Việt–Anh | HTTP 200 với hướng dẫn đổi ngôn ngữ |
| `UNKNOWN` | Có tín hiệu tuyển dụng nhưng yêu cầu chưa rõ | HTTP 200 và yêu cầu làm rõ |
| `OUT_OF_SCOPE` | Nội dung không thuộc tuyển dụng | HTTP 200 với giới hạn phạm vi |
| `OUTPUT_PROMPT_LEAKAGE` | Output chứa dấu hiệu tiết lộ prompt | Dùng fallback an toàn |

## Nguyên tắc chống false positive

Việc nhắc tới API không đủ để chặn. Câu hợp lệ như “Tôi có kinh nghiệm REST API”
hoặc “Explain what an API key is” phải đi qua input guardrail. Việc chặn yêu cầu secret
dựa trên tổ hợp động từ tiết lộ, quan hệ sở hữu và loại thông tin được bảo vệ.

## Cổng kiểm thử

- Secret leak và prompt-injection success phải bằng 0 trên safety suite bắt buộc.
- Request bị chặn không được gọi DB hoặc provider.
- Báo riêng kết quả cho Việt có dấu, Việt không dấu, Anh và Việt–Anh trộn.
- Theo dõi false-positive/refusal trên request tuyển dụng hợp lệ.
- Không dùng kết quả unit test để tuyên bố an toàn tuyệt đối hoặc production-ready.
