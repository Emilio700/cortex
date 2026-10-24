# AI Rules Framework

> **Enterprise-Grade Behavioral Framework for AI Assistants**
>
> Version: 1.0.0 | Date: 2026-08-01

---

## Overview

This framework defines the complete operational ruleset for a professional AI assistant operating at the level of a multi-disciplinary engineering team. It is designed to be **modular, maintainable, and evolvable** — each module has a specific purpose, clear boundaries, and explicit dependencies.

The framework was evolved from `DeepSeek-Ultimate-Rules.md` through systematic analysis, gap identification, and expansion into a comprehensive system.

---

## Philosophy

The framework is built on the principle that an AI assistant should operate not as a Q&A machine, but as a **Professional AI Consultant** — analyzing from multiple perspectives (CTO, Architect, Security Engineer, Developer, QA, and more), delivering the best possible solution for every problem, and continuously improving.

---

## Structure

```
AI-Rules/
│
├── README.md                          ← You are here
├── EVOLUTION_REPORT.md                ← Evolution audit & analysis
│
├── 00-Core/                           ← Identity, beliefs, purpose
│   ├── Identity.md                    ← Who the AI is
│   ├── Philosophy.md                  ← Core beliefs & principles
│   └── Mission.md                     ← Operational purpose & success criteria
│
├── 01-Reasoning/                      ← How to think
│   ├── CriticalThinking.md            ← Analysis & assumption detection
│   ├── DecisionMaking.md              ← Structured decision framework
│   ├── Verification.md                ← Fact validation & hallucination prevention
│   └── SelfReflection.md              ← Metacognition & self-correction
│
├── 02-Engineering/                    ← How to build
│   ├── CodingStandards.md             ← Universal code quality rules
│   ├── Architecture.md                ← System design principles
│   ├── Testing.md                     ← Test strategy & quality
│   ├── Documentation.md               ← What, when & how to document
│   └── APIs.md                        ← REST, internal, and library API design
│
├── 03-Security/                       ← How to protect
│   ├── SecurityFoundations.md         ← Core security principles & evaluation
│   ├── ThreatModeling.md              ← STRIDE & systematic threat analysis
│   └── SecretsManagement.md           ← Credential lifecycle management
│
├── 04-Performance/                    ← How to optimize
│   ├── Optimization.md                ← Measure-first optimization protocol
│   ├── Scalability.md                 ← Scaling strategies & capacity planning
│   └── CostEfficiency.md              ← Economic dimensions of technical decisions
│
├── 05-Communication/                  ← How to deliver
│   ├── OutputFormat.md                ← Response templates for all interaction types
│   ├── WritingStyle.md                ← Voice, clarity, and anti-patterns
│   └── TechnicalClarity.md            ← Precision, scope, and actionability
│
├── 06-Context/                        ← How to stay coherent
│   ├── MentalModel.md                 ← Building & maintaining project understanding
│   └── LongTermConsistency.md         ← Consistency across sessions & decisions
│
├── 07-Quality/                        ← How to ensure excellence
│   ├── SelfAudit.md                   ← Pre-delivery review protocol
│   ├── ContinuousImprovement.md       ← Learning & adaptation cycle
│   └── QualityGates.md                ← Pass/fail criteria for every response
│
└── 08-Innovation/                     ← How to go beyond
    ├── Creativity.md                   ← Creative problem-solving techniques
    └── ProactiveGuidance.md            ← When & how to propose beyond the ask
```

---

## Module Dependency Graph

```
00-Core (Identity, Philosophy, Mission)
  │
  ├──→ 01-Reasoning (CriticalThinking, DecisionMaking, Verification, SelfReflection)
  │      │
  │      └──→ 07-Quality (SelfAudit, ContinuousImprovement, QualityGates)
  │
  ├──→ 02-Engineering (CodingStandards, Architecture, Testing, Documentation, APIs)
  │      │
  │      ├──→ 03-Security (SecurityFoundations, ThreatModeling, SecretsManagement)
  │      ├──→ 04-Performance (Optimization, Scalability, CostEfficiency)
  │      └──→ 05-Communication (OutputFormat, WritingStyle, TechnicalClarity)
  │
  ├──→ 06-Context (MentalModel, LongTermConsistency)
  │
  └──→ 08-Innovation (Creativity, ProactiveGuidance)
```

---

## How to Use This Framework

### For AI Systems
Load the relevant modules based on the task:

| Task Type | Core Modules | Additional |
|---|---|---|
| Code implementation | 00 + 01 + 02 + 07 | 03 if security-sensitive |
| Architecture design | 00 + 01 + 02-Architecture + 07 | 04-Scalability, 03 |
| Code review | 00 + 01 + 02-CodingStandards + 03 | 04-Optimization |
| Debugging | 00 + 01-CriticalThinking + 01-Verification | 02 |
| Technology selection | 00 + 01-DecisionMaking + 04 | 03, 08 |

### For Humans
- **New team members**: Start with `00-Core` to understand the philosophy.
- **Developers**: Focus on `02-Engineering` and `03-Security`.
- **Architects**: `02-Architecture`, `01-Reasoning`, `04-Performance`.
- **Tech leads**: All modules, with emphasis on `00-Core` and `07-Quality`.

---

## Key Design Decisions

1. **Modular over monolithic**: Each concern lives in its own file with clear ownership.
2. **Explicit dependencies**: Every module declares what it depends on and what depends on it.
3. **Priority levels**: Critical > High > Medium. Critical rules are non-negotiable.
4. **Versioned**: Each module has its own version history for independent evolution.
5. **Practical over theoretical**: Every rule has concrete application guidance and examples.
6. **Cross-referenced**: Modules link to related modules for coherent navigation.

---

## Maintenance

This framework is a living document. The `07-Quality/ContinuousImprovement.md` module defines the process for evolving it. All proposed changes should be reviewed against:

- Does it add clarity or just complexity?
- Does it duplicate existing rules?
- Does it conflict with any existing module?
- Is it actionable (not just aspirational)?

---

## Original Source

Evolved from `docs/rules/DeepSeek-Ultimate-Rules.md` (v1.0, authored by the GEMS project).
