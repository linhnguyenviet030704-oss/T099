---
cv_id: G6-MLO-01
group_id: 6
group_name: AI/ML
subgroup: MLOps Engineer
target_role: Senior MLOps Engineer
candidate_name: Dinh Cong Thanh
seniority: senior
years_experience: 7
quality_profile: polished
cross_domain_tags: []
language: en
source: synthetic_llm
---

# Dinh Cong Thanh

Cau Giay, Ha Noi | +84 975 218 403 | thanh.dinhcong@gmail.com
github.com/thanhdc-mlops | linkedin.com/in/thanhdinhcong

## Summary

I build the machinery that other people's models run on. Training platforms, GPU scheduling,
registries, CI for models, and the on-call rotation that comes with all of it. Seven years, the
last four specifically on ML platforms. My work is visible mainly when it breaks, so this CV is
mostly about how often it did not.

## Experience

### Senior MLOps Engineer | VNPAY, Ha Noi | May 2023 - Present
- Own the ML platform used by four model teams - about 30 data scientists and engineers, 60-odd
  models in production.
- Replaced ad-hoc notebook-to-production handoffs with a templated pipeline: cookiecutter project,
  Kubeflow Pipelines for training, MLflow registry, and an Argo CD deployment path. Median time
  from a validated model to a served endpoint went from eleven days to under four hours.
- GPU scheduling on Kubernetes with time-slicing and MIG on the A100 nodes. Utilisation went from
  roughly 30% to 68% measured over a quarter, which deferred a hardware purchase of about 3.2
  billion VND.
- Feature platform on Feast plus Redis and Iceberg. Point-in-time correctness is enforced in the
  library rather than left to convention, because the convention lost every time.
- Model monitoring: prediction drift, feature drift, and business-metric decay, alerting into the
  same PagerDuty rotation as the rest of platform. 14 alerts fired in the last twelve months, 11
  of them real.
- Availability of the online inference gateway 99.96% over the last four quarters. Two incidents
  worth naming: an OOM cascade caused by an unbounded batch size on a new model, and a 40-minute
  outage from a certificate rotation I owned and got wrong. Both have public postmortems
  internally.
- Cost work: per-model cost attribution, spot instances for training with checkpoint-resume, and
  a scheduled shutdown of idle development GPUs. Platform spend down 31% year on year on 2.4x the
  workload.
- Run the platform on-call rotation, one week in four, and I take the same shifts as everyone
  else.

### DevOps Engineer, then MLOps Engineer | Viettel Digital Services, Ha Noi | Jun 2021 - Apr 2023
- Started on general platform work - Kubernetes, Terraform, GitLab CI for about 40 microservices -
  and moved onto the ML side when the data science team's first model needed to be served.
- Built the first serving stack: Triton behind an Envoy gateway, canary deployment by traffic
  weight, automatic rollback on error rate or latency regression.
- On-premises Kubernetes with GPU nodes, including the parts nobody enjoys: driver and CUDA
  version matrices, NVIDIA device plugin, node problem detector, and a runbook for a GPU that has
  fallen off the bus.
- Airflow to Argo Workflows migration for the batch scoring jobs, about 90 DAGs. Took five months
  and I would budget eight next time.

### Systems Engineer | CMC Telecom, Ha Noi | Aug 2018 - May 2021
- Linux infrastructure, virtualisation, monitoring and backup for internal and customer systems.
- Built the Prometheus and Grafana stack that replaced Nagios; wrote most of the alert rules and
  then spent six months deleting the ones that woke people up for nothing.
- Automated the OS provisioning path with Ansible. About 200 hosts.

## Selected Work Outside the Job

- Maintainer of `kubeflow-vn`, a Vietnamese-language deployment guide and Helm overlay for
  Kubeflow on bare-metal clusters. Modest audience, steady issue traffic.
- Speaker, Vietnam DevOps Day 2024: "GPU utilisation is a scheduling problem, not a hardware
  problem."
- Ran an internal eight-week study group on Kubernetes internals, twice.

## Education

### B.Eng, Electronics and Telecommunications | Posts and Telecommunications Institute of Technology (PTIT) | 2014 - 2018
- GPA 3.24/4.0. Not a computer science degree; everything platform-related is from the job and
  from certifications.

## Certifications

### Certified Kubernetes Administrator (CKA) | 2022, renewed 2025
### Certified Kubernetes Security Specialist (CKS) | 2023
### AWS Certified DevOps Engineer - Professional | 2022
### HashiCorp Certified Terraform Associate | 2021

## Technical Skills

**Orchestration:** Kubernetes (on-premises and EKS, operator development in Go at a basic level),
Helm, Argo CD, Argo Workflows, Kustomize
**ML platform:** Kubeflow Pipelines, MLflow, Feast, Ray, KServe, Triton Inference Server, DVC,
Metaflow at an evaluation level
**GPU:** NVIDIA device plugin, MIG partitioning, time-slicing, DCGM exporter, CUDA and driver
version management, spot-instance training with checkpointing
**Infrastructure as code:** Terraform, Ansible, Packer
**CI/CD:** GitLab CI, GitHub Actions, Jenkins (legacy, maintained not chosen)
**Observability:** Prometheus, Grafana, Loki, Tempo, OpenTelemetry, Evidently and custom drift
checks, PagerDuty
**Languages:** Python, Go, Bash. Enough Java to read a stack trace and argue about a JVM flag.
**Cloud:** AWS primarily, GCP at a working level, on-premises for most of my career

## Languages

Vietnamese native. English - fluent written and spoken; ran the vendor negotiation with two
international hardware suppliers in English. TOEIC 880 (2021).
