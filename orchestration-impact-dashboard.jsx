import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { RefreshCw, Info, ChevronDown, ChevronUp } from "lucide-react";

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
const COLORS = {
  bg: "#F6F5F1",
  surface: "#FFFFFF",
  ink: "#1B2430",
  muted: "#5B6472",
  line: "#DCE0E5",
  navy: "#12233B",
  teal: "#1F8A70",
  amber: "#B8752B",
  tealSoft: "#E4F2EE",
  amberSoft: "#F5EADD",
};

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) so a given cohort is reproducible, and a fresh
// "Regenerate cohort" click gives a genuinely new synthetic population.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng, mean, sd) {
  const u1 = Math.max(rng(), 1e-6);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * sd;
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

const AGENTS = {
  rapid: "AI Rapid Response",
  nurse: "Nurse Co-Pilot",
  chronic: "AI Chronic Care Management",
  frontdoor: "AI Front Door",
};

const CHANNELS = ["Call", "Text", "App"];

function riskTierOf(riskScore) {
  if (riskScore >= 0.66) return "High";
  if (riskScore >= 0.33) return "Medium";
  return "Low";
}

function bestAgentFor(patient) {
  if (patient.riskTier === "High") {
    return patient.priorReadmit ? "rapid" : "nurse";
  }
  if (patient.riskTier === "Medium") return "chronic";
  return "frontdoor";
}

// ---------------------------------------------------------------------------
// Synthetic cohort generation
// ---------------------------------------------------------------------------
function generateCohort(n, seed) {
  const rng = mulberry32(seed);
  const agentIds = Object.keys(AGENTS);
  const patients = [];

  for (let i = 0; i < n; i++) {
    const riskScore = clamp(gaussian(rng, 0.42, 0.22), 0.02, 0.98);
    const riskTier = riskTierOf(riskScore);
    const priorReadmit = rng() < riskScore * 0.32;
    const age = Math.round(clamp(gaussian(rng, 66, 13), 24, 96));
    const channel = CHANNELS[Math.floor(rng() * CHANNELS.length)];
    const comorbidities = Math.max(
      0,
      Math.round(gaussian(rng, riskScore * 3.2, 1.1))
    );

    const naiveAgent = agentIds[Math.floor(rng() * agentIds.length)];
    const orchestratedAgent = bestAgentFor({ riskTier, priorReadmit });

    const outcomesFor = (agentId) => {
      const match = agentId === orchestratedAgent ? 1 : 0.3;
      const engagementSuccessProb = clamp(
        0.45 + match * 0.35 + gaussian(rng, 0, 0.05),
        0.05,
        0.97
      );
      const hoursToEngage = clamp(
        60 - match * 35 + gaussian(rng, 0, 8),
        2,
        120
      );
      const baseReadmitProb = clamp(0.1 + riskScore * 0.35, 0.02, 0.6);
      const readmitProb = clamp(
        baseReadmitProb * (1 - 0.45 * engagementSuccessProb),
        0.01,
        0.6
      );
      return { engagementSuccessProb, hoursToEngage, readmitProb };
    };

    patients.push({
      id: i + 1,
      age,
      riskScore,
      riskTier,
      priorReadmit,
      channel,
      comorbidities,
      naiveAgent,
      orchestratedAgent,
      naive: outcomesFor(naiveAgent),
      orchestrated: outcomesFor(orchestratedAgent),
    });
  }
  return patients;
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------
function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function overallKpis(patients) {
  return {
    readmit: {
      naive: mean(patients.map((p) => p.naive.readmitProb)),
      orchestrated: mean(patients.map((p) => p.orchestrated.readmitProb)),
    },
    resolution: {
      naive: mean(patients.map((p) => p.naive.engagementSuccessProb)),
      orchestrated: mean(
        patients.map((p) => p.orchestrated.engagementSuccessProb)
      ),
    },
    hours: {
      naive: mean(patients.map((p) => p.naive.hoursToEngage)),
      orchestrated: mean(patients.map((p) => p.orchestrated.hoursToEngage)),
    },
  };
}

function byGroup(patients, keyFn, metricFn) {
  const groups = {};
  patients.forEach((p) => {
    const k = keyFn(p);
    if (!groups[k]) groups[k] = { naive: [], orchestrated: [] };
    groups[k].naive.push(metricFn(p, "naive"));
    groups[k].orchestrated.push(metricFn(p, "orchestrated"));
  });
  return Object.entries(groups).map(([k, v]) => ({
    group: k,
    Naive: Number((mean(v.naive) * (v.scale || 1)).toFixed(3)),
    Orchestrated: Number((mean(v.orchestrated) * (v.scale || 1)).toFixed(3)),
  }));
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------
function KpiCard({ label, naive, orchestrated, formatter, better }) {
  const delta = orchestrated - naive;
  const improved = better === "lower" ? delta < 0 : delta > 0;
  const pctChange = Math.abs((delta / naive) * 100).toFixed(0);
  const deltaLabel =
    better === "lower"
      ? `${pctChange}% lower under orchestration`
      : `${pctChange}% higher under orchestration`;

  return (
    <div
      style={{
        border: `1px solid ${COLORS.line}`,
        background: COLORS.surface,
        padding: "18px 20px",
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: COLORS.muted,
          marginBottom: 12,
          fontFamily: "Inter, sans-serif",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
        <div>
          <div
            style={{
              fontSize: 11,
              color: COLORS.amber,
              fontFamily: "Inter, sans-serif",
              marginBottom: 2,
            }}
          >
            Naive assignment
          </div>
          <div
            style={{
              fontFamily: "IBM Plex Mono, monospace",
              fontSize: 26,
              color: COLORS.ink,
            }}
          >
            {formatter(naive)}
          </div>
        </div>
        <div style={{ color: COLORS.line, fontSize: 20 }}>→</div>
        <div>
          <div
            style={{
              fontSize: 11,
              color: COLORS.teal,
              fontFamily: "Inter, sans-serif",
              marginBottom: 2,
            }}
          >
            Orchestrated
          </div>
          <div
            style={{
              fontFamily: "IBM Plex Mono, monospace",
              fontSize: 26,
              color: COLORS.ink,
            }}
          >
            {formatter(orchestrated)}
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: 12,
          fontSize: 12,
          fontFamily: "Inter, sans-serif",
          color: improved ? COLORS.teal : COLORS.amber,
        }}
      >
        {deltaLabel}
      </div>
    </div>
  );
}

function GroupedBarChart({ data, title, valueSuffix, subtitle }) {
  return (
    <div
      style={{
        border: `1px solid ${COLORS.line}`,
        background: COLORS.surface,
        borderRadius: 6,
        padding: "20px 20px 8px 20px",
      }}
    >
      <div
        style={{
          fontFamily: "Space Grotesk, sans-serif",
          fontSize: 16,
          color: COLORS.ink,
          marginBottom: 2,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 12.5,
          color: COLORS.muted,
          marginBottom: 14,
        }}
      >
        {subtitle}
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={COLORS.line} vertical={false} />
          <XAxis
            dataKey="group"
            tick={{ fontSize: 12, fill: COLORS.muted, fontFamily: "Inter, sans-serif" }}
            axisLine={{ stroke: COLORS.line }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: COLORS.muted, fontFamily: "Inter, sans-serif" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) =>
              valueSuffix === "%" ? `${(v * 100).toFixed(0)}%` : v
            }
          />
          <Tooltip
            formatter={(v) =>
              valueSuffix === "%" ? pct(v) : `${v.toFixed(1)} hrs`
            }
            contentStyle={{
              border: `1px solid ${COLORS.line}`,
              borderRadius: 4,
              fontFamily: "Inter, sans-serif",
              fontSize: 12.5,
            }}
          />
          <Legend
            wrapperStyle={{ fontFamily: "Inter, sans-serif", fontSize: 12.5 }}
          />
          <Bar dataKey="Naive" fill={COLORS.amber} radius={[2, 2, 0, 0]} />
          <Bar
            dataKey="Orchestrated"
            fill={COLORS.teal}
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function OrchestrationImpactDashboard() {
  const [n, setN] = useState(800);
  const [seed, setSeed] = useState(7);
  const [showMethod, setShowMethod] = useState(false);
  const [showTable, setShowTable] = useState(false);

  const patients = useMemo(() => generateCohort(n, seed), [n, seed]);
  const kpis = useMemo(() => overallKpis(patients), [patients]);

  const readmitByTier = useMemo(
    () =>
      byGroup(
        patients.sort((a, b) => a.riskScore - b.riskScore),
        (p) => p.riskTier,
        (p, k) => p[k].readmitProb
      ).sort((a, b) =>
        ["Low", "Medium", "High"].indexOf(a.group) -
        ["Low", "Medium", "High"].indexOf(b.group)
      ),
    [patients]
  );

  const resolutionByTier = useMemo(
    () =>
      byGroup(
        patients,
        (p) => p.riskTier,
        (p, k) => p[k].engagementSuccessProb
      ).sort(
        (a, b) =>
          ["Low", "Medium", "High"].indexOf(a.group) -
          ["Low", "Medium", "High"].indexOf(b.group)
      ),
    [patients]
  );

  const hoursByChannel = useMemo(
    () =>
      byGroup(
        patients,
        (p) => p.channel,
        (p, k) => p[k].hoursToEngage
      ),
    [patients]
  );

  return (
    <div
      style={{
        background: COLORS.bg,
        minHeight: "100%",
        padding: "28px 28px 40px",
        fontFamily: "Inter, sans-serif",
        color: COLORS.ink,
      }}
    >
      {/* Header */}
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 6,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "Space Grotesk, sans-serif",
                fontSize: 26,
                color: COLORS.navy,
                letterSpacing: "-0.01em",
              }}
            >
              Orchestration impact dashboard
            </div>
            <div
              style={{
                fontSize: 13.5,
                color: COLORS.muted,
                marginTop: 6,
                maxWidth: 640,
                lineHeight: 1.5,
              }}
            >
              A synthetic cohort walking through two outreach policies;
              assigning any available agent at random, versus routing each
              patient to the agent suited to their risk profile. Same
              patients, same noise, two orchestration strategies.
            </div>
          </div>
          <div
            style={{
              border: `1px solid ${COLORS.line}`,
              borderRadius: 6,
              padding: "10px 14px",
              fontSize: 12,
              color: COLORS.muted,
              maxWidth: 260,
              lineHeight: 1.5,
              background: COLORS.surface,
            }}
          >
            "We're not just building agents anymore. We're building
            orchestrations of multiple agents." — Munjal Shah, CEO
          </div>
        </div>

        {/* Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
            border: `1px solid ${COLORS.line}`,
            background: COLORS.surface,
            borderRadius: 6,
            padding: "14px 18px",
            marginTop: 20,
            marginBottom: 22,
          }}
        >
          <label style={{ fontSize: 12.5, color: COLORS.muted, display: "flex", alignItems: "center", gap: 10 }}>
            Cohort size: <strong style={{ color: COLORS.ink }}>{n}</strong>
            <input
              type="range"
              min={200}
              max={2000}
              step={100}
              value={n}
              onChange={(e) => setN(Number(e.target.value))}
              style={{ width: 160 }}
            />
          </label>
          <button
            onClick={() => setSeed((s) => s + 1)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: COLORS.navy,
              color: "#fff",
              border: "none",
              borderRadius: 5,
              padding: "8px 14px",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "Inter, sans-serif",
            }}
          >
            <RefreshCw size={14} /> Regenerate cohort
          </button>
          <span style={{ fontSize: 12, color: COLORS.muted }}>
            Seed #{seed} · {n} synthetic patients, no real records
          </span>
        </div>

        {/* KPI row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
            marginBottom: 22,
          }}
        >
          <KpiCard
            label="30-day readmission rate"
            naive={kpis.readmit.naive}
            orchestrated={kpis.readmit.orchestrated}
            formatter={pct}
            better="lower"
          />
          <KpiCard
            label="Engagement resolution rate"
            naive={kpis.resolution.naive}
            orchestrated={kpis.resolution.orchestrated}
            formatter={pct}
            better="higher"
          />
          <KpiCard
            label="Avg. time to engagement"
            naive={kpis.hours.naive}
            orchestrated={kpis.hours.orchestrated}
            formatter={(x) => `${x.toFixed(1)}h`}
            better="lower"
          />
        </div>

        {/* Charts */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <GroupedBarChart
            data={readmitByTier}
            title="Readmission rate by risk tier"
            subtitle="The headline number: does routing to a better-fit agent lower expected readmission risk within each tier?"
            valueSuffix="%"
          />
          <GroupedBarChart
            data={resolutionByTier}
            title="Engagement resolution by risk tier"
            subtitle="Share of patients who respond and complete the intended interaction, by risk tier."
            valueSuffix="%"
          />
          <GroupedBarChart
            data={hoursByChannel}
            title="Time to engagement by contact channel"
            subtitle="Hours from first outreach attempt to a resolved contact, by the patient's preferred channel."
            valueSuffix="h"
          />
        </div>

        {/* Sample table */}
        <div
          style={{
            marginTop: 20,
            border: `1px solid ${COLORS.line}`,
            borderRadius: 6,
            background: COLORS.surface,
          }}
        >
          <button
            onClick={() => setShowTable((s) => !s)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 18px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "Space Grotesk, sans-serif",
              fontSize: 15,
              color: COLORS.ink,
            }}
          >
            Sample patient records (first 8 of {n})
            {showTable ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showTable && (
            <div style={{ overflowX: "auto", padding: "0 18px 18px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: COLORS.muted, textAlign: "left" }}>
                    {[
                      "ID",
                      "Age",
                      "Risk tier",
                      "Prior readmit",
                      "Channel",
                      "Naive agent",
                      "Orchestrated agent",
                      "Readmit prob (naive → orch.)",
                    ].map((h) => (
                      <th key={h} style={{ padding: "6px 8px", borderBottom: `1px solid ${COLORS.line}`, fontWeight: 500 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {patients.slice(0, 8).map((p) => (
                    <tr key={p.id}>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${COLORS.line}` }}>{p.id}</td>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${COLORS.line}` }}>{p.age}</td>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${COLORS.line}` }}>{p.riskTier}</td>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${COLORS.line}` }}>{p.priorReadmit ? "Yes" : "No"}</td>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${COLORS.line}` }}>{p.channel}</td>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${COLORS.line}` }}>{AGENTS[p.naiveAgent]}</td>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${COLORS.line}` }}>{AGENTS[p.orchestratedAgent]}</td>
                      <td style={{ padding: "6px 8px", borderBottom: `1px solid ${COLORS.line}`, fontFamily: "IBM Plex Mono, monospace" }}>
                        {pct(p.naive.readmitProb)} → {pct(p.orchestrated.readmitProb)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Methodology */}
        <div
          style={{
            marginTop: 14,
            border: `1px solid ${COLORS.line}`,
            borderRadius: 6,
            background: COLORS.surface,
          }}
        >
          <button
            onClick={() => setShowMethod((s) => !s)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 18px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "Space Grotesk, sans-serif",
              fontSize: 15,
              color: COLORS.ink,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Info size={15} /> Methodology and caveats
            </span>
            {showMethod ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showMethod && (
            <div
              style={{
                padding: "0 18px 18px",
                fontSize: 13,
                color: COLORS.muted,
                lineHeight: 1.7,
              }}
            >
              <p>
                Every patient here is synthetic: risk score, age, comorbidity
                count, prior-readmission flag, and channel preference are
                drawn from distributions I chose, not from any real health
                system, payer, or Hippocratic AI data. The point of this
                prototype is to demonstrate an analytical approach to
                measuring orchestration lift, not to claim a specific number.
              </p>
              <p>
                Each patient is run through <strong>two</strong> outreach
                policies using the same underlying profile: a{" "}
                <em>naive</em> policy that assigns one of four agent types at
                random, and an <em>orchestrated</em> policy that routes each
                patient to the agent type matched to their risk tier and
                readmission history; a simplified stand-in for a
                supervising coordination layer.
              </p>
              <p>
                Engagement success, time-to-engagement, and readmission
                probability are all generated from simple formulas that
                reward a good agent-patient match and add random noise. A
                real version of this dashboard would replace these formulas
                with actual observed outcomes and a properly validated
                propensity or uplift model, and would report confidence
                intervals rather than single point estimates — this
                prototype reports expected values across the cohort to keep
                the demonstration legible.
              </p>
              <p style={{ marginBottom: 0 }}>
                Everything on this page is computed client-side in your
                browser from the seed shown above; regenerating the cohort
                draws a fresh synthetic population and recomputes every
                chart.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
