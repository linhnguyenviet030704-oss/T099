# Báo cáo đánh giá Ingest Agent

- Ngày chạy: 2026-08-24
- Mẫu: 77 CV (xem `evaluation/ingest_eval_v2/manifest.json`) — 36 CV tổng hợp tiếng Anh từ `data_find/generated_cv/` + 36 bản dịch tiếng Việt cặp với đúng 36 CV tiếng Anh ở trên (từ `data_find/generated_cv_vi/`, xem mục 10) + 5 CV thật cấu trúc khó từ `evaluation/cv_hard/` (tiếng Việt, TopCV.vn)
- Chat model: `gpt-4o-mini` (OpenAI) — LLM-judge cũng dùng model này
- Embedding model: `text-embedding-3-small` (OpenAI, dim=1536)
- Pipeline: chạy `build_ingest_graph()` thật (đã redesign) từ `backend/app/agents/ingest/graph.py`, thứ tự node hiện tại là `parse -> clean -> extract -> summarize -> embed` (extract chuyển lên trước summarize), qua `graph.astream(..., stream_mode="values")`, inject `complete`/`encode` bằng OpenAI (production dùng Qwen).

## 1. Tổng quan

| Metric | Giá trị |
|---|---|
| Tỷ lệ parse thành công | 77/77 |
| CV bị gắn cờ `low_content` (parse quá ít nội dung) | 0/77 |
| CV còn PII (regex) trong text lưu cuối cùng | 0/77 |
| CV bị lộ token tên ứng viên trong text cuối | 7/77 |
| CV bị LLM-judge gắn cờ còn PII | 1/77 |
| CV có `summary` rỗng | 0/77 |
| CV có embedding lỗi (sai dim / vector rỗng) | 0/77 |
| Faithfulness trung bình của `summarize` (kiểu RAGAS, tỷ lệ claim được support) | 0.99 |
| Precision trích skill trung bình (ước lượng bằng LLM-judge) | 0.91 |
| Recall trích skill trung bình (ước lượng bằng LLM-judge) | 0.61 |
| Recall skill trung bình so với text đầy đủ trước summarize (đo bằng code, không qua LLM) | 1.00 |
| Tổng số skill bị mất do summarization trong cả mẫu (đo bằng code — kỳ vọng ~0 sau khi đổi thứ tự node) | 0 |
| Latency trung bình toàn pipeline | 8486.64 ms |

## 2. Latency theo từng node (ms)

| Node | Trung bình | Trung vị | Max |
|---|---|---|---|
| parse | 731.05 | 715.30 | 3392.30 |
| clean | 1.75 | 0.50 | 98.60 |
| extract | 40.47 | 39.40 | 88.60 |
| summarize | 7093.36 | 6597.60 | 22122.60 |
| embed | 620.01 | 593.50 | 1105.50 |

## 3. Độ phủ taxonomy skill

`extract_skills()` hiện nhận diện **186 skill chuẩn hoá** trong `backend/app/services/matching/resources/skill_graph.json`, cộng thêm một lớp fuzzy-match (rapidfuzz, ngưỡng 88) cho lỗi chính tả/spacing nhẹ. Phủ thêm các domain trước đây bị bỏ sót: ML/AI, embedded/firmware, data infra, blockchain, robotics, networking, mobile, DevOps. Bảng mục 6 bên dưới cho recall/precision thực đo trên từng CV.

## 4. Thứ tự extract/summarize (bug đã sửa, đo lại ở đây)

Trước redesign, `extract_skills()` chạy trên `state["markdown"]` **sau khi** node `summarize` ghi đè key này bằng bản LLM viết lại, nên skill bị bản tóm tắt bỏ sót sẽ mất vĩnh viễn. Từ redesign này, graph chạy `extract` **trước** `summarize` (`backend/app/agents/ingest/graph.py`), nên `lost_to_summarization` ở mục 1 kỳ vọng gần 0 cho toàn bộ mẫu. Bảng dưới liệt kê case nào (nếu có) vẫn còn mất skill, để soi lại nếu số khác 0.

Không có CV nào trong mẫu bị mất skill do summarization — đúng như kỳ vọng sau khi đổi thứ tự node.

## 5. Faithfulness (summarize) — các case tệ nhất

Score = số claim được support / tổng số claim, LLM-judge chấm từng claim so với text gốc trước summarize, sau đó tổng hợp bằng code (không lấy điểm tự chấm của model). Prompt `summarize.txt` có chỉ dẫn chống bịa đặt (anti-hallucination).

| CV | Score | Claim không được support |
|---|---|---|
| G13-UI-01-VI | 0.71 | Đã dẫn dắt nhiều dự án thiết kế.; Cải tiến quy trình làm việc. |
| HARD-Mobile Developer Intern  | 0.80 | The individual refines personal skills throughout the internship. |
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
| G11-CSE-02 | 0.75 | 0.33 | gcp, azure | kubernetes, windows server, wsus, lambda, security hub, guardduty, config, cloudtrail, kms, inspector, waf, organizations |
| G3-NA-02-VI | 0.60 | 0.50 | lua, mongodb | cisco, windows_server, ubuntu |
| G10-TEL-05 | 0.80 | 0.31 | nodejs | Huawei U2000, Nokia NFM-T, OTDR, optical power meters, capacity planning, fibre network design, change management, field team coordination, mentoring |
| G12-SC-01 | 0.73 | 0.41 | oracle_database, can_bus, testng, junit | Foundry, Echidna, Slither, ERC-20, ERC-4626, ERC-4337, timelock, multisig, account abstraction, mempool, flash loan, reentrancy, gas semantics, deterministic deployment, signature schemes, royalty and marketplace-fee splitter |
| G2-SA-06 | 0.78 | 0.41 | testng, rust | VMware Certified Professional - Data Center Virtualization (VCP-DCV), Veeam Certified Engineer (VMCE), Microsoft Certified: Windows Server Hybrid Administrator Associate, FortiGate, iSCSI, NFS, Dell EMC, Synology storage, network segmentation, ISO 27001 controls |
| G4-PT-09 | 0.83 | 0.39 | testng | OSCP, Metasploit (basic), OWASP Top 10 (top 5 in practice), finding write-ups, CVSS basics, PoC documentation, Kali Linux (daily), basic Windows attack surface |
| G5-BI-02-VI | 0.67 | 0.57 | jquery, mongodb | DAX, T-SQL, SSRS |
| G4-PT-09-VI | 0.83 | 0.42 | testng | Metasploit, enum4linux, Netcat, Burp Suite Community, SQLMap, Gobuster, Kali Linux |
| G8-PDM-01 | 0.67 | 0.60 | ruby_on_rails, testng, junit | google_analytics, amplitude, firebase, sql |
| G6-NLP-02 | 0.82 | 0.50 | kubernetes, excel | beautifulsoup, requests, streamlit, docker (only know run container), Hekate AI, FPT.AI platform, underthesea, pyvi, spaCy (basic) |

## 7. Các case rò rỉ PII

`redact_pii()` có pattern domain/path tổng quát (bắt được mention kiểu `twitter.com/handle` không có scheme) và phát hiện tên bị "wrap" xuống dòng.

| CV | Số lần khớp regex | Token tên bị lộ | Ví dụ LLM-judge tìm được |
|---|---|---|---|
| G8-PDM-01 | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | Minh | — |
| G3-SA-05 | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | Hai | — |
| G9-CA-04-VI | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | Chi | — |
| G9-SWA-03-VI | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | Bao | — |
| G12-BC-03-VI | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | Nam | — |
| G12-SC-01-VI | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | Minh | — |
| G15-IOT-01-VI | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | Thi | — |
| G6-NLP-02 | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | — | BUI VAN THO; Ho Chi Minh City |

## 8. Chi tiết từng CV

| CV | Nhóm ngành | Chất lượng | Số ký tự parse | low_content | Faithfulness | Skill P/R | Skill mất | PII hits | Total ms |
|---|---|---|---|---|---|---|---|---|---|
| G1-DT-01 | Software Development | polished | 3545 | không | 1.00 | 1.00/0.46 | 0 | 0 | 8178.30 |
| G1-DT-01-VI | Software Development | polished | 3776 | không | 1.00 | 1.00/0.43 | 0 | 0 | 12695.10 |
| G1-GM-03 | Software Development | cross_domain | 3351 | không | 1.00 | 0.89/0.44 | 0 | 0 | 8593.10 |
| G1-GM-03-VI | Software Development | cross_domain | 3619 | không | 1.00 | 1.00/0.47 | 0 | 0 | 9032.50 |
| G10-TEL-05 | Networking | polished | 3562 | không | 1.00 | 0.80/0.31 | 0 | 0 | 12723.50 |
| G10-TEL-05-VI | Networking | polished | 3679 | không | 1.00 | 1.00/0.46 | 0 | 0 | 10612.00 |
| G10-VOI-03 | Networking | cross_domain | 5812 | không | 1.00 | 0.84/0.61 | 0 | 0 | 8151.00 |
| G10-VOI-03-VI | Networking | cross_domain | 6210 | không | 1.00 | 0.83/0.56 | 0 | 0 | 9979.80 |
| G11-CSA-03 | Cloud Computing | cross_domain | 6947 | không | 1.00 | 0.87/0.52 | 0 | 0 | 8119.60 |
| G11-CSA-03-VI | Cloud Computing | cross_domain | 7256 | không | 1.00 | 0.88/0.61 | 0 | 0 | 8768.00 |
| G11-CSE-01 | Cloud Computing | polished | 7040 | không | 1.00 | 1.00/0.71 | 0 | 0 | 8098.00 |
| G11-CSE-01-VI | Cloud Computing | polished | 7559 | không | 1.00 | 1.00/0.62 | 0 | 0 | 10000.40 |
| G11-CSE-02 | Cloud Computing | sparse | 2224 | không | 1.00 | 0.75/0.33 | 0 | 0 | 6669.00 |
| G11-CSE-02-VI | Cloud Computing | sparse | 2719 | không | 1.00 | 0.78/0.64 | 0 | 0 | 7948.90 |
| G12-BC-03 | Blockchain & Web3 | cross_domain | 6279 | không | 1.00 | 0.90/0.77 | 0 | 0 | 6980.20 |
| G12-BC-03-VI | Blockchain & Web3 | cross_domain | 6708 | không | 1.00 | 1.00/0.76 | 0 | 0 | 9586.20 |
| G12-SC-01 | Blockchain & Web3 | polished | 6912 | không | 1.00 | 0.73/0.41 | 0 | 0 | 7889.20 |
| G12-SC-01-VI | Blockchain & Web3 | polished | 7441 | không | 1.00 | 1.00/0.59 | 0 | 0 | 6871.00 |
| G13-UI-01 | UI/UX & Product Design | polished | 5745 | không | 1.00 | 0.80/0.57 | 0 | 0 | 9384.90 |
| G13-UI-01-VI | UI/UX & Product Design | polished | 6213 | không | 0.71 | 1.00/0.75 | 0 | 0 | 10216.20 |
| G13-UX-02 | UI/UX & Product Design | sparse | 1812 | không | 1.00 | 1.00/0.50 | 0 | 0 | 6172.00 |
| G13-UX-02-VI | UI/UX & Product Design | sparse | 2282 | không | 1.00 | 1.00/0.75 | 0 | 0 | 6305.00 |
| G13-UX-03 | UI/UX & Product Design | cross_domain | 5054 | không | 1.00 | 0.88/0.47 | 0 | 0 | 7576.10 |
| G13-UX-03-VI | UI/UX & Product Design | cross_domain | 5480 | không | 1.00 | 1.00/0.64 | 0 | 0 | 8725.50 |
| G14-ODO-01 | ERP/CRM & Enterprise Systems | polished | 6399 | không | 1.00 | 1.00/0.52 | 0 | 0 | 8002.10 |
| G14-ODO-01-VI | ERP/CRM & Enterprise Systems | polished | 6836 | không | 1.00 | 1.00/0.60 | 0 | 0 | 8610.00 |
| G14-SF-03 | ERP/CRM & Enterprise Systems | cross_domain | 5024 | không | 1.00 | 1.00/0.40 | 0 | 0 | 7702.60 |
| G14-SF-03-VI | ERP/CRM & Enterprise Systems | cross_domain | 5309 | không | 1.00 | 1.00/0.61 | 0 | 0 | 8671.50 |
| G15-IOT-01 | Embedded Systems/IoT | polished | 6897 | không | 1.00 | 0.81/0.59 | 0 | 0 | 7497.80 |
| G15-IOT-01-VI | Embedded Systems/IoT | polished | 7327 | không | 1.00 | 1.00/0.44 | 0 | 0 | 10409.10 |
| G15-ROB-03 | Embedded Systems/IoT | cross_domain | 6522 | không | 1.00 | 0.70/0.64 | 0 | 0 | 10878.70 |
| G15-ROB-03-VI | Embedded Systems/IoT | cross_domain | 6814 | không | 1.00 | 0.82/0.78 | 0 | 0 | 7762.00 |
| G2-SA-06 | DevOps/Infrastructure | polished | 4714 | không | 1.00 | 0.78/0.41 | 0 | 0 | 8735.80 |
| G2-SA-06-VI | DevOps/Infrastructure | polished | 5034 | không | 1.00 | 1.00/0.44 | 0 | 0 | 13858.40 |
| G2-SRE-03 | DevOps/Infrastructure | cross_domain | 4164 | không | 1.00 | 0.88/0.56 | 0 | 0 | 11427.10 |
| G2-SRE-03-VI | DevOps/Infrastructure | cross_domain | 4234 | không | 1.00 | 0.94/0.56 | 0 | 0 | 9432.50 |
| G3-NA-02 | System Administration | sparse | 1531 | không | 1.00 | 1.00/0.50 | 0 | 0 | 6336.30 |
| G3-NA-02-VI | System Administration | sparse | 1592 | không | 1.00 | 0.60/0.50 | 0 | 0 | 7198.70 |
| G3-SA-03 | System Administration | cross_domain | 4508 | không | 1.00 | 0.92/0.76 | 0 | 0 | 8884.00 |
| G3-SA-03-VI | System Administration | cross_domain | 4671 | không | 1.00 | 0.91/0.67 | 0 | 0 | 7159.30 |
| G3-SA-05 | System Administration | polished | 1831 | không | 1.00 | 1.00/0.67 | 0 | 0 | 4861.70 |
| G3-SA-05-VI | System Administration | polished | 2030 | không | 1.00 | 1.00/0.73 | 0 | 0 | 7022.50 |
| G4-MA-03 | Cybersecurity | cross_domain | 5201 | không | 1.00 | 0.94/0.68 | 0 | 0 | 9699.30 |
| G4-MA-03-VI | Cybersecurity | cross_domain | 5576 | không | 1.00 | 1.00/0.47 | 0 | 0 | 8384.70 |
| G4-PT-09 | Cybersecurity | polished | 3018 | không | 1.00 | 0.83/0.39 | 0 | 0 | 8832.30 |
| G4-PT-09-VI | Cybersecurity | polished | 2938 | không | 1.00 | 0.83/0.42 | 0 | 0 | 7066.90 |
| G5-BI-02 | Data | sparse | 1416 | không | 1.00 | 0.80/0.57 | 0 | 0 | 5873.80 |
| G5-BI-02-VI | Data | sparse | 1831 | không | 1.00 | 0.67/0.57 | 0 | 0 | 6146.90 |
| G5-BI-07 | Data | polished | 1721 | không | 1.00 | 0.88/0.78 | 0 | 0 | 5681.10 |
| G5-BI-07-VI | Data | polished | 2028 | không | 1.00 | 0.88/0.70 | 0 | 0 | 5676.70 |
| G5-DS-03 | Data | cross_domain | 4901 | không | 1.00 | 1.00/0.70 | 0 | 0 | 8487.70 |
| G5-DS-03-VI | Data | cross_domain | 5164 | không | 1.00 | 1.00/0.75 | 0 | 0 | 10876.10 |
| G6-CV-02 | AI/ML | sparse | 2196 | không | 1.00 | 0.94/0.81 | 0 | 0 | 11034.50 |
| G6-CV-02-VI | AI/ML | sparse | 2704 | không | 1.00 | 0.94/0.85 | 0 | 0 | 7694.70 |
| G6-CV-05 | AI/ML | polished | 3894 | không | 1.00 | 0.92/0.67 | 0 | 0 | 9880.40 |
| G6-CV-05-VI | AI/ML | polished | 4213 | không | 1.00 | 1.00/0.62 | 0 | 0 | 23484.20 |
| G6-NLP-02 | AI/ML | sparse | 2276 | không | 1.00 | 0.82/0.50 | 0 | 0 | 7754.30 |
| G6-NLP-02-VI | AI/ML | sparse | 2797 | không | 1.00 | 0.92/0.69 | 0 | 0 | 6839.30 |
| G6-NLP-03 | AI/ML | cross_domain | 6432 | không | 1.00 | 1.00/0.50 | 0 | 0 | 7909.00 |
| G6-NLP-03-VI | AI/ML | cross_domain | 6792 | không | 1.00 | 0.77/0.62 | 0 | 0 | 8770.40 |
| G7-AT-03 | QA/Testing | cross_domain | 4961 | không | 1.00 | 0.96/0.69 | 0 | 0 | 7714.90 |
| G7-AT-03-VI | QA/Testing | cross_domain | 5343 | không | 1.00 | 1.00/0.83 | 0 | 0 | 6276.90 |
| G7-AT-05 | QA/Testing | polished | 4560 | không | 1.00 | 0.94/0.77 | 0 | 0 | 9413.50 |
| G7-AT-05-VI | QA/Testing | polished | 5028 | không | 1.00 | 0.94/0.85 | 0 | 0 | 9671.00 |
| G8-PDM-01 | Project/Product Management | polished | 6184 | không | 1.00 | 0.67/0.60 | 0 | 0 | 7730.10 |
| G8-PDM-01-VI | Project/Product Management | polished | 6661 | không | 1.00 | 1.00/0.70 | 0 | 0 | 9432.90 |
| G8-PDM-03 | Project/Product Management | cross_domain | 5124 | không | 1.00 | 0.92/0.67 | 0 | 0 | 7713.10 |
| G8-PDM-03-VI | Project/Product Management | cross_domain | 5511 | không | 1.00 | 1.00/0.77 | 0 | 0 | 6874.20 |
| G9-CA-04 | Architecture | polished | 2728 | không | 1.00 | 1.00/0.88 | 0 | 0 | 7114.30 |
| G9-CA-04-VI | Architecture | polished | 2927 | không | 1.00 | 1.00/0.89 | 0 | 0 | 6756.70 |
| G9-SWA-03 | Architecture | cross_domain | 6377 | không | 1.00 | 1.00/0.52 | 0 | 0 | 8630.40 |
| G9-SWA-03-VI | Architecture | cross_domain | 6523 | không | 1.00 | 1.00/0.47 | 0 | 0 | 8941.20 |
| HARD-CV Dương Hồng Đức - CV1_ | CV Hard (thực tế) | hard_real_world | 2779 | không | 1.00 | 1.00/0.81 | 0 | 0 | 6994.10 |
| HARD-CV_LeVanSy_Backend_Inter | CV Hard (thực tế) | hard_real_world | 2039 | không | 1.00 | 0.90/0.75 | 0 | 0 | 7904.70 |
| HARD-Mobile Developer Intern  | CV Hard (thực tế) | hard_real_world | 2281 | không | 0.80 | 0.67/0.67 | 0 | 0 | 4502.40 |
| HARD-Nguyen-Anh-Tuan-TopCV.vn | CV Hard (thực tế) | hard_real_world | 3225 | không | 1.00 | 1.00/0.56 | 0 | 0 | 8195.50 |
| HARD-PHI-NGOC-THIEN-TopCV.vn- | CV Hard (thực tế) | hard_real_world | 2652 | không | 1.00 | 0.88/0.70 | 0 | 0 | 5787.40 |

## 9. Bộ CV Hard (cấu trúc khó, dữ liệu thật từ TopCV.vn)

5 CV thật (export từ TopCV.vn), layout nhiều cột/icon. Parser có fallback `pdfplumber` (tách cột theo vị trí x) khi `pymupdf4llm`+OCR vẫn cho nội dung dưới ngưỡng `LOW_CONTENT_CHAR_THRESHOLD` (600 ký tự).

Parse yield trung bình bộ Hard ở lần chạy này: **2595.20 ký tự**, so với **4634.54 ký tự** ở bộ CV tổng hợp (72 CV còn lại).

| CV | Số ký tự parse | low_content | Faithfulness | Skill P/R | PII hits (regex/LLM-judge) |
|---|---|---|---|---|---|
| Le Van Sy | 2039 | không | 1.00 | 0.90/0.75 | 0/không |
| Nguyễn Tiến Khang Huy | 2281 | không | 0.80 | 0.67/0.67 | 0/không |
| Phí Ngọc Thiện | 2652 | không | 1.00 | 0.88/0.70 | 0/không |
| Dương Hồng Đức | 2779 | không | 1.00 | 1.00/0.81 | 0/không |
| Nguyễn Anh Tuấn | 3225 | không | 1.00 | 1.00/0.56 | 0/không |

## 10. So sánh CV tiếng Việt (dịch) vs CV tiếng Anh gốc (cặp cùng nội dung)

36 cặp CV: mỗi cặp là cùng một ứng viên/kỹ năng, chỉ khác ngôn ngữ viết (bản dịch tiếng Việt tạo bởi `evaluation/ingest_eval_v2/translate_cvs_vi.py` từ đúng 36 CV tiếng Anh tổng hợp đang dùng ở các mục trên). Vì nội dung/kỹ năng giống hệt nhau, chênh lệch số liệu ở đây phản ánh ảnh hưởng của **ngôn ngữ CV**, không phải khác biệt về nội dung.

| Metric | CV tiếng Anh (gốc) | CV tiếng Việt (dịch) |
|---|---|---|
| Faithfulness trung bình | 1.00 | 0.99 |
| Skill precision trung bình (LLM-judge) | 0.89 | 0.94 |
| Skill recall trung bình (LLM-judge) | 0.58 | 0.63 |
| Số ký tự parse trung bình | 4468.39 | 4800.69 |
| CV bị gắn cờ `low_content` | 0/36 | 0/36 |
| CV còn PII (regex) trong text cuối | 0/36 | 0/36 |
| Latency trung bình toàn pipeline | 8231.38 ms | 8993.26 ms |

### 10.1 Chi tiết từng cặp

| Cặp | Faithfulness EN/VI | Skill P/R EN | Skill P/R VI | low_content VI | Ký tự parse EN/VI |
|---|---|---|---|---|---|
| G1-DT-01 | 1.00/1.00 | 1.00/0.46 | 1.00/0.43 | không | 3545/3776 |
| G1-GM-03 | 1.00/1.00 | 0.89/0.44 | 1.00/0.47 | không | 3351/3619 |
| G10-TEL-05 | 1.00/1.00 | 0.80/0.31 | 1.00/0.46 | không | 3562/3679 |
| G10-VOI-03 | 1.00/1.00 | 0.84/0.61 | 0.83/0.56 | không | 5812/6210 |
| G11-CSA-03 | 1.00/1.00 | 0.87/0.52 | 0.88/0.61 | không | 6947/7256 |
| G11-CSE-01 | 1.00/1.00 | 1.00/0.71 | 1.00/0.62 | không | 7040/7559 |
| G11-CSE-02 | 1.00/1.00 | 0.75/0.33 | 0.78/0.64 | không | 2224/2719 |
| G12-BC-03 | 1.00/1.00 | 0.90/0.77 | 1.00/0.76 | không | 6279/6708 |
| G12-SC-01 | 1.00/1.00 | 0.73/0.41 | 1.00/0.59 | không | 6912/7441 |
| G13-UI-01 | 1.00/0.71 | 0.80/0.57 | 1.00/0.75 | không | 5745/6213 |
| G13-UX-02 | 1.00/1.00 | 1.00/0.50 | 1.00/0.75 | không | 1812/2282 |
| G13-UX-03 | 1.00/1.00 | 0.88/0.47 | 1.00/0.64 | không | 5054/5480 |
| G14-ODO-01 | 1.00/1.00 | 1.00/0.52 | 1.00/0.60 | không | 6399/6836 |
| G14-SF-03 | 1.00/1.00 | 1.00/0.40 | 1.00/0.61 | không | 5024/5309 |
| G15-IOT-01 | 1.00/1.00 | 0.81/0.59 | 1.00/0.44 | không | 6897/7327 |
| G15-ROB-03 | 1.00/1.00 | 0.70/0.64 | 0.82/0.78 | không | 6522/6814 |
| G2-SA-06 | 1.00/1.00 | 0.78/0.41 | 1.00/0.44 | không | 4714/5034 |
| G2-SRE-03 | 1.00/1.00 | 0.88/0.56 | 0.94/0.56 | không | 4164/4234 |
| G3-NA-02 | 1.00/1.00 | 1.00/0.50 | 0.60/0.50 | không | 1531/1592 |
| G3-SA-03 | 1.00/1.00 | 0.92/0.76 | 0.91/0.67 | không | 4508/4671 |
| G3-SA-05 | 1.00/1.00 | 1.00/0.67 | 1.00/0.73 | không | 1831/2030 |
| G4-MA-03 | 1.00/1.00 | 0.94/0.68 | 1.00/0.47 | không | 5201/5576 |
| G4-PT-09 | 1.00/1.00 | 0.83/0.39 | 0.83/0.42 | không | 3018/2938 |
| G5-BI-02 | 1.00/1.00 | 0.80/0.57 | 0.67/0.57 | không | 1416/1831 |
| G5-BI-07 | 1.00/1.00 | 0.88/0.78 | 0.88/0.70 | không | 1721/2028 |
| G5-DS-03 | 1.00/1.00 | 1.00/0.70 | 1.00/0.75 | không | 4901/5164 |
| G6-CV-02 | 1.00/1.00 | 0.94/0.81 | 0.94/0.85 | không | 2196/2704 |
| G6-CV-05 | 1.00/1.00 | 0.92/0.67 | 1.00/0.62 | không | 3894/4213 |
| G6-NLP-02 | 1.00/1.00 | 0.82/0.50 | 0.92/0.69 | không | 2276/2797 |
| G6-NLP-03 | 1.00/1.00 | 1.00/0.50 | 0.77/0.62 | không | 6432/6792 |
| G7-AT-03 | 1.00/1.00 | 0.96/0.69 | 1.00/0.83 | không | 4961/5343 |
| G7-AT-05 | 1.00/1.00 | 0.94/0.77 | 0.94/0.85 | không | 4560/5028 |
| G8-PDM-01 | 1.00/1.00 | 0.67/0.60 | 1.00/0.70 | không | 6184/6661 |
| G8-PDM-03 | 1.00/1.00 | 0.92/0.67 | 1.00/0.77 | không | 5124/5511 |
| G9-CA-04 | 1.00/1.00 | 1.00/0.88 | 1.00/0.89 | không | 2728/2927 |
| G9-SWA-03 | 1.00/1.00 | 1.00/0.52 | 1.00/0.47 | không | 6377/6523 |
