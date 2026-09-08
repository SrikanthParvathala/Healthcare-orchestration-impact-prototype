# Healthcare Orchestration Impact Prototype

> **Does routing patients to the right AI agent actually move outcomes?**
> A working analytics prototype that measures the lift from intelligent agent orchestration versus naive random assignment; built in response to Hippocratic AI's shift from single voice agents to coordinated *Agentic Orchestrators*.

---

## Table of Contents

- [Overview](#overview)
- [Live Demo](#live-demo)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [How It Works](#how-it-works)
- [Agent Types](#agent-types)
- [Key Metrics](#key-metrics)
- [Dashboard Features](#dashboard-features)
- [Methodology & Caveats](#methodology--caveats)
- [Tech Stack](#tech-stack)
- [Design System](#design-system)
- [Author](#author)

---

## Overview

In 2026, Hippocratic AI moved from selling individual voice agents to selling **Agentic Orchestrators**, coordinated teams of AI agents designed to move whole-population outcomes like 30-day readmission rates, HEDIS measures, and CMS Star Ratings. That's a much bigger claim than "the agent completed the call," and it raises a specific data question:

> **How do you measure whether the coordination layer is actually earning its keep?**

This prototype answers that question with a fully client-side synthetic cohort simulation that compares:

- **Naive policy** — assign any available agent at random
- **Orchestrated policy** — route each patient to the agent matched to their risk profile and readmission history

Same patients. Same noise. Two strategies. Measurable lift.

---

## Live Demo

| Artifact | URL | Description |
|---|---|---|
| **Pitch page** | [hippocratic-orchestration-pitch.html](https://srikanthparvathala.github.io/Healthcare-orchestration-impact-prototype/hippocratic-orchestration.html) | Full narrative page with embedded live dashboard |
| **React dashboard** | [Prototype](https://srikanthparvathala.github.io/Healthcare-orchestration-impact-prototype/Srikanth/DataOrchestration/Prototype/) | Standalone Vite + React dashboard app |

> All computation is **client-side only** — no server, no database, no real patient records.

---

## Project Structure

```
Healthcare-orchestration-impact-prototype/
│
├── hippocratic-orchestration.html         # Self-contained page with embedded dashboard
│                                          # Dark/light mode toggle, LinkedIn profile, methodology
│
├── orchestration-impact-dashboard.jsx     # Original JSX prototype (source reference)
│
├── src/
│   ├── OrchestrationImpactDashboard.jsx   # Enhanced React dashboard component
│   ├── main.jsx                           # React app entry point
│   └── index.css                          # Global styles & CSS reset
│
├── index.html                             # Vite HTML entry point (Google Fonts, favicon)
├── vite.config.js                         # Vite config — base path /Srikanth/DataOrchestration/Prototype/
├── package.json                           # Dependencies: React, Recharts, Lucide, Vite
├── package-lock.json
├── .gitignore
└── README.md
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+ (project uses v24 via nvm)
- npm v9+

### 1. Clone the repo

```bash
git clone https://github.com/SrikanthParvathala/Healthcare-orchestration-impact-prototype.git
cd Healthcare-orchestration-impact-prototype
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run the React dashboard (Vite dev server)

```bash
npm run dev
```

Open: **http://localhost:3000/Srikanth/DataOrchestration/Prototype/**

### 4. Serve the standalone pitch page

```bash
npx serve . --listen 4000
```

Open: **http://localhost:4000/hippocratic-orchestration.html**

### Deployed (GitHub Pages)

The site is automatically built and deployed on every push to `main`:

| Page | Public URL |
|---|---|
| **Pitch page** | https://srikanthparvathala.github.io/Healthcare-orchestration-impact-prototype/hippocratic-orchestration.html |
| **React dashboard** | https://srikanthparvathala.github.io/Healthcare-orchestration-impact-prototype/Srikanth/DataOrchestration/Prototype/ |

---

## How It Works

The simulation runs entirely in the browser using a seeded pseudo-random number generator (mulberry32), so every cohort is **reproducible** by seed and **refreshable** on demand.

### Step 1 — Generate the synthetic cohort

Each patient is assigned:

| Attribute | Distribution |
|---|---|
| Risk score | Gaussian (μ=0.42, σ=0.22), clamped [0.02, 0.98] |
| Risk tier | Low / Medium / High based on score thresholds |
| Age | Gaussian (μ=66, σ=13), clamped [24, 96] |
| Prior readmission | Bernoulli, probability = `riskScore × 0.32` |
| Contact channel | Uniform over {Call, Text, App} |
| Comorbidity count | Gaussian scaled by risk score |

### Step 2 — Run two outreach policies

Every patient is independently evaluated under **both** policies:

```
Naive policy:        naiveAgent        = random pick from {rapid, nurse, chronic, frontdoor}
Orchestrated policy: orchestratedAgent = bestAgentFor(riskTier, priorReadmit)
```

Where `bestAgentFor` implements:

```
High risk + prior readmit  →  AI Rapid Response
High risk, no readmit      →  Nurse Co-Pilot
Medium risk                →  AI Chronic Care Management
Low risk                   →  AI Front Door
```

### Step 3 — Compute outcomes

For each patient × policy combination, three outcomes are derived:

| Outcome | Formula |
|---|---|
| **Engagement success probability** | `0.45 + match×0.35 + noise` where `match=1` if agent is correct, `0.3` otherwise |
| **Hours to engagement** | `60 − match×35 + noise` |
| **30-day readmission probability** | `baseReadmit × (1 − 0.45 × engagementSuccess)` |

`match` is the key lever — a correctly routed patient gets a `1.0` multiplier; a misrouted patient gets `0.3`.

### Step 4 — Aggregate and visualize

Outcomes are averaged across the cohort and broken down by:
- Risk tier (Low / Medium / High)
- Contact channel (Call / Text / App)
- Agent type distribution (Naive vs. Orchestrated)

---

## Agent Types

| Agent Key | Name | Intended Population |
|---|---|---|
| `rapid` | AI Rapid Response | High-risk patients with prior readmission |
| `nurse` | Nurse Co-Pilot | High-risk patients without prior readmission |
| `chronic` | AI Chronic Care Management | Medium-risk patients with ongoing conditions |
| `frontdoor` | AI Front Door | Low-risk, stable patients |

---

## Key Metrics

| Metric | Direction | Interpretation |
|---|---|---|
| **30-day readmission rate** | Lower is better | Expected probability of readmission within 30 days |
| **Engagement resolution rate** | Higher is better | Share of patients who complete the intended interaction |
| **Avg. time to engagement** | Lower is better | Hours from first outreach attempt to resolved contact |

---

## Dashboard Features

### React Dashboard (`src/OrchestrationImpactDashboard.jsx`)

- **Sticky nav bar** with Healthcare AI branding
- **Cohort controls** — slider (200–2,000 patients), regenerate button, seed display
- **Cohort stat strip** — live counts by risk tier and prior readmit rate
- **3 KPI cards** — Naive vs. Orchestrated with % improvement badges and accent color bars
- **4 charts** in a responsive 2×2 grid:
  - Readmission rate by risk tier
  - Engagement resolution by risk tier
  - Time to engagement by contact channel
  - Agent assignment distribution (naive vs. orchestrated)
- **Paginated patient table** — zebra striping, hover highlight, risk tier badges, "Load 20 more"
- **Methodology section** — 2×2 card grid with honest caveats about synthetic data

### Main Page (`hippocratic-orchestration-pitch.html`)

- Self-contained single HTML file — **zero build step required**, open directly in a browser
- **Dark / Light mode toggle** in the nav bar with `localStorage` persistence
- **Embedded live dashboard** rendered via vanilla JS + SVG (no external dependencies)
- Tab navigation: Overview · Risk Tiers · Channels · Agent Mix · Patient Records
- Narrative sections: Problem → Prototype → What I Built → How It Works → Why Me → Contact
- LinkedIn profile photo in contact avatar (via `unavatar.io`, falls back to initials)
- All colors and font colors adapt correctly between dark and light mode via CSS custom properties

---

## Methodology & Caveats

> **Every patient is synthetic.** No real health system, payer, or Hippocratic AI data is used anywhere in this project.

The prototype is designed to demonstrate an **analytical approach** to measuring orchestration lift, not to claim a specific number. Key limitations:

1. **Synthetic distributions** — Risk scores, ages, and comorbidities are drawn from Gaussian distributions, not from clinical data.
2. **Simplified routing rules** — The orchestration policy is a deterministic rule engine (risk tier + readmission flag). A real system would use a multi-factor model with uncertainty quantification.
3. **Outcome formulas reward match** — Engagement and readmission outcomes are computed from formulas that explicitly reward correct routing. A real study would need observed outcomes and a validated causal or uplift model.
4. **Point estimates only** — No confidence intervals are reported. A production version would need bootstrap CIs or Bayesian posterior intervals.
5. **Client-side only** — All computation is deterministic given the seed. Regenerating draws a fresh synthetic population and recomputes every chart.

A real version of this dashboard would replace these formulas with:
- Actual observed outcomes from historical outreach campaigns
- A properly validated propensity score or uplift model
- Confidence intervals reported alongside point estimates
- Data quality checks and lineage tracking on the underlying patient records

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [React 18](https://react.dev/) + [Vite 5](https://vitejs.dev/) |
| **Charts** | [Recharts 2](https://recharts.org/) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Fonts** | Inter · Space Grotesk · IBM Plex Mono (Google Fonts) |
| **Styling** | Vanilla CSS with custom properties (no Tailwind, no CSS-in-JS) |
| **RNG** | mulberry32 seeded PRNG — reproducible and fast |
| **Pitch page** | Vanilla HTML/CSS/JS — zero dependencies, zero build step |

---

## Design System

The project uses a consistent set of CSS custom properties across both artifacts, swapped by a `data-theme` attribute on `<html>`:

| Token | Dark | Light | Role |
|---|---|---|---|
| `--bg` | `#0D1117` | `#F7F8FA` | Page background |
| `--bg-raised` | `#141B24` | `#FFFFFF` | Card surfaces |
| `--ink` | `#E8ECF1` | `#1B2430` | Body text |
| `--ink-strong` | `#FFFFFF` | `#0D1117` | Headings, names |
| `--muted` | `#8B95A3` | `#5B6472` | Secondary text |
| `--subtle` | `#5f6b7a` | `#7a8490` | Placeholder / editable text |
| `--teal` | `#2FB99A` | `#1A8A70` | Primary accent (orchestrated policy) |
| `--amber` | `#D3924C` | `#9A6020` | Secondary accent (naive policy) |
| `--line` | `#232B36` | `#DCE0E5` | Borders and dividers |

---

## Author

**Srikanth Parvathala**
Lead Data Analyst · Wyoming Department of Health
Cloud modernization · Data infrastructure · Agentic AI

- 📧 [srikanth.parvathala7@gmail.com](mailto:srikanth.parvathala7@gmail.com)
- 💼 [LinkedIn — Srikanth Parvathala](https://www.linkedin.com/in/srikanthparvathala)
- 🐙 [GitHub — SrikanthParvathala](https://github.com/SrikanthParvathala)

---

> *"We're not just building agents anymore. We're building orchestrations of multiple agents, all to solve problems at health systems, at payers and at pharma companies."*
>
> — Munjal Shah, CEO & Co-founder, Hippocratic AI

---

*Build the thing that proves the point, rather than describing why it would work.*
