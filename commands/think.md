---
description: Full intelligence pipeline — THINK (AGoT reasoning DAG) → RELATE (Palantir entity graph) → SUGGEST (DARPA KAIROS hypotheses) → EXECUTE (A2P causal plan) → PRESENT (IC Analytic Standards report with BLUF)
argument-hint: "[question or situation to reason about]"
---

# /think — Palantir-Grade Intelligence Pipeline

Run the full 5-phase intelligence pipeline on any question, threat, situation, or problem.

**Phases:**
1. **THINK** — Adaptive Graph of Thoughts (AGoT): recursive reasoning DAG, only expands uncertain nodes (+46.2% GPQA)
2. **RELATE** — i2 ELP methodology: extract entities, link them, run Palantir-style "search around" BFS to surface indirect connections
3. **SUGGEST** — DARPA KAIROS schema-matching + abductive inference: ranked hypotheses with evidence chains and predicted indicators
4. **EXECUTE** — A2P causal planning: Abduct hidden factors → Act with minimal interventions → Predict counterfactual trajectories
5. **PRESENT** — IC Analytic Standards: BLUF + key judgments with confidence levels + evidence chains + full markdown report

**Output:**
- Bottom Line Up Front (BLUF) — one-sentence answer
- Key judgments with HIGH/MEDIUM/LOW confidence
- Evidence chains with source attribution
- Ranked hypotheses with predicted indicators
- Causal intervention plan with failure modes
- Full intelligence report in markdown

**Usage:**
```
/think Is our university network compromised?
/think What is causing the spike in failed authentication attempts?
/think Should we deploy the new authentication system before finals week?
/think Analyze the relationship between these threat actors
```

**When to use:**
- Complex security situations requiring multi-hop reasoning
- Threat analysis requiring entity relationship mapping
- Any question where you need structured, defensible reasoning
- Before making high-stakes architectural or security decisions
- When you need IC-grade confidence levels on conclusions

**Knowledge Graph integration:**
- Entities extracted are stored in the persistent ontology (searchable with `/swarm`)
- Facts added to HippoRAG 2 knowledge graph for future retrieval
- Temporal events logged for trend analysis and anomaly detection
- Causal chains stored for counterfactual reasoning
