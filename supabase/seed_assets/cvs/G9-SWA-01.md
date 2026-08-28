---
cv_id: G9-SWA-01
group_id: 9
group_name: "Architecture"
subgroup: Software Architect
target_role: Software Architect / Principal Engineer
candidate_name: Tran Ngoc Hai
seniority: senior
years_experience: 13
quality_profile: polished
cross_domain_tags: []
language: en
source: synthetic_llm
---

# Tran Ngoc Hai

District 7, Ho Chi Minh City | +84 903 664 812 | hai.tranngoc.arch@gmail.com
github.com/haitn-arch

## Profile

Thirteen years engineering, the last five as the architect of a single product rather than of
engagements. My design serves a roadmap that will still exist in three years, so I optimise for
the cost of change rather than the cost of first delivery. A solution architect gets to hand a
design over; I have to live in mine, and every shortcut I have taken has come back to me
personally. I still write code - roughly a day a week, in the parts nobody wants to own.

## Experience

### Software Architect / Principal Engineer | VNG Corporation, Ho Chi Minh City | Jan 2021 - Present

- Architect for a payments and wallet product line - about 70 engineers across nine teams. I do
  not manage them; I own the technical direction, the interfaces between teams, and the decisions
  that are expensive to reverse.
- Led the decomposition of a seven-year-old monolith into eleven services over about two and a
  half years. We extracted along transaction boundaries rather than along the org chart, which
  cost us more up front and meant we never had to build a distributed transaction.
- The decision I defend most often is that we kept a single shared PostgreSQL cluster for the
  first two years of that decomposition. Database-per-service is correct and it is also a data
  migration per service, and we could not afford eleven of them simultaneously. Seven of the
  eleven now have their own store, and four still do not, and that is a deliberate position
  rather than unfinished work.
- Peak throughput about 9,000 transactions per second during Tet promotional windows, against a
  baseline of roughly 700. Designing for a 13x seasonal spike drives the queue-based write path,
  the read replicas, and the fact that we degrade non-essential features under load.
- Rebuilt the idempotency and reconciliation model after a 2022 incident in which a retried
  callback double-credited about 1,800 wallets over 40 minutes. Every write path now carries an
  idempotency key end to end, and reconciliation runs continuously rather than nightly.
- Own the architecture decision record log - 60-odd entries - and run a fortnightly architecture
  forum where team leads bring designs. Attendance is not mandatory, which I think is why it works.
- Set the service template: observability, error handling, deployment shape, and the interface
  contract standard. A new service should be boring to create.

### Technical Lead, then Staff Engineer | Grab Vietnam (R&D centre), Ho Chi Minh City | Mar 2017 - Dec 2020

- Backend for the driver-side platform - allocation, incentives and driver earnings. Go and Java,
  Kafka, MySQL and DynamoDB, on AWS.
- Led the rewrite of the incentive calculation engine. The previous one produced disputes because
  it recomputed from live data; the replacement recorded the inputs to every decision, which made
  earnings explainable to a driver. Support tickets on earnings fell by roughly two thirds.
- First exposure to genuinely large scale: capacity planning, load shedding, circuit breakers, and
  the idea that a service should have a documented failure behaviour rather than an implicit one.

### Senior Software Engineer | Tiki, Ho Chi Minh City | Jun 2014 - Feb 2017
### Software Engineer | Global CyberSoft, Ho Chi Minh City | Aug 2012 - May 2014

- Marketplace order and inventory services at Tiki - PHP then Java, the transition from a single
  application to services, and my first serious production incident, which was mine.
- Before that, two years of Java enterprise work on outsourced projects. Nothing distinguished; it
  is where I learned to read other people's code.

## Education

### B.Eng, Computer Science | Ho Chi Minh City University of Technology (HCMUT) | 2008 - 2012
- GPA 8.3/10.

## Certifications

### AWS Certified Solutions Architect - Professional | 2022
### Certified Kubernetes Application Developer (CKAD) | 2021
### Oracle Certified Professional, Java SE 8 | 2015 - historical, listed for completeness

## Skills

**Architecture:** service decomposition and boundary design, event-driven architecture and the
consistency arguments that come with it, idempotency and exactly-once delivery in practice, CQRS
and event sourcing where they are warranted and an argument against them where they are not,
API contract design and versioning, architecture decision records, C4 diagrams
**Distributed systems:** backpressure and load shedding, circuit breakers and bulkheads, capacity
planning against seasonal peaks, multi-AZ failure design
**Languages and runtimes:** Go and Java are where I am strongest; PHP historically; Python for
tooling; SQL to a level where I read query plans without help
**Data:** PostgreSQL and MySQL including replication and partitioning, Redis, Kafka to a design
depth (partitioning, ordering guarantees, consumer group behaviour), DynamoDB, online migration
**Platform:** AWS, Kubernetes, Terraform at a review level, observability - OpenTelemetry,
Prometheus, distributed tracing, and an opinion that a service without a trace is not production
**Practice:** technical mentoring, design review facilitation, incident review, hiring loops
**Domain:** payments and wallets, e-commerce marketplace, ride-hailing driver platforms

## Two Things I Would Do Differently

The 2022 double-credit incident was an architectural failure, not an implementation one. I had
specified idempotency at the API boundary and assumed it downstream, and the assumption was not
written anywhere a team could check. Roughly VND 340 million was credited incorrectly, most of it
recovered. The lesson was not about idempotency; it was that an architectural constraint which
exists only in the architect's head is not a constraint.

Separately, I spent most of 2021 pushing service decomposition faster than the platform team could
support - eleven services and one shared deployment pipeline for about five months, and the teams
paid for my enthusiasm in release friction.

## Open Source and Community

- Maintainer of a small Go library for idempotent HTTP handlers, extracted from the work above.
  About 400 stars, four external contributors, and more issues than I close promptly.
- Three talks since 2021 at Vietnam Web Summit and GDG Ho Chi Minh City, on failure modes rather
  than on architecture patterns.

## Languages

Vietnamese - native. English - working language for all technical documentation and for the
regional engineering group; comfortable presenting, occasionally imprecise in debate.

## References

Available on request.
