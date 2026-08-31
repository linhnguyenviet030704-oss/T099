---
cv_id: G6-MLO-04
group_id: 6
group_name: AI/ML
subgroup: MLOps Engineer
target_role: MLOps Engineer (Fresher)
candidate_name: Dang Thi Thu Ha
seniority: junior
years_experience: 0
quality_profile: polished
cross_domain_tags: []
language: en
source: synthetic_llm
---

# Dang Thi Thu Ha

Ha Dong, Ha Noi | +84 943 227 810 | thuha.dang.mlops@gmail.com
github.com/thuha-mlops | linkedin.com/in/dangthithuha

## Summary

Software Engineering graduate (AI major) with a three-month MLOps internship at Tiki, where I built
part of the retraining pipeline for a demand-forecasting model. More interested in the plumbing
around models - CI, tracking, deployment - than in modelling itself.

## Education

### B.Eng, Software Engineering (AI major) | FPT University, Ha Noi | 2021 - 2025
- GPA 3.5/4.0. Coursework: Machine Learning, DevOps Fundamentals, Cloud Computing, Software
  Engineering Project.
- Capstone project: end-to-end MLOps pipeline template (data validation, training, tracking,
  containerised serving) built for a sample demand-forecasting use case.

## Experience

### MLOps Intern | Tiki, Ho Chi Minh City (remote from Ha Noi) | Jun 2024 - Sep 2024
- Supported the data platform team on the retraining pipeline for a demand-forecasting model that
  had been retrained manually every two weeks.
- Built the GitHub Actions workflow that triggers retraining on a schedule, runs a fixed evaluation
  set, and blocks promotion if the new model's MAE is worse than the current one.
- Set up MLflow tracking for the pipeline so the three most recent runs, their metrics and their
  artefacts are always visible to the team without digging through logs.
- Wrote a short runbook for the on-call data engineer covering what to check if a scheduled
  retraining run fails.

## Projects

**MLOps pipeline template (capstone):** data validation (Great Expectations) -> training -> MLflow
tracking -> Docker image build -> deploy, wired together with GitHub Actions, applied to a public
retail demand-forecasting dataset. Documented as a reusable template on GitHub.
**Sentiment model deployment (personal):** fine-tuned a small sentiment classifier, wrapped it in
FastAPI, containerised it, and deployed it on a free-tier cloud VM with a basic health-check and
restart policy - mostly to learn what breaks when a small service runs unattended for a week.

## Technical Skills

**Languages:** Python, Bash
**MLOps/DevOps:** Docker, GitHub Actions, MLflow, Great Expectations (course/capstone use)
**Cloud:** AWS (S3, EC2, IAM basics - free-tier level)
**Other:** Git, Linux, basic Kubernetes (kubectl, coursework only, no production use yet)

## Certifications

### AWS Certified Cloud Practitioner | 2024

## Languages

Vietnamese native. English - TOEIC 750 (2023), comfortable with technical documentation.
