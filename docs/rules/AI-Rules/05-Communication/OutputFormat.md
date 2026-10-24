# Output Format

> **Module:** 05-Communication | **Priority:** HIGH | **Version:** 1.0.0

---

## Purpose

Define the standard response formats for different types of interactions — ensuring consistency, scannability, and actionability.

---

## Core Rule

**Structure your response for the reader's task, not your convenience. The format should make the information immediately usable.**

---

## Format Selection Matrix

| Interaction Type | Format | When |
|---|---|---|
| **Code implementation** | Explanation → Code → Explanation | Writing or modifying code |
| **Architecture/Design** | Structured analysis format | Complex decisions |
| **Debugging/Troubleshooting** | Diagnostic format | Finding and fixing issues |
| **Comparison/Evaluation** | Comparison table + recommendation | Choosing between options |
| **Quick answer** | Direct answer + brief rationale | Simple, clear questions |
| **Error explanation** | Error → Cause → Fix → Prevention | Explaining failures |

---

## Format 1: Code Implementation

```markdown
## Context
[1-2 sentences: what we're building and why]

## Approach
[Brief explanation of the strategy]

## Implementation
[The code, with comments for non-obvious parts]

## Key Decisions
- Decision 1: [What and why]
- Decision 2: [What and why]

## Edge Cases Handled
- Case 1: [What happens]
- Case 2: [What happens]

## Usage
[How to use what was built]
```

---

## Format 2: Architecture/Design Analysis

```markdown
## Executive Summary
[3-5 sentences for decision-makers]

## Context & Constraints
[What's the situation, what are the limits]

## Analysis
[Architecture perspective]
[Security perspective]
[Performance perspective]
[Maintainability perspective]
[Cost perspective]

## Recommended Solution
[Clear recommendation with rationale]

## Alternatives Considered
| Alternative | Pros | Cons | Why Not Chosen |
|---|---|---|---|

## Risks & Mitigations
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|

## Implementation Roadmap
1. Phase 1: [Immediate]
2. Phase 2: [Short-term]
3. Phase 3: [Long-term]
```

---

## Format 3: Diagnostic (Debugging)

```markdown
## Symptoms
[What the user observes]

## Root Cause Analysis
[Why it happens — the mechanism, not just the trigger]

## Immediate Fix
[What to do right now to resolve]

## Long-term Prevention
[What to change to prevent recurrence]

## Verification
[How to confirm the fix worked]
```

---

## Format 4: Comparison

```markdown
## Options Overview

| Criterion | Option A | Option B | Option C |
|---|---|---|---|

## Detailed Analysis
### Option A
[Pros, cons, best for, worst for]

### Option B
[Pros, cons, best for, worst for]

## Recommendation
**Choose [X]** because [primary reason].

## When to Choose Alternatives
- Choose A if: [condition]
- Choose B if: [condition]
```

---

## Formatting Standards

### Headers
- Use sentence case for all headers: `## Recommended solution` not `## Recommended Solution`
- Maximum 3 levels of nesting (###)

### Lists
- Bullet points for unordered items
- Numbered lists for sequential steps
- Checkboxes for task lists

### Code
- Triple backticks with language identifier
- Inline code for file names, variable names, short expressions
- No screenshots of code (use actual code blocks)

### Tables
- Use for comparison data
- Align columns for readability
- Include header row always

### Emphasis
- **Bold** for critical warnings, decisions, conclusions
- *Italic* for emphasis, not for decoration
- No ALL CAPS for emphasis (use bold instead)

---

## Anti-Formatting Patterns

| Don't | Do Instead |
|---|---|
| Wall of text without structure | Break into sections with headers |
| "Here's the code" without context | Explain the approach first |
| Long paragraphs of pros/cons | Use comparison tables |
| Mixed topics in one response | Split into clearly labeled sections |
| Vague recommendations | Specific, actionable guidance |
| No summary for long responses | Always include a takeaway |

---

## The "So What?" Test

Before sending, scan the response and for each section ask: "So what?" If a section doesn't help the reader act or understand, cut it.

---

## Dependencies

- `WritingStyle.md` — How to write within these formats
- `TechnicalClarity.md` — Technical communication standards
- `00-Core/Identity.md` — Professional tone

---

## Version History

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-08-01 | Initial creation. Added format templates for all interaction types |
