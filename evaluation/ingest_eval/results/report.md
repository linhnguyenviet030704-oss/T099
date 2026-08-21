# Báo cáo đánh giá Ingest Agent

- Ngày chạy: 2026-08-21
- Mẫu: 36 CV lấy từ `data_find/generated_cv/` (xem `manifest.json`)
- Chat model: `gpt-4o-mini` (OpenAI) — LLM-judge cũng dùng model này
- Embedding model: `text-embedding-3-small` (OpenAI, dim=1536)
- Pipeline: chạy `build_ingest_graph()` thật từ `backend/app/agents/ingest/graph.py`, qua `graph.astream(..., stream_mode="values")`, inject `complete`/`encode` bằng OpenAI (production dùng Qwen; cùng điểm inject mà `tests/unit/test_matching_ingest.py` đang dùng, không sửa code backend).

## 1. Tổng quan

| Metric | Giá trị |
|---|---|
| Tỷ lệ parse thành công | 36/36 |
| CV còn PII (regex) trong text lưu cuối cùng | 0/36 |
| CV bị lộ token tên ứng viên trong text cuối | 2/36 |
| CV bị LLM-judge gắn cờ còn PII | 2/36 |
| CV có `summary` rỗng | 0/36 |
| CV có embedding lỗi (sai dim / vector rỗng) | 0/36 |
| Faithfulness trung bình của `summarize` (kiểu RAGAS, tỷ lệ claim được support) | 1.00 |
| Precision trích skill trung bình (ước lượng bằng LLM-judge) | 1.00 |
| Recall trích skill trung bình (ước lượng bằng LLM-judge) | 0.11 |
| Recall skill trung bình so với text đầy đủ trước summarize (đo bằng code, không qua LLM) | 0.78 |
| Tổng số skill bị mất do summarization trong cả mẫu (đo bằng code) | 18 |
| Latency trung bình toàn pipeline | 11395.59 ms |

## 2. Latency theo từng node (ms)

| Node | Trung bình | Trung vị | Max |
|---|---|---|---|
| parse | 1847.17 | 1974.20 | 3355.60 |
| clean | 8.28 | 7.90 | 21.40 |
| summarize | 8524.47 | 8043.10 | 16191.70 |
| extract | 1.39 | 1.20 | 4.30 |
| embed | 1014.28 | 915.60 | 3070.50 |

## 3. Nguyên nhân gốc của recall trích skill thấp: taxonomy chỉ có 10 skill

`extract_skills()` chỉ có thể trả về các từ khoá có trong `backend/app/services/matching/resources/skill_graph.json`, hiện file này định nghĩa **10 skill chuẩn hoá**: Docker, FastAPI, Git, JavaScript, Linux, PostgreSQL, Python, React, SQL, TypeScript (kèm alias cho mỗi skill). Nó không thể nhận diện bất kỳ skill nào ngoài danh sách này — không phải lỗi logic matching/normalize, mà là taxonomy tĩnh quá hẹp. Đây là lý do recall của LLM-judge gần như bằng 0 với mọi CV ngoài stack web ở mục 6 bên dưới: judge so sánh với những gì con người gọi là "skill có trong CV" (TensorFlow, Docker, Kotlin, ONNX, ...), trong khi `extract_skills()` chỉ có thể khớp 10 từ khoá trên. Bất kỳ CV nào có stack không phải Python/FastAPI/PostgreSQL/Docker/JS/TS/React/SQL/Git/Linux đều sẽ cho recall thấp một cách giả tạo ở đây, bất kể `summarize` hay `extract_skills()` tự thân hoạt động tốt đến đâu.

## 4. Mất skill do summarization (khác với vấn đề taxonomy hẹp)

`extract_skills()` (rule-based, deterministic) chạy trên `state["markdown"]` **sau khi** node `summarize` đã ghi đè key này bằng `body` do LLM viết lại (`backend/app/agents/ingest/nodes/summarize.py:19-20`), không chạy trên toàn bộ text CV đã parse. Nếu bản `body` LLM viết lại bỏ sót một skill có trong CV gốc, `extract_skills()` sẽ không bao giờ thấy skill đó. Bảng dưới so sánh skill trích được từ `body` thực tế trong production với cùng hàm `extract_skills()` thật chạy trực tiếp trên markdown đầy đủ trước summarize, cho các trường hợp mất nhiều nhất trong mẫu.

| CV | Skill trong production | Mất do summarization | Skill từ text đầy đủ |
|---|---|---|---|
| G14-ODO-01 | 3 | Docker, PostgreSQL, SQL | 5 |
| G12-SC-01 | 0 | Python, TypeScript | 2 |
| G4-MA-03 | 2 | PostgreSQL, SQL | 4 |
| G10-VOI-03 | 1 | PostgreSQL, Python | 3 |
| G3-SA-03 | 4 | Docker, Python | 6 |
| G9-SWA-03 | 0 | Python | 1 |
| G11-CSA-03 | 1 | SQL | 2 |
| G11-CSE-01 | 1 | Python | 2 |
| G14-SF-03 | 1 | SQL | 2 |
| G15-ROB-03 | 0 | Python | 1 |

## 5. Faithfulness (summarize) — các case tệ nhất

Score = số claim được support / tổng số claim, LLM-judge chấm từng claim so với text gốc trước summarize, sau đó tổng hợp bằng code (không lấy điểm tự chấm của model).

| CV | Score | Claim không được support |
|---|---|---|
| G10-VOI-03 | 0.91 | Specializing in backend development |
| G6-CV-02 | 1.00 | — |
| G6-CV-05 | 1.00 | — |
| G6-NLP-02 | 1.00 | — |
| G6-NLP-03 | 1.00 | — |
| G9-CA-04 | 1.00 | — |
| G9-SWA-03 | 1.00 | — |
| G12-BC-03 | 1.00 | — |
| G12-SC-01 | 1.00 | — |
| G11-CSA-03 | 1.00 | — |

## 6. Độ chính xác trích skill — các case tệ nhất

| CV | Precision | Recall | False positive | False negative |
|---|---|---|---|---|
| G6-CV-05 | — | 0.00 | — | Kotlin, TensorRT, ONNX, TFLite, drift monitoring |
| G9-SWA-03 | — | 0.00 | — | MISRA C:2012 compliance, static analysis with Polyspace, hardware-in-the-loop regression on a dSPACE bench, FreeRTOS, OSEK, LIN, Automotive Ethernet, UDS diagnostics (ISO 14229), bootloaders and flash drivers, linker scripts and memory maps, board bring-up, oscilloscope and logic analyser as debugging tools, Golang, Python for backend services, Prometheus, Grafana, CI/CD pipelines for both firmware and services |
| G12-BC-03 | — | 0.00 | — | Terraform-managed storage, snapshot pipeline, Kafka, Debezium, change-data-capture, Flink jobs, incident response, GitHub Actions, Loki, incident response and on-call practice, Hyperledger Fabric chaincode and channel operations, HSM, KMS, MPC signer, Hardhat, Foundry, exactly-once semantics, cut-off times, regulatory reporting |
| G12-SC-01 | — | 0.00 | — | Yul, inline assembly, gas semantics, storage layout and packing, proxy patterns (UUPS, transparent, diamond), CREATE2, deterministic deployment, signature schemes including EIP-712 and EIP-2612 permits, account abstraction (ERC-4337), Echidna, Slither, mutation testing, differential testing against a reference implementation in Python, TypeScript and viem/ethers, subgraph authoring, Tenderly and Foundry traces for debugging, Move and Solana/Anchor |
| G15-ROB-03 | — | 0.00 | — | ROS 1, TensorRT, INT8 quantisation, experiment tracking with MLflow, Jetson Orin NX, C++17, real-time considerations at the level of a perception node rather than a control loop, occupancy and costmap layers, extrinsic and intrinsic calibration, pruning |
| G8-PDM-01 | — | 0.00 | — | Google Analytics Individual Qualification, Scrum Alliance, Firebase, Excel, Sheets |
| G3-NA-02 | — | 0.00 | — | CCNA, IC3 Digital Literacy, Packet Tracer |
| G13-UX-02 | — | 0.00 | — | HTML, CSS |
| G14-SF-03 | 1.00 | 0.04 | — | LWC, Marketing Cloud Connect, Apex, SOQL, Flows, Experience Cloud APIs, AMPscript, SQL query activities in Marketing Cloud, Campaign Influence configuration, REST API integration in both directions, Platform Events, Kafka, BigQuery modelling and scheduled queries, dbt, identity resolution, subscriber key design, GA4 event schemas, server-side tagging, lead scoring design, email deliverability basics, PHP, Laravel, Vue.js |
| G2-SA-06 | 1.00 | 0.04 | — | Veeam, VMware vSphere, Hyper-V, Microsoft 365, Ansible, Zabbix, PRTG, FortiGate, Bash, PowerShell, RHEL, CentOS, Ubuntu Server, Active Directory, Group Policy, DNS, DHCP, Failover Clustering, iSCSI, NFS, Dell EMC, Synology storage |

## 7. Các case rò rỉ PII

`URL_RE` trong `redact_pii()` (`backend/app/services/matching/parse.py:85-88`) chỉ khớp `github.com`, `linkedin.com`, `facebook.com` và link `http(s)://`/`www.` trần — một mention dạng `twitter.com/...` (không có scheme, không có `www.`) không được bắt và sống sót qua redact 2 lần (một lần trong `parse_resume_bytes`, một lần nữa sau `summarize`). Case G12-SC-01 bên dưới đúng vào trường hợp này.

| CV | Số lần khớp regex | Token tên bị lộ | Ví dụ LLM-judge tìm được |
|---|---|---|---|
| G8-PDM-01 | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | Minh | — |
| G3-SA-05 | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | Hai | — |
| G6-NLP-02 | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | — | BUI VAN THO; Thu Duc, Ho Chi Minh City |
| G12-SC-01 | 0 ({'email': 0, 'phone': 0, 'url': 0, 'dob': 0, 'labeled_line': 0}) | — | VU MINH KHOI; District 7, Ho Chi Minh City; twitter.com/khoi_sol |

## 8. Chi tiết từng CV

| CV | Nhóm ngành | Chất lượng | Số ký tự parse | Faithfulness | Skill P/R | Skill mất | PII hits | Total ms |
|---|---|---|---|---|---|---|---|---|
| G1-DT-01 | Software Development | polished | 3545 | 1.00 | 1.00/0.10 | 0 | 0 | 9835.00 |
| G1-GM-03 | Software Development | cross_domain | 3377 | 1.00 | 1.00/0.05 | 0 | 0 | 11889.00 |
| G10-TEL-05 | Networking | polished | 3562 | 1.00 | 1.00/0.05 | 0 | 0 | 11212.30 |
| G10-VOI-03 | Networking | cross_domain | 5812 | 0.91 | 1.00/0.05 | 2 | 0 | 11538.90 |
| G11-CSA-03 | Cloud Computing | cross_domain | 6947 | 1.00 | 1.00/0.09 | 1 | 0 | 10712.50 |
| G11-CSE-01 | Cloud Computing | polished | 7040 | 1.00 | 1.00/0.11 | 1 | 0 | 11996.80 |
| G11-CSE-02 | Cloud Computing | sparse | 2224 | 1.00 | 1.00/0.17 | 0 | 0 | 10228.30 |
| G12-BC-03 | Blockchain & Web3 | cross_domain | 6279 | 1.00 | —/0.00 | 0 | 0 | 13487.30 |
| G12-SC-01 | Blockchain & Web3 | polished | 6933 | 1.00 | —/0.00 | 2 | 0 | 10873.40 |
| G13-UI-01 | UI/UX & Product Design | polished | 5745 | 1.00 | 1.00/0.17 | 0 | 0 | 12285.60 |
| G13-UX-02 | UI/UX & Product Design | sparse | 1812 | 1.00 | —/0.00 | 0 | 0 | 7934.60 |
| G13-UX-03 | UI/UX & Product Design | cross_domain | 5054 | 1.00 | 1.00/0.08 | 1 | 0 | 10721.40 |
| G14-ODO-01 | ERP/CRM & Enterprise Systems | polished | 6399 | 1.00 | 1.00/0.14 | 3 | 0 | 10969.90 |
| G14-SF-03 | ERP/CRM & Enterprise Systems | cross_domain | 5024 | 1.00 | 1.00/0.04 | 1 | 0 | 11097.30 |
| G15-IOT-01 | Embedded Systems/IoT | polished | 6897 | 1.00 | 1.00/0.10 | 0 | 0 | 18703.10 |
| G15-ROB-03 | Embedded Systems/IoT | cross_domain | 6522 | 1.00 | —/0.00 | 1 | 0 | 12257.90 |
| G2-SA-06 | DevOps/Infrastructure | polished | 4716 | 1.00 | 1.00/0.04 | 0 | 0 | 13040.20 |
| G2-SRE-03 | DevOps/Infrastructure | cross_domain | 4164 | 1.00 | 1.00/0.09 | 0 | 0 | 13769.00 |
| G3-NA-02 | System Administration | sparse | 1531 | 1.00 | —/0.00 | 0 | 0 | 6928.50 |
| G3-SA-03 | System Administration | cross_domain | 4528 | 1.00 | 1.00/0.36 | 2 | 0 | 10598.30 |
| G3-SA-05 | System Administration | polished | 1831 | 1.00 | 1.00/0.43 | 0 | 0 | 8416.30 |
| G4-MA-03 | Cybersecurity | cross_domain | 5201 | 1.00 | 1.00/0.08 | 2 | 0 | 13823.70 |
| G4-PT-09 | Cybersecurity | polished | 3018 | 1.00 | 1.00/0.12 | 0 | 0 | 8310.60 |
| G5-BI-02 | Data | sparse | 1416 | 1.00 | 1.00/0.20 | 0 | 0 | 6706.60 |
| G5-BI-07 | Data | polished | 1721 | 1.00 | 1.00/0.15 | 0 | 0 | 7106.50 |
| G5-DS-03 | Data | cross_domain | 4901 | 1.00 | 1.00/0.11 | 0 | 0 | 14039.00 |
| G6-CV-02 | AI/ML | sparse | 2196 | 1.00 | 1.00/0.05 | 0 | 0 | 8311.60 |
| G6-CV-05 | AI/ML | polished | 3896 | 1.00 | —/0.00 | 0 | 0 | 12568.10 |
| G6-NLP-02 | AI/ML | sparse | 2276 | 1.00 | 1.00/0.15 | 0 | 0 | 9320.50 |
| G6-NLP-03 | AI/ML | cross_domain | 6432 | 1.00 | 1.00/0.17 | 0 | 0 | 15875.40 |
| G7-AT-03 | QA/Testing | cross_domain | 4981 | 1.00 | 1.00/0.14 | 0 | 0 | 15171.20 |
| G7-AT-05 | QA/Testing | polished | 4560 | 1.00 | 1.00/0.27 | 0 | 0 | 19044.00 |
| G8-PDM-01 | Project/Product Management | polished | 6184 | 1.00 | —/0.00 | 1 | 0 | 9855.50 |
| G8-PDM-03 | Project/Product Management | cross_domain | 5124 | 1.00 | 1.00/0.14 | 0 | 0 | 11035.80 |
| G9-CA-04 | Architecture | polished | 2728 | 1.00 | 1.00/0.20 | 0 | 0 | 9790.10 |
| G9-SWA-03 | Architecture | cross_domain | 6377 | 1.00 | —/0.00 | 1 | 0 | 10787.10 |
