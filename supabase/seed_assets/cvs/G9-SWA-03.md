---
cv_id: G9-SWA-03
group_id: 9
group_name: "Architecture"
subgroup: Software Architect
target_role: Software Architect (connected products / IoT platform)
candidate_name: Ly Quoc Bao
seniority: senior
years_experience: 11
quality_profile: cross_domain
cross_domain_tags: [embedded-iot, hardware-systems, devops-infrastructure]
language: en
source: synthetic_llm
---

# Ly Quoc Bao

Thu Duc, Ho Chi Minh City | +84 907 228 561 | bao.lyquoc@gmail.com
github.com/baolq-embedded

## About

Software architect for connected products - the whole path from a microcontroller to a cloud
service and back down again. Eight and a half of my eleven years were firmware, including four
under ISO 26262 in automotive, and I moved up to platform architecture in 2022. That history is
why I am useful on this class of system and why this CV will read to most reviewers as an
embedded engineer's. Both readings are defensible.

## Experience

### Software Architect, Connected Products | VinFast (software division), Ho Chi Minh City | Mar 2022 - Present

- Own the architecture spanning the in-vehicle software and the cloud services it talks to -
  telemetry ingestion, over-the-air update, remote diagnostics and the mobile app's backend.
  Around 45 engineers across embedded, backend and platform teams.
- Designed the OTA update architecture end to end: signed and staged delivery, A/B partitions on
  the target ECUs, staged rollout with automatic halt on failure rate, and the rollback path.
  This is the design I would be judged on, because a bad OTA bricks vehicles in customers' hands.
- Set the failure boundary explicitly: the vehicle must operate fully with no connectivity, and
  every cloud-dependent feature degrades to a defined local behaviour. Getting that written down
  and agreed took four months of argument and has since settled about a dozen design disputes
  without me in the room.
- Telemetry ingestion at roughly 40,000 messages per second at peak, MQTT into Kafka into a time
  series store. The interesting design constraint is not the throughput; it is that vehicles
  reconnect in bursts after a network outage and replay buffered data, so the system must absorb
  a spike of stale messages without corrupting ordering.
- Reduced average OTA payload by about 70 per cent using delta updates. Mattered because a
  meaningful share of our fleet updates over a mobile connection the owner pays for.
- Bridge two engineering cultures that do not naturally speak: firmware engineers who plan a
  release cycle in quarters and backend engineers who deploy twice a day. Most of my week is
  translation, and the interface contract between vehicle and cloud is where I spend the rest.

### Senior Embedded Software Engineer, then Embedded Architect | Bosch Global Software Technologies Vietnam, Ho Chi Minh City | Sep 2017 - Feb 2022

- AUTOSAR Classic on Infineon AURIX for a body control domain, then the software architecture
  role for that domain across a team of twelve.
- ISO 26262 up to ASIL-B at software architecture level: safety requirements decomposed onto
  architectural elements, freedom from interference argued through memory partitioning and timing
  protection, and a safety case an external assessor read. Two assessments, no major findings.
- Designed the domain's diagnostic architecture - UDS services, fault memory, and the recovery
  strategy for each fault class. Getting the fault classification right is 80 per cent of that
  work and it is a systems question, not a software one.
- MISRA C:2012 compliance, static analysis with Polyspace, and hardware-in-the-loop regression on
  a dSPACE bench.

### Firmware Engineer | Renesas Design Vietnam, Ho Chi Minh City | Jul 2014 - Aug 2017

- Peripheral drivers and low-level middleware for RH850 automotive microcontrollers - CAN, SPI,
  ADC, timers. Silicon bring-up on engineering samples, clock tree and low-power state machines.
- Where I learned that most embedded bugs are documented silicon behaviour nobody read.

## Education

### B.Eng, Electronics and Telecommunications | Ho Chi Minh City University of Technology (HCMUT) | 2010 - 2014
- GPA 8.2/10.

## Certifications

### Certified Automotive Software Engineer, Advanced Level | iSQI, 2021
### Functional Safety Engineer (ISO 26262) | TUV Rheinland, 2020
### AWS Certified Solutions Architect - Associate | 2023
### Certified Kubernetes Administrator (CKA) | 2023

## Skills

**Architecture:** system architecture spanning device and cloud, interface contract design between
teams with different release cadences, degradation and offline-first design, OTA update
architecture including staged rollout and rollback, architecture decision records, safety-driven
architecture decomposition
**Embedded and hardware-adjacent (8.5 years, still my deepest area):** C to MISRA C:2012, ARM
Cortex-M and Infineon AURIX/TriCore, AUTOSAR Classic, FreeRTOS and OSEK, CAN and CAN FD, LIN,
Automotive Ethernet, UDS diagnostics (ISO 14229), bootloaders and flash drivers, linker scripts
and memory maps, ISO 26262 to ASIL-B, board bring-up, oscilloscope and logic analyser as debugging
tools, schematic reading at the level of finding my own ground offset
**Cloud and platform:** AWS (IoT Core, Kinesis, S3, EKS), Kafka and MQTT at design depth, Go and
Python for backend services, Kubernetes to CKA level, Terraform, Prometheus and Grafana, CI/CD
pipelines for both firmware and services - the firmware side is much harder and much less
discussed
**Data:** time series storage (InfluxDB, TimescaleDB), telemetry schema design and versioning
across a fleet that cannot all update at once
**Practice:** design review across embedded and backend teams, mentoring firmware engineers into
architecture, incident review

## Where This CV Does Not Fit

Eight and a half of eleven years are firmware, two of my four certifications are automotive
safety, and my Skills section opens with MISRA C. If you are hiring a software architect for a
web platform, I am the wrong candidate and my cloud experience is three years deep against
engineers who have a decade.

What I would claim is narrower: for a product with a physical device at one end, the architecture
usually fails at the boundary between the two worlds, and I am one of the few people in either
team who has actually shipped on both sides of it. Outside that shape of problem, prefer someone
else.

I should also say that I have never worked at consumer internet scale. 40,000 messages a second
is a real number and it is not a large one.

## Languages

Vietnamese - native. English - TOEIC 900 (2021); working language for all architecture
documentation and for the German and Indian engineering sites at Bosch. German - A2, useful for
reading a supplier datasheet and nothing more.
