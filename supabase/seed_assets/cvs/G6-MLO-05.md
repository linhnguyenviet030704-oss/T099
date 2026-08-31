---
cv_id: G6-MLO-05
group_id: 6
group_name: AI/ML
subgroup: MLOps Engineer
target_role: Senior MLOps Engineer
candidate_name: Tran Anh Duc
seniority: senior
years_experience: 8
quality_profile: polished
cross_domain_tags: []
language: en
source: synthetic_llm
---

# Tran Anh Duc

Thu Duc, Ho Chi Minh City | +84 972 415 038 | duc.trananh.mlops@gmail.com
github.com/ducta-mlops | linkedin.com/in/tran-anh-duc-mlops

## Profile

MLOps engineer with eight years building the platforms other teams train and serve models on,
the last three at Zalo where I look after training infrastructure and model serving for four
product teams. I spend more time on GPU scheduling, registries and on-call than on any model
itself, and I am fine with that being the job.

## Work Experience

### Senior MLOps Engineer | Zalo (VNG Corporation), Ho Chi Minh City | Apr 2023 - Present
- Own the ML platform serving four product teams - about 25 data scientists and engineers, close
  to 50 models in production across chat, feed ranking and fraud detection.
- Replaced notebook-to-production handoffs with a templated pipeline: Kubeflow Pipelines for
  training, an MLflow registry, and an Argo CD-based deployment path; median time from a
  validated model to a served endpoint dropped from nine days to under five hours.
- GPU scheduling on Kubernetes with MIG partitioning on the A100 nodes; utilisation went from
  about 35% to 64% over two quarters, deferring a hardware purchase estimated at roughly 2.8
  billion VND.
- Built model monitoring for prediction drift, feature drift and business-metric decay, alerting
  into the platform on-call rotation; 18 alerts fired in the past year, 13 of them real.
- Availability of the online inference gateway at 99.95% over the last four quarters; the one
  incident worth naming was a 35-minute outage from an unbounded batch size on a newly onboarded
  model, now guarded by a default request-size limit.
- Run the platform on-call rotation, one week in four, same shifts as the rest of the team.

### MLOps Engineer | Shopee Vietnam, Ho Chi Minh City | Jan 2020 - Mar 2023
- Built the first dedicated serving stack for the recommendation team: Triton behind an internal
  gateway, canary deployment by traffic weight, automatic rollback on latency or error-rate
  regression.
- Migrated batch scoring from Airflow to Argo Workflows for about 60 DAGs; took four months and
  cut average DAG failure-recovery time from roughly two hours to twenty minutes.
- Set up the feature-store online layer on Redis with point-in-time correctness enforced in the
  client library rather than left to convention, after a skew bug traced back to three different
  definitions of the same feature.

### DevOps Engineer | TMA Solutions, Ho Chi Minh City | Jul 2018 - Dec 2019
- General platform work for outsourced clients: Kubernetes, Terraform and Jenkins CI for around
  20 microservices across two projects.
- Moved onto ML-adjacent work when one client's data science team needed their first model
  served; built a basic Flask-based serving wrapper and a manual deployment runbook.

## Education

### B.Eng, Information Technology | Ho Chi Minh City University of Technology (HCMUT) | 2014 - 2018
- GPA 3.20/4.0. Not a strong academic record; everything platform-related is from the job and
  from certifications.

## Certifications

### Certified Kubernetes Administrator (CKA) | 2021, renewed 2024
### AWS Certified DevOps Engineer - Professional | 2022

## Technical Skills

**Languages:** Python, Go, Bash
**Frameworks:** Kubeflow Pipelines, MLflow, Feast, KServe, Triton Inference Server, DVC
**Infra/MLOps:** Kubernetes, Helm, Argo CD, Argo Workflows, Terraform, Prometheus, Grafana,
NVIDIA device plugin, MIG partitioning
**Other:** cost attribution and spot-instance training with checkpoint-resume, on-call rotation
and incident postmortems

## Projects and Community

### kf-vn-notes (open source) | maintainer | 2023 - Present
- Small collection of Kubeflow-on-Kubernetes deployment notes and Helm overlays for teams running
  on-premises GPU clusters, written up after doing the same migration twice from scratch.

### Speaker, Vietnam DevOps Day 2025 | "GPU utilisation is a scheduling problem, not a budget one"

## Languages

Vietnamese native. English - fluent, working language for vendor and platform-team coordination.
TOEIC 860 (2021).

## References

Available on request.
