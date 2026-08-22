# Báo cáo đánh giá Ingest Agent

- Ngày chạy: 2026-08-22
- Mẫu: 41 CV (xem `evaluation/ingest_eval_v2/manifest.json`) — 36 CV tổng hợp từ `data_find/generated_cv/` + 5 CV thật cấu trúc khó từ `evaluation/cv_hard/`
- Chat model: `gpt-4o-mini` (OpenAI) — LLM-judge cũng dùng model này
- Embedding model: `text-embedding-3-small` (OpenAI, dim=1536)
- Pipeline: chạy `build_ingest_graph()` thật (đã redesign) từ `backend/app/agents/ingest/graph.py`, thứ tự node hiện tại là `parse -> clean -> extract -> summarize -> embed` (extract chuyển lên trước summarize), qua `graph.astream(..., stream_mode="values")`, inject `complete`/`encode` bằng OpenAI (production dùng Qwen).

## 1. Tổng quan

| Metric | Giá trị |
|---|---|
| Tỷ lệ parse thành công | 41/41 |
| CV bị gắn cờ `low_content` (parse quá ít nội dung) | 0/41 |
| CV còn PII (regex) trong text lưu cuối cùng | 0/41 |
| CV bị lộ token tên ứng viên trong text cuối | 2/41 |
| CV bị LLM-judge gắn cờ còn PII | 3/41 |
| CV có `summary` rỗng | 0/41 |
| CV có embedding lỗi (sai dim / vector rỗng) | 0/41 |
| Faithfulness trung bình của `summarize` (kiểu RAGAS, tỷ lệ claim được support) | 0.99 |
| Precision trích skill trung bình (ước lượng bằng LLM-judge) | 0.90 |
| Recall trích skill trung bình (ước lượng bằng LLM-judge) | 0.64 |
| Recall skill trung bình so với text đầy đủ trước summarize (đo bằng code, không qua LLM) | 1.00 |
| Tổng số skill bị mất do summarization trong cả mẫu (đo bằng code — kỳ vọng ~0 sau khi đổi thứ tự node) | 0 |
| Latency trung bình toàn pipeline | 8530.60 ms |

## 2. Latency theo từng node (ms)

| Node | Trung bình | Trung vị | Max |
|---|---|---|---|
| parse | 678.55 | 543.90 | 5236.10 |
| clean | 2.35 | 1.10 | 46.80 |
| extract | 37.73 | 39.20 | 79.70 |
| summarize | 7126.31 | 6625.10 | 12943.90 |
| embed | 685.66 | 628.50 | 1316.00 |

## 3. Độ phủ taxonomy skill

`extract_skills()` hiện nhận diện **185 skill chuẩn hoá** trong `backend/app/services/matching/resources/skill_graph.json`, cộng thêm một lớp fuzzy-match (rapidfuzz, ngưỡng 88) cho lỗi chính tả/spacing nhẹ. Phủ thêm các domain trước đây bị bỏ sót: ML/AI, embedded/firmware, data infra, blockchain, robotics, networking, mobile, DevOps. Bảng mục 6 bên dưới cho recall/precision thực đo trên từng CV.

## 4. Thứ tự extract/summarize (bug đã sửa, đo lại ở đây)

Trước redesign, `extract_skills()` chạy trên `state["markdown"]` **sau khi** node `summarize` ghi đè key này bằng bản LLM viết lại, nên skill bị bản tóm tắt bỏ sót sẽ mất vĩnh viễn. Từ redesign này, graph chạy `extract` **trước** `summarize` (`backend/app/agents/ingest/graph.py`), nên `lost_to_summarization` ở mục 1 kỳ vọng gần 0 cho toàn bộ mẫu. Bảng dưới liệt kê case nào (nếu có) vẫn còn mất skill, để soi lại nếu số khác 0.

Không có CV nào trong mẫu bị mất skill do summarization — đúng như kỳ vọng sau khi đổi thứ tự node.

## 5. Faithfulness (summarize) — các case tệ nhất

Score = số claim được support / tổng số claim, LLM-judge chấm từng claim so với text gốc trước summarize, sau đó tổng hợp bằng code (không lấy điểm tự chấm của model). Prompt `summarize.txt` có chỉ dẫn chống bịa đặt (anti-hallucination).

| CV | Score | Claim không được support |
|---|---|---|
| HARD-PHI-NGOC-THIEN-TopCV.vn- | 0.88 | The generated titles include 'Backend Developer'. |
| G10-VOI-03 | 0.91 | Specializing in backend engineering |
| G6-CV-02 | 1.00 | — |
| G6-CV-05 | 1.00 | — |
| G6-NLP-02 | 1.00 | — |
| G6-NLP-03 | 1.00 | — |
| G9-CA-04 | 1.00 | — |
| G9-SWA-03 | 1.00 | — |
| G12-BC-03 | 1.00 | — |
| G12-SC-01 | 1.00 | — |

## 6. Độ chính xác trích skill — các case tệ nhất

| CV | Precision | Recall | False positive | False negative |
|---|---|---|---|---|
| G2-SA-06 | 0.78 | 0.39 | TestNG, Rust | Veeam, VMware vSphere, Hyper-V, Microsoft 365, Entra Connect, Active Directory, Samba, Zabbix, PRTG, Veeam ONE, FortiGate |
| HARD-Mobile Developer Intern  | 0.67 | 0.50 | Go, TestNG, Flink | Android Studio, Genymotion, Firebase, OOP (Object-Oriented Programming), MVC (Model-View-Controller), MVVM (Model-View-ViewModel) |
| G4-PT-09 | 0.83 | 0.36 | TestNG | Enumeration, SQL Injection, Kali Linux, GitHub Pages, Nmap service enumeration, CVEs, Bash script, Nikto, Gobuster |
| G12-SC-01 | 0.71 | 0.53 | Oracle Database, JUnit, CAN Bus, TestNG | Foundry, Echidna, Slither, Certora, EIP-712, EIP-2612, ERC-4337, ERC-4626, ERC-2981 |
| G5-BI-02 | 0.80 | 0.44 | jQuery | DAX, Power Query, T-SQL, SSRS, Google Data Studio |
| G13-UX-03 | 0.88 | 0.39 | TestNG | Hotjar, Bizagi, BPMN, UML, SQL for my own data questions, journey and process mapping, content design for enterprise software, stakeholder mapping, sprint demos, roadmap input, working with sales and implementation teams on churn and adoption |
| G11-CSE-02 | 0.75 | 0.55 | Azure, GCP | Lambda, WSUS, KMS, WAF, Inspector |
| G1-DT-01 | 0.78 | 0.54 | ASP.NET, JUnit | MVVM with Prism, Windows 10, Crystal Reports, XPS renderer, TOEIC 780, Japanese - N4 |
| G8-PDM-01 | 0.67 | 0.67 | Ruby on Rails, JUnit, TestNG | Google Analytics, Firebase, SQL |
| G15-ROB-03 | 0.70 | 0.64 | Node.js, TestNG, Embedded C, iOS, RTOS, PLC | TensorRT, Quantisation, Pruning, Gazebo, Isaac Sim, MLflow, CMake, Jetson platform work including power and thermal budgets |

## 7. Các case rò rỉ PII

`redact_pii()` có pattern domain/path tổng quát (bắt được mention kiểu `twitter.com/handle` không có scheme) và phát hiện tên bị "wrap" xuống dòng.

| CV | Số lần khớp regex | Token tên bị lộ | Ví dụ LLM-judge tìm được |
|---|---|---|---|
| G8-PDM-01 | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | Minh | — |
| HARD-Mobile Developer Intern  | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | Huy | — |
| G6-NLP-02 | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | — | BUI VAN THO; Thu Duc, Ho Chi Minh City |
| G5-BI-07 | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | — | DO THI QUE ANH; Dong Da, Ha Noi |
| G10-TEL-05 | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | — | TRINH CONG HAU; Long Bien, Ha Noi |

## 8. Chi tiết từng CV

| CV | Nhóm ngành | Chất lượng | Số ký tự parse | low_content | Faithfulness | Skill P/R | Skill mất | PII hits | Total ms |
|---|---|---|---|---|---|---|---|---|---|
| G1-DT-01 | Software Development | polished | 3545 | không | 1.00 | 0.78/0.54 | 0 | 0 | 7594.30 |
| G1-GM-03 | Software Development | cross_domain | 3351 | không | 1.00 | 0.89/0.47 | 0 | 0 | 10929.60 |
| G10-TEL-05 | Networking | polished | 3562 | không | 1.00 | 1.00/0.83 | 0 | 0 | 11677.20 |
| G10-VOI-03 | Networking | cross_domain | 5812 | không | 0.91 | 0.90/0.65 | 0 | 0 | 8493.30 |
| G11-CSA-03 | Cloud Computing | cross_domain | 6947 | không | 1.00 | 0.87/0.54 | 0 | 0 | 10088.60 |
| G11-CSE-01 | Cloud Computing | polished | 7040 | không | 1.00 | 1.00/0.62 | 0 | 0 | 8158.00 |
| G11-CSE-02 | Cloud Computing | sparse | 2224 | không | 1.00 | 0.75/0.55 | 0 | 0 | 6260.00 |
| G12-BC-03 | Blockchain & Web3 | cross_domain | 6279 | không | 1.00 | 0.90/0.63 | 0 | 0 | 11504.80 |
| G12-SC-01 | Blockchain & Web3 | polished | 6912 | không | 1.00 | 0.71/0.53 | 0 | 0 | 9281.50 |
| G13-UI-01 | UI/UX & Product Design | polished | 5745 | không | 1.00 | 1.00/0.77 | 0 | 0 | 10218.70 |
| G13-UX-02 | UI/UX & Product Design | sparse | 1812 | không | 1.00 | 1.00/0.75 | 0 | 0 | 5759.10 |
| G13-UX-03 | UI/UX & Product Design | cross_domain | 5054 | không | 1.00 | 0.88/0.39 | 0 | 0 | 8504.80 |
| G14-ODO-01 | ERP/CRM & Enterprise Systems | polished | 6399 | không | 1.00 | 0.85/0.69 | 0 | 0 | 6667.20 |
| G14-SF-03 | ERP/CRM & Enterprise Systems | cross_domain | 5024 | không | 1.00 | 1.00/0.67 | 0 | 0 | 8522.00 |
| G15-IOT-01 | Embedded Systems/IoT | polished | 6897 | không | 1.00 | 0.81/0.54 | 0 | 0 | 14553.70 |
| G15-ROB-03 | Embedded Systems/IoT | cross_domain | 6522 | không | 1.00 | 0.70/0.64 | 0 | 0 | 7678.90 |
| G2-SA-06 | DevOps/Infrastructure | polished | 4714 | không | 1.00 | 0.78/0.39 | 0 | 0 | 10542.60 |
| G2-SRE-03 | DevOps/Infrastructure | cross_domain | 4164 | không | 1.00 | 0.88/0.65 | 0 | 0 | 10175.50 |
| G3-NA-02 | System Administration | sparse | 1531 | không | 1.00 | 1.00/0.50 | 0 | 0 | 5655.80 |
| G3-SA-03 | System Administration | cross_domain | 4508 | không | 1.00 | 0.92/0.88 | 0 | 0 | 7939.90 |
| G3-SA-05 | System Administration | polished | 1831 | không | 1.00 | 1.00/0.73 | 0 | 0 | 6083.10 |
| G4-MA-03 | Cybersecurity | cross_domain | 5201 | không | 1.00 | 0.94/0.52 | 0 | 0 | 8326.90 |
| G4-PT-09 | Cybersecurity | polished | 3018 | không | 1.00 | 0.83/0.36 | 0 | 0 | 6368.10 |
| G5-BI-02 | Data | sparse | 1416 | không | 1.00 | 0.80/0.44 | 0 | 0 | 4634.20 |
| G5-BI-07 | Data | polished | 1721 | không | 1.00 | 0.88/0.78 | 0 | 0 | 5969.90 |
| G5-DS-03 | Data | cross_domain | 4901 | không | 1.00 | 1.00/0.61 | 0 | 0 | 8402.90 |
| G6-CV-02 | AI/ML | sparse | 2196 | không | 1.00 | 0.94/0.77 | 0 | 0 | 8196.40 |
| G6-CV-05 | AI/ML | polished | 3894 | không | 1.00 | 0.92/0.71 | 0 | 0 | 10318.90 |
| G6-NLP-02 | AI/ML | sparse | 2276 | không | 1.00 | 0.82/0.56 | 0 | 0 | 7496.20 |
| G6-NLP-03 | AI/ML | cross_domain | 6432 | không | 1.00 | 1.00/0.63 | 0 | 0 | 10894.20 |
| G7-AT-03 | QA/Testing | cross_domain | 4961 | không | 1.00 | 0.92/0.89 | 0 | 0 | 12125.30 |
| G7-AT-05 | QA/Testing | polished | 4560 | không | 1.00 | 1.00/0.90 | 0 | 0 | 7748.60 |
| G8-PDM-01 | Project/Product Management | polished | 6184 | không | 1.00 | 0.67/0.67 | 0 | 0 | 6477.00 |
| G8-PDM-03 | Project/Product Management | cross_domain | 5124 | không | 1.00 | 0.92/0.71 | 0 | 0 | 8618.80 |
| G9-CA-04 | Architecture | polished | 2728 | không | 1.00 | 1.00/0.88 | 0 | 0 | 7985.90 |
| G9-SWA-03 | Architecture | cross_domain | 6377 | không | 1.00 | 1.00/0.60 | 0 | 0 | 7820.80 |
| HARD-CV Dương Hồng Đức - CV1_ | CV Hard (thực tế) | hard_real_world | 2779 | không | 1.00 | 1.00/0.77 | 0 | 0 | 8980.70 |
| HARD-CV_LeVanSy_Backend_Inter | CV Hard (thực tế) | hard_real_world | 2013 | không | 1.00 | 0.90/0.69 | 0 | 0 | 11082.20 |
| HARD-Mobile Developer Intern  | CV Hard (thực tế) | hard_real_world | 2281 | không | 1.00 | 0.67/0.50 | 0 | 0 | 4413.20 |
| HARD-Nguyen-Anh-Tuan-TopCV.vn | CV Hard (thực tế) | hard_real_world | 3850 | không | 1.00 | 1.00/0.64 | 0 | 0 | 8151.00 |
| HARD-PHI-NGOC-THIEN-TopCV.vn- | CV Hard (thực tế) | hard_real_world | 2681 | không | 0.88 | 0.94/0.68 | 0 | 0 | 9454.90 |

## 9. Bộ CV Hard (cấu trúc khó, dữ liệu thật từ TopCV.vn)

5 CV thật (export từ TopCV.vn), layout nhiều cột/icon. Parser có fallback `pdfplumber` (tách cột theo vị trí x) khi `pymupdf4llm`+OCR vẫn cho nội dung dưới ngưỡng `LOW_CONTENT_CHAR_THRESHOLD` (600 ký tự).

Parse yield trung bình bộ Hard ở lần chạy này: **2720.80 ký tự**, so với **4468.39 ký tự** ở bộ CV tổng hợp (36 CV còn lại).

| CV | Số ký tự parse | low_content | Faithfulness | Skill P/R | PII hits (regex/LLM-judge) |
|---|---|---|---|---|---|
| Le Van Sy | 2013 | không | 1.00 | 0.90/0.69 | 0/không |
| Nguyễn Tiến Khang Huy | 2281 | không | 1.00 | 0.67/0.50 | 0/không |
| Phí Ngọc Thiện | 2681 | không | 0.88 | 0.94/0.68 | 0/không |
| Dương Hồng Đức | 2779 | không | 1.00 | 1.00/0.77 | 0/không |
| Nguyễn Anh Tuấn | 3850 | không | 1.00 | 1.00/0.64 | 0/không |
