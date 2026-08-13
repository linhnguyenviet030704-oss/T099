# AI Agent Matching System — Technical Specification & Implementation Plan

## 1. Mục tiêu

Xây dựng hệ thống AI Agent Matching theo kiến trúc:

```text
Frontend
   │
   ├── Supabase Data API / Auth / Realtime
   │
   └── Backend API
          │
          └── Matching Agent
                 ├── Lexical Retrieval
                 ├── Semantic Retrieval
                 ├── Skill Graph Retrieval
                 ├── RRF Fusion
                 ├── Hard Filtering
                 ├── Deterministic Scoring
                 └── LLM Explanation
```

Hệ thống cần đáp ứng các mục tiêu:

- Frontend đọc/ghi dữ liệu nghiệp vụ trực tiếp qua Supabase.
- Backend chịu trách nhiệm matching, orchestration và scoring.
- Supabase là nguồn dữ liệu chính.
- `pgvector` dùng cho semantic retrieval.
- PostgreSQL Full Text Search dùng cho lexical retrieval.
- Skill graph được lưu trên PostgreSQL.
- Matching score phải deterministic, có thể audit.
- LLM chỉ dùng cho extraction/enrichment và explanation, không trực tiếp quyết định final score.
- Hỗ trợ xử lý bất đồng bộ cho ingestion và matching jobs.
- Có thể scale sang Elasticsearch hoặc Neo4j sau nếu PostgreSQL trở thành bottleneck.

---

# 2. Phạm vi MVP

## 2.1 Có trong MVP

- Supabase Auth.
- Candidate profile.
- Candidate preferences.
- Job data.
- Candidate skills.
- Job skills.
- Skill taxonomy.
- Skill relation graph.
- Embedding candidate/job.
- Postgres Full Text Search.
- pgvector HNSW search.
- Hybrid retrieval.
- RRF fusion.
- Hard constraints.
- Weighted deterministic scoring.
- Match explanation bằng LLM.
- Match history.
- Match evidence.
- Async processing.
- Realtime trạng thái match run.
- Logging, metrics và audit trail.

## 2.2 Chưa cần trong MVP

- Elasticsearch.
- Neo4j.
- Multi-agent framework phức tạp.
- LangChain/LangGraph nếu chưa có nhu cầu orchestration phức tạp.
- Auto-learning weight trực tiếp từ production.
- Reinforcement Learning.
- Agent tự sinh SQL.
- LLM quyết định final matching score.

---

# 3. Nguyên tắc thiết kế

## 3.1 Deterministic first

Matching engine phải cho cùng input → cùng output nếu:

- dữ liệu không thay đổi;
- scoring config không thay đổi;
- model embedding không thay đổi.

LLM không được phép thay đổi score sau khi ranking hoàn tất.

## 3.2 Agent là orchestrator

Agent backend chịu trách nhiệm gọi đúng tool theo flow.

```text
Agent
  │
  ├── Load profile
  ├── Build query
  ├── Retrieve candidates/jobs
  ├── Fuse results
  ├── Apply filters
  ├── Score
  ├── Rank
  └── Explain
```

Không thiết kế kiểu:

```text
Candidate + Job
      ↓
     LLM
      ↓
"82% match"
```

## 3.3 Evidence-based matching

Mỗi kết quả match phải lưu được:

- score tổng;
- score từng factor;
- matched skills;
- related skills;
- semantic similarity;
- các constraint đã pass/fail;
- version scoring config;
- version embedding model;
- retrieval ranks.

---

# 4. Kiến trúc hệ thống

```text
┌───────────────────────────────────────────────┐
│                   Frontend                    │
│              Next.js / React                  │
└───────────────┬───────────────────┬───────────┘
                │                   │
                │                   │
        Supabase Client        Backend Client
                │                   │
                ▼                   ▼
┌──────────────────────┐   ┌────────────────────────┐
│      Supabase        │   │      Backend API       │
│                      │   │      FastAPI           │
│ - Auth               │   │                        │
│ - Postgres           │◄──┤ - Auth validation      │
│ - pgvector           │   │ - Matching Agent       │
│ - FTS                │   │ - Matching Engine      │
│ - Realtime           │   │ - LLM Gateway          │
│ - Queues             │   │ - Workers              │
└──────────────────────┘   └──────────┬─────────────┘
                                      │
                                      ▼
                             External LLM / Embed API
```

---

# 5. Trách nhiệm từng layer

## 5.1 Frontend

Frontend chịu trách nhiệm:

- login/logout;
- CRUD candidate profile;
- CRUD candidate preferences;
- xem jobs;
- trigger matching;
- xem trạng thái matching;
- hiển thị ranked matches;
- hiển thị explanation;
- cập nhật feedback.

Frontend không được:

- sử dụng service role key;
- truy cập internal agent schema;
- tự tính matching score;
- gọi trực tiếp embedding model;
- tự chạy graph traversal phức tạp.

---

## 5.2 Backend

Backend chịu trách nhiệm:

- xác thực Supabase JWT;
- load dữ liệu cần thiết;
- orchestration matching;
- lexical retrieval;
- semantic retrieval;
- skill graph retrieval;
- RRF fusion;
- hard filtering;
- deterministic scoring;
- ranking;
- explanation generation;
- ingestion pipeline;
- embedding generation;
- caching;
- logging;
- metrics;
- retry;
- async workers.

Khuyến nghị:

```text
Python 3.12+
FastAPI
Pydantic
SQLAlchemy hoặc psycopg
Redis optional
Celery / Dramatiq / Arq optional
```

Nếu dùng Supabase Queue trực tiếp thì backend worker có thể consume queue mà không cần Celery.

---

## 5.3 Supabase

Supabase chịu trách nhiệm:

- PostgreSQL;
- authentication;
- RLS;
- pgvector;
- Full Text Search;
- Realtime;
- Queue;
- persistence;
- match history;
- audit data.

---

# 6. Database design

Khuyến nghị tách schema public API và internal.

```text
api
agent
```

## 6.1 Schema `api`

Các bảng frontend có thể được expose có kiểm soát:

```text
api.profiles
api.candidate_preferences
api.candidate_skills
api.jobs
api.match_runs
api.match_results
api.match_feedback
```

## 6.2 Schema `agent`

Không expose trực tiếp cho frontend:

```text
agent.skills
agent.skill_relations
agent.job_skills
agent.job_embeddings
agent.candidate_embeddings
agent.match_evidence
agent.scoring_configs
agent.agent_runs
agent.embedding_jobs
agent.ingestion_runs
```

---

# 7. Data model

## 7.1 profiles

```sql
create table api.profiles (
    id uuid primary key,
    user_id uuid not null unique,
    headline text,
    summary text,
    years_experience numeric,
    seniority_level text,
    city text,
    country text,
    remote_preference text,
    expected_salary_min numeric,
    expected_salary_max numeric,
    currency text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
```

---

## 7.2 candidate_preferences

```sql
create table api.candidate_preferences (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references api.profiles(id),
    preferred_titles text[],
    preferred_industries text[],
    preferred_company_sizes text[],
    preferred_locations text[],
    remote_only boolean default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
```

---

## 7.3 skills

```sql
create table agent.skills (
    id uuid primary key default gen_random_uuid(),
    canonical_name text not null unique,
    aliases text[],
    category text,
    embedding vector,
    created_at timestamptz default now()
);
```

---

## 7.4 candidate_skills

```sql
create table api.candidate_skills (
    profile_id uuid references api.profiles(id),
    skill_id uuid,
    proficiency numeric,
    years_experience numeric,
    source text,
    primary key (profile_id, skill_id)
);
```

---

## 7.5 skill_relations

```sql
create table agent.skill_relations (
    skill_id uuid not null,
    related_skill_id uuid not null,
    relation_type text not null,
    weight numeric not null default 1.0,
    source text,
    primary key (skill_id, related_skill_id, relation_type)
);
```

Ví dụ relation type:

```text
similar_to
parent_of
child_of
commonly_used_with
replacement_for
```

---

## 7.6 jobs

```sql
create table api.jobs (
    id uuid primary key default gen_random_uuid(),
    external_id text,
    title text not null,
    company_name text,
    description text not null,
    requirements text,
    city text,
    country text,
    remote_type text,
    salary_min numeric,
    salary_max numeric,
    currency text,
    seniority_level text,
    years_experience_min numeric,
    industry text,
    company_size text,

    search_vector tsvector,

    status text default 'active',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
```

GIN index:

```sql
create index jobs_search_idx
on api.jobs
using gin(search_vector);
```

---

## 7.7 job_embeddings

```sql
create table agent.job_embeddings (
    job_id uuid primary key references api.jobs(id),
    embedding vector(1536),
    embedding_model text not null,
    embedding_version text,
    updated_at timestamptz default now()
);
```

HNSW index:

```sql
create index job_embedding_hnsw_idx
on agent.job_embeddings
using hnsw (embedding vector_cosine_ops);
```

Dimension phải điều chỉnh theo embedding model thực tế.

---

## 7.8 job_skills

```sql
create table agent.job_skills (
    job_id uuid references api.jobs(id),
    skill_id uuid references agent.skills(id),
    importance numeric default 1.0,
    required boolean default false,
    source text,
    primary key (job_id, skill_id)
);
```

---

# 8. Match run model

## 8.1 match_runs

```sql
create table api.match_runs (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references api.profiles(id),

    status text not null default 'queued',

    scoring_config_version text,
    embedding_model text,

    started_at timestamptz,
    completed_at timestamptz,

    error_code text,
    error_message text,

    created_at timestamptz default now()
);
```

Status:

```text
queued
processing
completed
failed
cancelled
```

---

## 8.2 match_results

```sql
create table api.match_results (
    id uuid primary key default gen_random_uuid(),

    match_run_id uuid not null references api.match_runs(id),
    job_id uuid not null references api.jobs(id),

    rank integer not null,

    score numeric not null,

    skill_score numeric,
    experience_score numeric,
    location_score numeric,
    salary_score numeric,
    semantic_score numeric,
    company_score numeric,

    explanation text,

    created_at timestamptz default now(),

    unique(match_run_id, job_id)
);
```

---

## 8.3 match_evidence

```sql
create table agent.match_evidence (
    match_result_id uuid primary key references api.match_results(id),

    lexical_rank integer,
    semantic_rank integer,
    graph_rank integer,

    lexical_score numeric,
    semantic_similarity numeric,
    graph_score numeric,
    rrf_score numeric,

    matched_skill_ids uuid[],
    related_skill_ids uuid[],

    passed_constraints jsonb,
    failed_constraints jsonb,

    raw_factors jsonb,

    created_at timestamptz default now()
);
```

---

# 9. Matching pipeline

Online matching flow:

```text
POST /v1/matches
        │
        ▼
Authenticate
        │
        ▼
Load candidate profile
        │
        ▼
Build normalized matching query
        │
        ├─────────────────────┐
        │                     │
        ▼                     ▼
Lexical search          Semantic search
        │                     │
        └─────────┬───────────┘
                  │
                  ▼
            Skill graph search
                  │
                  ▼
              RRF fusion
                  │
                  ▼
          Hard constraints
                  │
                  ▼
       Deterministic scoring
                  │
                  ▼
              Ranking
                  │
                  ▼
       Explanation generation
                  │
                  ▼
          Persist results
```

---

# 10. Matching Agent tools

Agent không truy cập DB tùy ý.

Nó chỉ được dùng các function/tool đã định nghĩa.

```python
load_candidate_profile(profile_id)

load_candidate_preferences(profile_id)

extract_profile_features(profile)

build_matching_query(profile, preferences)

search_lexical(query, filters, limit)

search_semantic(embedding, filters, limit)

search_skill_graph(skill_ids, depth, limit)

fuse_rrf(result_sets, weights)

apply_hard_constraints(candidate, jobs)

calculate_match_factors(candidate, jobs, config)

rank_jobs(results)

save_match_results(match_run_id, results)

generate_match_explanation(match_result, evidence)
```

---

# 11. Retrieval strategy

Mỗi matching request chạy 3 retrieval path.

## 11.1 Lexical retrieval

Input:

```text
candidate headline
candidate summary
skills
preferred titles
industries
```

PostgreSQL FTS query:

```sql
select
    id,
    ts_rank_cd(search_vector, query) as score
from api.jobs,
     websearch_to_tsquery('english', :query) query
where search_vector @@ query
order by score desc
limit :limit;
```

MVP:

```text
limit = 150
```

Phải đưa limit vào config.

---

## 11.2 Semantic retrieval

Candidate profile được chuyển thành canonical document:

```text
Target roles:
Backend Engineer, AI Engineer

Skills:
Python, FastAPI, PostgreSQL, Docker, AWS

Experience:
5 years backend engineering

Preferences:
Remote, SaaS, AI products
```

Generate embedding rồi query pgvector.

Pseudo SQL:

```sql
select
    job_id,
    1 - (embedding <=> :query_embedding) as similarity
from agent.job_embeddings
order by embedding <=> :query_embedding
limit :limit;
```

MVP:

```text
limit = 150
```

---

## 11.3 Skill graph retrieval

Input là canonical skill IDs.

Ví dụ:

```text
Python
FastAPI
Docker
```

Traversal:

```text
candidate skill
      │
      ├── exact skill
      │
      └── related skill
            │
            └── related skill
```

Khuyến nghị:

```text
max depth = 2
```

Để tránh graph explosion.

MVP:

```text
limit = 75
```

---

# 12. RRF fusion

Reciprocal Rank Fusion:

```text
RRF(d) =
Σ weight_r / (k + rank_r(d))
```

Default:

```text
k = 60
```

Ví dụ:

```python
def rrf(rankings, weights, k=60):
    scores = {}

    for source, ranked_docs in rankings.items():
        weight = weights[source]

        for rank, doc_id in enumerate(ranked_docs, start=1):
            scores.setdefault(doc_id, 0)
            scores[doc_id] += weight / (k + rank)

    return scores
```

Default weight:

```yaml
lexical: 1.0
semantic: 1.0
graph: 1.0
```

Sau MVP có thể điều chỉnh theo loại query.

Ví dụ:

```text
query ngắn / skill-heavy:
graph ↑
semantic ↑

query mô tả dài:
semantic ↑
lexical ↑
```

---

# 13. Hard constraints

Hard constraints được chạy trước scoring cuối.

Ví dụ:

```text
job.status == active

remote_only:
    job.remote_type must support remote

salary:
    nếu candidate đánh dấu salary_required
    thì salary range phải phù hợp

location:
    nếu candidate không relocate
    job phải ở allowed location

required_skill:
    nếu job xác định mandatory skill
    candidate phải có exact hoặc accepted equivalent
```

Output:

```json
{
  "passed": true,
  "constraints": {
    "remote": true,
    "salary": true,
    "location": true
  }
}
```

Job fail hard constraint không đi vào ranking.

---

# 14. Deterministic scoring

Default formula:

```text
U(candidate, job) =
    0.35 * skill_score
  + 0.25 * experience_score
  + 0.15 * location_score
  + 0.10 * salary_score
  + 0.10 * semantic_score
  + 0.05 * company_score
```

Tổng weights:

```text
1.00
```

Không hard-code trực tiếp trong code.

Lưu ở:

```text
agent.scoring_configs
```

---

# 15. Scoring config

```sql
create table agent.scoring_configs (
    id uuid primary key default gen_random_uuid(),
    version text not null unique,

    skill_weight numeric not null,
    experience_weight numeric not null,
    location_weight numeric not null,
    salary_weight numeric not null,
    semantic_weight numeric not null,
    company_weight numeric not null,

    config jsonb,

    active boolean default false,

    created_at timestamptz default now()
);
```

Ví dụ:

```json
{
  "version": "v1",
  "weights": {
    "skill": 0.35,
    "experience": 0.25,
    "location": 0.15,
    "salary": 0.10,
    "semantic": 0.10,
    "company": 0.05
  }
}
```

---

# 16. Factor scoring

## 16.1 Skill score

Bao gồm:

```text
exact match
graph-related match
proficiency
job skill importance
required skill
```

Ví dụ:

```text
exact skill weight     = 1.0
graph depth 1          = 0.7
graph depth 2          = 0.4
```

Pseudo:

```python
skill_score =
    weighted_matched_skill_value
    /
    weighted_required_skill_value
```

Clamp:

```text
0 <= score <= 1
```

---

## 16.2 Experience score

Có thể combine:

```text
years experience
seniority level
title relevance
```

Ví dụ:

```text
candidate >= required years
    = 1.0

candidate thiếu <= 1 năm
    = 0.75

thiếu 1-2 năm
    = 0.50

thiếu > 2 năm
    = 0.25
```

Seniority:

```text
exact        = 1.0
±1 level     = 0.7
>=2 levels   = 0.3
```

---

## 16.3 Location score

Ví dụ:

```text
remote-compatible = 1.0
exact city        = 1.0
same metro        = 0.9
same region       = 0.7
same country      = 0.5
otherwise         = 0
```

---

## 16.4 Salary score

Ví dụ:

```text
expected range overlap job range:
    1.0

candidate expectation <= 110% job max:
    0.7

<= 120%:
    0.4

otherwise:
    0
```

Nếu thiếu salary information:

```text
neutral score
```

Ví dụ:

```text
0.5
```

Policy này phải có trong scoring config.

---

## 16.5 Semantic score

Cosine similarity normalize về `[0, 1]`.

Không nên dùng raw cosine trực tiếp nếu model cho distribution khác nhau.

Khuyến nghị dùng calibration từ validation dataset.

MVP có thể dùng:

```text
semantic_score = clamp(similarity, 0, 1)
```

---

## 16.6 Company score

Dựa trên:

```text
industry preference
company size
company type
candidate preference
```

Ví dụ:

```text
preferred industry       +0.5
preferred company size   +0.3
preferred company type   +0.2
```

Normalize về `[0,1]`.

---

# 17. Explanation layer

LLM chỉ nhận structured evidence.

Input:

```json
{
  "job_title": "Senior Backend Engineer",
  "overall_score": 0.84,
  "factors": {
    "skill": 0.91,
    "experience": 0.82,
    "location": 1,
    "salary": 0.65,
    "semantic": 0.83,
    "company": 0.70
  },
  "matched_skills": [
    "Python",
    "FastAPI",
    "PostgreSQL"
  ],
  "related_skills": [
    {
      "candidate_skill": "Docker",
      "job_skill": "Containerization",
      "relation": "similar_to"
    }
  ],
  "gaps": [
    "Kubernetes"
  ]
}
```

Output:

```json
{
  "summary": "...",
  "strengths": [
    "..."
  ],
  "gaps": [
    "..."
  ]
}
```

LLM tuyệt đối không được trả lại score mới.

---

# 18. API specification

## 18.1 Start match

```http
POST /v1/matches
Authorization: Bearer <supabase-jwt>
```

Request:

```json
{
  "profile_id": "uuid",
  "limit": 50
}
```

Response:

```json
{
  "match_run_id": "uuid",
  "status": "queued"
}
```

---

## 18.2 Match status

```http
GET /v1/matches/{match_run_id}
```

Response:

```json
{
  "id": "uuid",
  "status": "processing",
  "progress": 60
}
```

---

## 18.3 Match results

Frontend có thể đọc trực tiếp từ Supabase:

```text
api.match_results
```

Hoặc backend:

```http
GET /v1/matches/{match_run_id}/results
```

---

## 18.4 Re-run matching

```http
POST /v1/matches/{match_run_id}/rerun
```

Request:

```json
{
  "scoring_config_version": "v2"
}
```

---

# 19. Backend module structure

Khuyến nghị:

```text
backend/
│
├── app/
│   ├── main.py
│   │
│   ├── api/
│   │   ├── matches.py
│   │   ├── jobs.py
│   │   └── health.py
│   │
│   ├── auth/
│   │   └── supabase_jwt.py
│   │
│   ├── agent/
│   │   ├── orchestrator.py
│   │   ├── state.py
│   │   └── tools.py
│   │
│   ├── matching/
│   │   ├── lexical.py
│   │   ├── semantic.py
│   │   ├── graph.py
│   │   ├── rrf.py
│   │   ├── constraints.py
│   │   ├── scoring.py
│   │   └── ranking.py
│   │
│   ├── llm/
│   │   ├── client.py
│   │   ├── extraction.py
│   │   └── explanation.py
│   │
│   ├── db/
│   │   ├── client.py
│   │   ├── repositories/
│   │   └── models/
│   │
│   ├── workers/
│   │   ├── matching_worker.py
│   │   └── embedding_worker.py
│   │
│   ├── config/
│   │   └── settings.py
│   │
│   └── observability/
│       ├── logging.py
│       └── metrics.py
│
├── tests/
├── migrations/
├── Dockerfile
└── pyproject.toml
```

---

# 20. Agent state

Không cần framework agent phức tạp trong MVP.

Có thể dùng Python state object:

```python
class MatchState(BaseModel):
    match_run_id: UUID
    profile_id: UUID

    profile: dict | None = None
    preferences: dict | None = None

    lexical_results: list = []
    semantic_results: list = []
    graph_results: list = []

    fused_results: list = []
    filtered_results: list = []
    scored_results: list = []

    errors: list = []
```

Agent orchestrator:

```python
async def run_matching(state: MatchState):
    await load_context(state)

    await parallel_retrieval(state)

    fuse_results(state)

    apply_constraints(state)

    calculate_scores(state)

    rank_results(state)

    await generate_explanations(state)

    await persist(state)
```

---

# 21. Parallel retrieval

Ba retrieval nên chạy song song.

Pseudo:

```python
lexical, semantic, graph = await asyncio.gather(
    lexical_search(...),
    semantic_search(...),
    graph_search(...),
)
```

Không để graph query block semantic query.

---

# 22. Candidate embedding strategy

Candidate embedding không nên build từ raw JSON.

Build canonical text:

```text
ROLE
Backend Engineer

SUMMARY
5 years building SaaS backend systems.

SKILLS
Python
FastAPI
PostgreSQL
Redis
Docker

SENIORITY
Senior

PREFERENCES
Remote
SaaS
AI
```

Lợi ích:

- ổn định format;
- dễ version;
- dễ debug;
- embedding reproducible.

Lưu:

```text
embedding_template_version
embedding_model
embedding_created_at
```

---

# 23. Job ingestion pipeline

```text
Raw Job
  │
  ▼
Validation
  │
  ▼
Normalization
  │
  ▼
LLM extraction
  │
  ├── normalized title
  ├── skills
  ├── required skills
  ├── seniority
  └── experience
  │
  ▼
Skill canonicalization
  │
  ▼
Embedding generation
  │
  ▼
FTS index
  │
  ▼
READY
```

Job status:

```text
pending
processing
ready
failed
inactive
```

Chỉ match job có:

```text
status = ready
```

---

# 24. Async queue design

Queue:

```text
job_ingestion
candidate_embedding
match_request
explanation_generation
```

Payload phải nhỏ.

Ví dụ:

```json
{
  "match_run_id": "uuid",
  "profile_id": "uuid"
}
```

Không push toàn bộ profile vào queue.

Worker tự load latest data từ DB.

---

# 25. Frontend flow

## Candidate profile

```text
Frontend
   ↓
Supabase Auth
   ↓
api.profiles
api.candidate_skills
api.candidate_preferences
```

Sau khi profile update:

```text
enqueue candidate_embedding
```

---

## Matching

```text
User click "Find Matches"
        │
        ▼
POST Backend /v1/matches
        │
        ▼
match_run = queued
        │
        ▼
worker processing
        │
        ▼
Supabase row update
        │
        ▼
Realtime event
        │
        ▼
Frontend refresh results
```

---

# 26. Supabase RLS

Mỗi candidate chỉ xem dữ liệu của chính mình.

Ví dụ logic:

```text
auth.uid()
  ↓
profiles.user_id
  ↓
match_runs.profile_id
  ↓
match_results.match_run_id
```

Frontend key:

```text
publishable / anon key
```

Backend:

```text
service role / secret key
```

Service role không được xuất hiện trong:

- browser bundle;
- frontend env public;
- logs;
- analytics.

---

# 27. Internal schema protection

Không expose `agent` schema qua Data API nếu không cần.

Frontend không cần truy cập:

```text
agent.job_embeddings
agent.candidate_embeddings
agent.scoring_configs
agent.match_evidence
agent.skill_relations
```

Nếu frontend cần explanation evidence, backend nên map dữ liệu cần thiết sang response DTO.

---

# 28. Caching

Có thể cache:

```text
candidate embedding
job embedding
skill graph expansion
matching config
normalized candidate query
```

Không cache lâu:

```text
match result nếu job data thay đổi liên tục
```

Cache key nên chứa version:

```text
candidate:{id}:embedding:{model}:{template_version}

skill:{id}:graph:{graph_version}

match:{profile_id}:{profile_version}:{config_version}
```

---

# 29. Observability

Mỗi match run cần log:

```text
match_run_id
profile_id
request_id

lexical_latency_ms
semantic_latency_ms
graph_latency_ms

lexical_count
semantic_count
graph_count

fusion_count
filtered_count
scored_count

explanation_latency_ms

total_latency_ms
```

---

# 30. Metrics

Các metrics kỹ thuật:

```text
p50 matching latency
p95 matching latency
p99 matching latency

retrieval error rate
embedding error rate
LLM error rate

queue depth
queue delay

DB query latency

candidate count
active jobs count
```

Metrics chất lượng:

```text
Recall@K
Precision@K
NDCG@K
MRR
CTR
Save-job rate
Apply rate
Reject rate
```

---

# 31. Evaluation dataset

Phải tạo offline validation set.

Ví dụ:

```text
candidate_id
job_id
label
reason
```

Label:

```text
0 = bad match
1 = weak
2 = acceptable
3 = good
4 = excellent
```

Không tune scoring weight trực tiếp trên production click mà chưa kiểm soát bias.

---

# 32. Benchmark retrieval

Test riêng:

```text
Lexical only
Semantic only
Graph only
Lexical + Semantic
Lexical + Semantic + Graph
```

Đo:

```text
Recall@50
Recall@100
NDCG@20
Latency
```

Các tham số phải configurable:

```yaml
retrieval:
  lexical_limit: 150
  semantic_limit: 150
  graph_limit: 75
  fusion_limit: 500
  rrf_k: 60
```

Không hard-code dựa hoàn toàn trên paper.

---

# 33. Failure handling

## Embedding failure

```text
retry exponential backoff
```

Sau giới hạn:

```text
status = failed
dead-letter queue
```

## LLM explanation failure

Matching result vẫn valid.

```text
score giữ nguyên
explanation = null
```

Không fail toàn bộ matching pipeline.

## Graph failure

Có thể graceful degradation:

```text
Lexical + Semantic
```

## Semantic failure

Fallback:

```text
Lexical + Graph
```

Matching engine phải có degradation mode.

---

# 34. Security

Bắt buộc:

- JWT validation.
- RLS.
- Service role chỉ ở backend.
- Không cho Agent generate arbitrary SQL.
- Tool arguments validate bằng Pydantic.
- Rate limiting.
- Request size limit.
- Prompt injection filtering cho job descriptions nếu nội dung được đưa vào LLM.
- Không gửi dữ liệu không cần thiết sang LLM provider.
- Mask PII trong logs.
- Audit config version.

---

# 35. LLM usage policy

LLM được phép:

```text
profile extraction
job extraction
skill normalization fallback
query enrichment
explanation
```

LLM không được:

```text
tính final matching score
thay đổi ranking
thay đổi hard constraints
ghi arbitrary SQL
đọc toàn bộ database
```

---

# 36. Versioning

Các thành phần phải version:

```text
matching_algorithm_version
scoring_config_version
embedding_model
embedding_template_version
skill_graph_version
extraction_prompt_version
explanation_prompt_version
```

Mỗi match run phải biết các version đã sử dụng.

---

# 37. Test strategy

## Unit tests

```text
RRF
skill scoring
experience scoring
salary scoring
location scoring
hard constraints
graph depth
normalization
```

## Integration tests

```text
Supabase Postgres
pgvector
FTS
queue
backend API
```

## End-to-end tests

```text
create profile
update skills
generate embedding
run matching
wait completion
read results
submit feedback
```

---

# 38. Performance target cho MVP

Mục tiêu ban đầu:

```text
retrieval:
< 500 ms

deterministic scoring:
< 300 ms / request

matching không explanation:
p95 < 2 s

matching + explanation:
async
```

Không nên block user request chờ LLM explanation của 50 job.

Có thể trả score trước, explanation cập nhật sau.

---

# 39. Recommended explanation strategy

Không generate explanation cho toàn bộ 100 matches ngay.

MVP:

```text
Top 10:
    generate explanation

Rank 11-100:
    generate on demand
```

Giảm:

- cost;
- latency;
- LLM quota;
- queue load.

---

# 40. Triển khai theo phase

## Phase 0 — Foundation

Mục tiêu:

- repo;
- Supabase;
- backend;
- CI/CD;
- env;
- migrations.

Tasks:

- tạo Supabase project;
- enable pgvector;
- tạo schema `api`;
- tạo schema `agent`;
- migrations;
- backend FastAPI;
- JWT validation;
- health check;
- structured logging.

Exit criteria:

```text
frontend login thành công
backend verify được JWT
backend connect được Postgres
migrations chạy tự động
```

---

# 41. Phase 1 — Core data model

Tasks:

- profiles;
- candidate preferences;
- skills;
- candidate skills;
- jobs;
- job skills;
- RLS;
- frontend CRUD.

Exit criteria:

```text
candidate chỉnh sửa profile
candidate thêm skill
job được import
RLS ngăn user đọc dữ liệu user khác
```

---

# 42. Phase 2 — Embedding & search

Tasks:

- canonical candidate document;
- canonical job document;
- embedding pipeline;
- pgvector;
- HNSW;
- FTS;
- benchmark.

Exit criteria:

```text
semantic search hoạt động
lexical search hoạt động
latency đạt target
```

---

# 43. Phase 3 — Skill graph

Tasks:

- canonical skill taxonomy;
- skill aliases;
- skill relations;
- graph traversal;
- job skill mapping.

Exit criteria:

```text
exact skill match
depth-1 match
depth-2 match
graph score deterministic
```

---

# 44. Phase 4 — Hybrid matching

Tasks:

- parallel retrieval;
- RRF;
- hard constraints;
- candidate pool;
- factor scoring;
- ranking;
- persistence.

Exit criteria:

```text
matching end-to-end không cần LLM
score reproducible
evidence được lưu
```

---

# 45. Phase 5 — Agent orchestration

Tasks:

- MatchState;
- agent tools;
- orchestrator;
- retry;
- timeout;
- degradation.

Exit criteria:

```text
agent chỉ gọi predefined tools
partial retrieval failure không phá toàn bộ run
matching run có audit logs
```

---

# 46. Phase 6 — Explanation

Tasks:

- structured evidence;
- prompt;
- LLM gateway;
- top-N explanation;
- on-demand explanation;
- caching.

Exit criteria:

```text
LLM không thay đổi score
explanation grounded trên evidence
LLM fail không làm mất kết quả match
```

---

# 47. Phase 7 — Async & realtime

Tasks:

- queue;
- matching worker;
- embedding worker;
- match status;
- Supabase Realtime;
- retry;
- dead-letter queue.

Exit criteria:

```text
frontend trigger run
worker process async
frontend nhận completed event
```

---

# 48. Phase 8 — Evaluation

Tasks:

- validation dataset;
- retrieval benchmark;
- scoring benchmark;
- tune limits;
- tune weights;
- tune graph depth;
- threshold calibration.

Exit criteria:

```text
có baseline
có metric
có version config
có report benchmark
```

---

# 49. Phase 9 — Production hardening

Tasks:

- load test;
- rate limit;
- Sentry/OpenTelemetry;
- DB index audit;
- backup;
- secrets rotation;
- queue monitoring;
- LLM budget;
- data retention policy.

Exit criteria:

```text
production readiness checklist pass
```

---

# 50. Suggested sprint plan

## Sprint 1

```text
Supabase setup
Auth
Database schema
RLS
FastAPI base
```

## Sprint 2

```text
Job ingestion
Candidate profile
Skill taxonomy
Embedding
```

## Sprint 3

```text
FTS
Vector search
Graph search
```

## Sprint 4

```text
RRF
Hard filters
Scoring engine
Match persistence
```

## Sprint 5

```text
Agent orchestration
Queue
Realtime
```

## Sprint 6

```text
LLM explanation
Evaluation
Observability
Production hardening
```

---

# 51. MVP API sequence

```text
Frontend
   │
   ├── UPDATE profile ───────────────► Supabase
   │
   │
   ├── POST /v1/matches ────────────► Backend
   │                                  │
   │                                  ├── create match_run
   │                                  └── enqueue job
   │
   │◄──────── match_run_id ───────────┘
   │
   ├── subscribe match_run ─────────► Supabase Realtime
   │
   │                         Worker
   │                           │
   │                           ├── lexical
   │                           ├── semantic
   │                           ├── graph
   │                           ├── RRF
   │                           ├── filter
   │                           ├── score
   │                           └── persist
   │
   │◄──────── completed ───────────── Supabase
   │
   └── SELECT match_results ─────────► Supabase
```

---

# 52. Recommended initial stack

Frontend:

```text
Next.js
TypeScript
supabase-js
TanStack Query
```

Backend:

```text
Python
FastAPI
Pydantic
psycopg / SQLAlchemy
asyncio
```

Database:

```text
Supabase PostgreSQL
pgvector
GIN Full Text Search
HNSW
```

Async:

```text
Supabase Queues
```

AI:

```text
Embedding model
LLM explanation model
```

Observability:

```text
OpenTelemetry
Sentry
structured JSON logs
```

---

# 53. Decision log

## PostgreSQL thay vì Elasticsearch cho MVP

Lý do:

- giảm infra;
- cùng datasource;
- đủ FTS cho MVP;
- transaction đơn giản;
- dễ vận hành.

Tách Elasticsearch khi:

```text
query complexity tăng mạnh
corpus rất lớn
FTS latency không đạt yêu cầu
ranking/search feature vượt khả năng Postgres
```

---

## PostgreSQL graph thay vì Neo4j cho MVP

Lý do:

- graph traversal depth nhỏ;
- skill graph tương đối bounded;
- giảm operational overhead.

Tách Neo4j khi:

```text
graph traversal sâu
graph analytics lớn
nhiều relation type
complex path query
Postgres recursive CTE trở thành bottleneck
```

---

## Không dùng agent framework trong MVP

Agent hiện tại chủ yếu là deterministic workflow.

Python orchestration đủ:

```text
asyncio
typed state
typed tools
retry
timeout
```

Có thể đưa LangGraph hoặc framework tương tự vào khi:

```text
workflow có branching phức tạp
human-in-the-loop
multi-agent
long-running state machine
tool graph thay đổi động
```

---

# 54. Definition of Done cho MVP

MVP được xem là hoàn thành khi:

- User login bằng Supabase.
- Candidate profile CRUD hoạt động.
- Job ingestion hoạt động.
- Skill extraction hoạt động.
- Candidate/job embedding hoạt động.
- FTS hoạt động.
- pgvector search hoạt động.
- Skill graph search hoạt động.
- Hybrid retrieval hoạt động.
- RRF hoạt động.
- Hard filter hoạt động.
- Deterministic score hoạt động.
- Score có audit evidence.
- Matching run chạy async.
- Frontend nhận status realtime.
- Top matches có explanation.
- Có benchmark retrieval.
- Có version scoring config.
- Có logging và error handling.
- RLS được test.
- Service role không lộ frontend.

---

# 55. Ưu tiên triển khai

Thứ tự nên giữ:

```text
1. Data model
2. Security / RLS
3. Ingestion
4. Embedding
5. Retrieval
6. Scoring
7. Evaluation
8. Agent orchestration
9. Explanation
10. Optimization
```

Không nên bắt đầu từ LLM agent trước khi deterministic matching engine hoàn chỉnh.

---

# 56. Kiến trúc mục tiêu MVP

```text
                 Frontend
                    │
          ┌─────────┴─────────┐
          │                   │
          ▼                   ▼
     Supabase              Backend
          │                   │
          │             Match Agent
          │                   │
          │       ┌───────────┼───────────┐
          │       │           │           │
          │       ▼           ▼           ▼
          │      FTS       pgvector    Skill Graph
          │       │           │           │
          │       └───────────┼───────────┘
          │                   ▼
          │                  RRF
          │                   ▼
          │             Hard Constraints
          │                   ▼
          │            Factor Scoring
          │                   ▼
          │                Ranking
          │                   ▼
          │             LLM Explanation
          │                   │
          └───────────────────┘
```

Đây nên là baseline trước khi bổ sung Elasticsearch, Neo4j, learning-to-rank hoặc multi-agent orchestration.
