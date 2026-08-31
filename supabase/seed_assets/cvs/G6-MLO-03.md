---
cv_id: G6-MLO-03
group_id: 6
group_name: AI/ML
subgroup: MLOps Engineer
target_role: MLOps Lead
candidate_name: Ha Thi Kim Lien
seniority: senior
years_experience: 11
quality_profile: cross_domain
cross_domain_tags: [system-administration, database-administration, devops, it-operations]
language: en
source: synthetic_llm
---

# Ha Thi Kim Lien

Hai Chau, Da Nang | +84 905 613 748 | lien.hathikim@gmail.com
linkedin.com/in/kimlien-ha | github.com/kimlien-ops

## Summary

Eleven years in operations, the last three of them running an ML platform. The path was
sysadmin, then Oracle DBA, then DevOps, then this - which means my ML platform experience is the
thinnest slice of a long career, and the operational judgement underneath it is the thickest.

I am open about the trade. I have never trained a model of consequence and I do not want to. What
I do is make sure the training finishes, the artefact is reproducible, the thing that got deployed
is the thing that got approved, and somebody is awake when it stops. Teams that already have good
data scientists and no operational discipline are where I am most useful.

## Experience

### MLOps Lead | Enfarm Technology, Da Nang | Feb 2023 - Present
- Three engineers reporting to me. Platform for an agricultural IoT product: sensor ingest,
  forecasting and anomaly models, and edge model distribution to about 9,000 deployed devices.
- Built the model release process. Every deployed model traces to a git commit, a dataset
  snapshot hash, a training run and a named human approval. This did not exist before and the
  first audit question we could not answer was what made me build it.
- Over-the-air model updates to the device fleet: signed artefacts, staged rollout by cohort,
  automatic halt on error-rate regression, and a guaranteed rollback slot on the device. Two
  rollbacks used in anger, both worked.
- Training runs on a mix of one on-premises GPU box and spot instances on GCP; checkpoint-resume
  so that a pre-emption costs minutes rather than a day. Roughly 40% cheaper than the on-demand
  plan we started with.
- Ingest pipeline handles about 12 million sensor readings a day into TimescaleDB, then Parquet on
  object storage for training. I designed the retention and downsampling policy, which is a DBA
  job wearing a different hat.
- Introduced the on-call rotation, the runbook format and the blameless postmortem practice.
  Mean time to recovery on platform incidents down from about 4 hours to 50 minutes over
  eighteen months.
- Also still the person who fixes the VPN.

### DevOps Engineer | Axon Active Vietnam, Da Nang | Sep 2018 - Jan 2023
- Platform and CI for Swiss client teams, Agile fixed-team model. Kubernetes on Azure, Azure
  DevOps pipelines, Terraform.
- Ran the database side for six product teams: PostgreSQL and SQL Server, backup and restore
  testing, replication, performance tuning. Restore drills quarterly, and we found two backups
  that would not have restored.
- Reduced build times across nine repositories by about 60% mainly through caching and by
  deleting steps nobody could justify.
- On-call, one week in five, for four years.
- Trained two junior engineers who now hold senior positions elsewhere, which I count as one of my
  better outcomes.

### Oracle Database Administrator | Vietcombank, Da Nang branch operations | Mar 2015 - Aug 2018
- Production DBA for core banking peripheral systems. RAC, Data Guard, RMAN, partitioning,
  performance diagnosis with AWR.
- Zero unplanned data loss across the period. Three failovers, all planned exercises, all
  completed inside the recovery-time objective.
- Change control and audit evidence to banking supervisory standards. Tedious and formative.

### System Administrator | Da Nang Software Park (DSAC), Da Nang | Jul 2014 - Feb 2015
- Windows and Linux server administration, Active Directory, backup, and the helpdesk queue for
  about 120 users.

## Education

### B.Sc., Information Technology | Danang University of Science and Technology | 2010 - 2014
- GPA 3.05/4.0. Evening study while working part-time in a computer shop from second year.

### Ongoing
- Working through the Full Stack Deep Learning course material and the Designing Machine Learning
  Systems reading, slowly, in evenings. I mention it because it is honest about where my ML
  knowledge comes from.

## Certifications

### Oracle Database 12c Administrator Certified Professional (OCP) | 2016
### Certified Kubernetes Administrator (CKA) | 2021, renewed 2024
### Microsoft Certified: Azure Administrator Associate | 2020
### Red Hat Certified Engineer (RHCE) | 2017, long expired and listed for the career record

## Technical Skills

**ML platform:** MLflow, model registry and release governance, KServe and Triton for serving,
DVC, Evidently for drift, GPU node operations, spot training with checkpointing, edge model
distribution and signing
**Kubernetes and cloud:** Kubernetes (Azure AKS, GCP GKE, bare metal), Helm, Argo CD, Azure and
GCP at a working level, cost management
**Databases:** Oracle (RAC, Data Guard, RMAN), PostgreSQL, TimescaleDB, SQL Server, backup and
restore strategy, replication, retention and partitioning design
**Infrastructure as code and CI:** Terraform, Ansible, Azure DevOps, GitLab CI, GitHub Actions
**Observability and process:** Prometheus, Grafana, Loki, Zabbix, incident command, runbooks,
postmortems, on-call design, change control and audit evidence
**Languages:** Bash, Python, PL/SQL. Go only to read.
**Modelling:** minimal, and deliberately so. I can read a training script and I cannot review a
loss function.

## Languages

Vietnamese native. English - fluent, four years of daily standups with a Swiss team. German -
elementary A2, from a company course during the Axon years, not usable professionally.

## Note

Da Nang based and intend to stay. Open to a remote role with travel, or a hybrid role in Da Nang.
