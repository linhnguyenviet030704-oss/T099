---
cv_id: G9-SWA-04
group_id: 9
group_name: "Architecture"
subgroup: Software Architect
target_role: Backend Engineer / Junior Software Architect (Fresher, architecture track)
candidate_name: Le Thi Hong Nhung
seniority: junior
years_experience: 0
quality_profile: polished
cross_domain_tags: []
language: en
source: synthetic_llm
---

# Le Thi Hong Nhung

Dong Da, Ha Noi | +84 981 273 650 | nhung.lth.dev@gmail.com
github.com/hongnhung-dev

## Summary

Software Engineering graduate with a strong system-design coursework track and a five-month backend
internship at a gaming scale-up, where I got to sit in on architecture-review meetings, not just
write code. Longer-term goal is software architecture; starting as a backend engineer with design
responsibility to get there.

## Education

### B.Eng, Software Engineering | Hanoi University of Science and Technology (HUST) | 2021 - 2025
- GPA 3.65/4.0. Coursework: Software Architecture, Distributed Systems, Database Systems, Design
  Patterns, Advanced Algorithms.
- Graduation thesis: "Evaluating event-driven vs. request-response architecture for a real-time
  leaderboard service", grade 9.3/10, included a working prototype of both approaches under load.

## Experience

### Backend Engineer Intern | Sky Mavis, Ha Noi | Jun 2024 - Nov 2024
- Built two backend services (Go) for an internal tooling platform under a tech lead who also acted
  as the team's de facto architect.
- Sat in on the team's architecture-review sessions for a new event-processing pipeline; wrote the
  first draft of the sequence diagrams the lead then corrected and used in the design doc.
- Proposed splitting a shared internal service into two smaller ones after tracing a recurring
  on-call page to an unrelated feature's load spiking the shared service - the lead adopted the
  proposal and it shipped after the internship ended.
- Wrote unit and integration tests for both services (78% coverage), and the deployment manifests
  (Kubernetes) for staging.

## Projects

**Event-driven vs. request-response leaderboard service (thesis):** built both architectures for a
real-time gaming leaderboard - one using Kafka + a stream processor, one using synchronous REST
calls - and load-tested both to compare latency and consistency trade-offs under bursty write
patterns.
**Personal - small microservices playground:** three toy services (Go) communicating over gRPC and
a message queue, mainly to practise service boundaries and contract design before doing it for real.

## Technical Skills

**Languages:** Go, Java, SQL
**Architecture/design:** design patterns, basic domain-driven design, event-driven architecture
(Kafka), API/contract design
**Infra:** Docker, Kubernetes (basic), Git
**Data:** PostgreSQL, Redis (basic)

## Certifications

### None yet - prioritised the thesis and internship over certifications this year

## Languages

Vietnamese native. English - TOEIC 820 (2023), comfortable reading and writing design docs in
English.
