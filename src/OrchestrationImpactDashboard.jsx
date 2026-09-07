import React, { useMemo, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import { RefreshCw, Info, ChevronDown, ChevronUp, Activity, Users, Clock, TrendingDown, TrendingUp, Zap } from "lucide-react";

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
  navyLight: "#1d3a5f",
  teal: "#1F8A70",
  tealDark: "#166657",
  tealSoft: "#E4F2EE",
  amber: "#B8752B",
  amberDark: "#9a6022",
  amberSoft: "#F5EADD",
  red: "#C94F4F",
  redSoft: "#FAEAEA",
  purple: "#6B4FBB",
  purpleSoft: "#EEE9F7",
};

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32)
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
  chronic: "AI Chronic Care Mgmt",
  frontdoor: "AI Front Door",
};

const AGENT_COLORS = {
  rapid: COLORS.red,
  nurse: COLORS.purple,
  chronic: COLORS.amber,
  frontdoor: COLORS.teal,
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
      orchestrated: mean(patients.map((p) => p.orchestrated.engagementSuccessProb)),
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
    Naive: Number(mean(v.naive).toFixed(3)),
    Orchestrated: Number(mean(v.orchestrated).toFixed(3)),
    n: v.naive.length,
  }));
}

function agentDistribution(patients) {
  const counts = { naive: {}, orchestrated: {} };
  Object.keys(AGENTS).forEach((a) => {
    counts.naive[a] = 0;
    counts.orchestrated[a] = 0;
  });
  patients.forEach((p) => {
    counts.naive[p.naiveAgent]++;
    counts.orchestrated[p.orchestratedAgent]++;
  });
  return Object.keys(AGENTS).map((a) => ({
    agent: AGENTS[a].replace("AI ", "").replace(" Management", " Mgmt"),
    agentKey: a,
    Naive: counts.naive[a],
    Orchestrated: counts.orchestrated[a],
  }));
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

function fmt(x, decimals = 1) {
  return x.toFixed(decimals);
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------
function CustomTooltip({ active, payload, label, valueSuffix }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: COLORS.surface,
      border: `1px solid ${COLORS.line}`,
      borderRadius: 8,
      padding: "10px 14px",
      fontFamily: "Inter, sans-serif",
      fontSize: 12.5,
      boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
    }}>
      <div style={{ color: COLORS.muted, marginBottom: 6, fontWeight: 500 }}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: entry.fill || entry.color }} />
          <span style={{ color: COLORS.muted }}>{entry.name}:</span>
          <span style={{ color: COLORS.ink, fontFamily: "IBM Plex Mono, monospace", fontWeight: 500 }}>
            {valueSuffix === "%" ? pct(entry.value) : valueSuffix === "hrs" ? `${entry.value.toFixed(1)}h` : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------
function KpiCard({ label, naive, orchestrated, formatter, better, icon: Icon, description }) {
  const delta = orchestrated - naive;
  const improved = better === "lower" ? delta < 0 : delta > 0;
  const pctChange = Math.abs((delta / naive) * 100).toFixed(0);
  const sign = better === "lower" ? (delta < 0 ? "↓" : "↑") : (delta > 0 ? "↑" : "↓");

  return (
    <div style={{
      border: `1px solid ${COLORS.line}`,
      background: COLORS.surface,
      padding: "20px 22px",
      borderRadius: 10,
      position: "relative",
      overflow: "hidden",
      transition: "box-shadow 0.2s ease, transform 0.2s ease",
    }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Accent bar */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: 3,
        background: improved ? `linear-gradient(90deg, ${COLORS.teal}, ${COLORS.tealDark})` : `linear-gradient(90deg, ${COLORS.amber}, ${COLORS.amberDark})`,
      }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, marginTop: 4 }}>
        {Icon && <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: improved ? COLORS.tealSoft : COLORS.amberSoft,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={15} color={improved ? COLORS.teal : COLORS.amber} />
        </div>}
        <div style={{ fontSize: 12.5, color: COLORS.muted, fontFamily: "Inter, sans-serif", fontWeight: 500 }}>
          {label}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10.5, color: COLORS.amber, fontFamily: "Inter, sans-serif", marginBottom: 3, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Naive
          </div>
          <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 24, color: COLORS.ink, lineHeight: 1 }}>
            {formatter(naive)}
          </div>
        </div>
        <div style={{ color: COLORS.line, fontSize: 18, marginBottom: 4 }}>→</div>
        <div>
          <div style={{ fontSize: 10.5, color: COLORS.teal, fontFamily: "Inter, sans-serif", marginBottom: 3, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Orchestrated
          </div>
          <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 24, color: COLORS.ink, lineHeight: 1 }}>
            {formatter(orchestrated)}
          </div>
        </div>
      </div>

      <div style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: improved ? COLORS.tealSoft : COLORS.amberSoft,
        color: improved ? COLORS.tealDark : COLORS.amberDark,
        borderRadius: 20,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "Inter, sans-serif",
      }}>
        {sign} {pctChange}% {better === "lower" ? "reduction" : "improvement"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouped Bar Chart
// ---------------------------------------------------------------------------
function GroupedBarChart({ data, title, valueSuffix, subtitle, height = 240 }) {
  return (
    <div style={{
      border: `1px solid ${COLORS.line}`,
      background: COLORS.surface,
      borderRadius: 10,
      padding: "22px 22px 10px",
      transition: "box-shadow 0.2s ease",
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.05)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
    >
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 15, color: COLORS.ink, marginBottom: 4, fontWeight: 600 }}>
        {title}
      </div>
      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 16, lineHeight: 1.5 }}>
        {subtitle}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid stroke={COLORS.line} vertical={false} strokeDasharray="3 3" />
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
            tickFormatter={(v) => valueSuffix === "%" ? `${(v * 100).toFixed(0)}%` : v.toFixed(0)}
          />
          <Tooltip content={<CustomTooltip valueSuffix={valueSuffix} />} />
          <Legend
            wrapperStyle={{ fontFamily: "Inter, sans-serif", fontSize: 12 }}
            iconType="square"
            iconSize={10}
          />
          <Bar dataKey="Naive" fill={COLORS.amber} radius={[3, 3, 0, 0]} maxBarSize={48} />
          <Bar dataKey="Orchestrated" fill={COLORS.teal} radius={[3, 3, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Distribution Chart
// ---------------------------------------------------------------------------
function AgentDistributionChart({ data }) {
  return (
    <div style={{
      border: `1px solid ${COLORS.line}`,
      background: COLORS.surface,
      borderRadius: 10,
      padding: "22px 22px 10px",
    }}>
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 15, color: COLORS.ink, marginBottom: 4, fontWeight: 600 }}>
        Agent assignment distribution
      </div>
      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 16, lineHeight: 1.5 }}>
        How patients are routed across the four agent types under each policy.
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={COLORS.line} horizontal={false} strokeDasharray="3 3" />
          <XAxis type="number" tick={{ fontSize: 11, fill: COLORS.muted, fontFamily: "Inter, sans-serif" }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="agent"
            tick={{ fontSize: 11, fill: COLORS.muted, fontFamily: "Inter, sans-serif" }}
            axisLine={false}
            tickLine={false}
            width={110}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || !payload.length) return null;
              return (
                <div style={{
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontFamily: "Inter, sans-serif",
                  fontSize: 12.5,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                }}>
                  <div style={{ color: COLORS.muted, marginBottom: 6, fontWeight: 500 }}>{label}</div>
                  {payload.map((entry) => (
                    <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: entry.fill }} />
                      <span style={{ color: COLORS.muted }}>{entry.name}:</span>
                      <span style={{ color: COLORS.ink, fontFamily: "IBM Plex Mono, monospace", fontWeight: 500 }}>{entry.value} patients</span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontFamily: "Inter, sans-serif", fontSize: 12 }} iconType="square" iconSize={10} />
          <Bar dataKey="Naive" fill={COLORS.amber} radius={[0, 3, 3, 0]} maxBarSize={20} />
          <Bar dataKey="Orchestrated" fill={COLORS.teal} radius={[0, 3, 3, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk tier badges
// ---------------------------------------------------------------------------
function RiskBadge({ tier }) {
  const styles = {
    High: { bg: COLORS.redSoft, color: COLORS.red },
    Medium: { bg: COLORS.amberSoft, color: COLORS.amberDark },
    Low: { bg: COLORS.tealSoft, color: COLORS.tealDark },
  };
  const s = styles[tier] || styles.Low;
  return (
    <span style={{
      background: s.bg, color: s.color,
      borderRadius: 4, padding: "2px 7px",
      fontSize: 11, fontWeight: 600, fontFamily: "Inter, sans-serif",
    }}>
      {tier}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stat summary strip
// ---------------------------------------------------------------------------
function StatStrip({ patients }) {
  const tierCounts = { Low: 0, Medium: 0, High: 0 };
  patients.forEach(p => tierCounts[p.riskTier]++);
  const priorReadmitCount = patients.filter(p => p.priorReadmit).length;

  const stats = [
    { label: "Total patients", value: patients.length.toLocaleString() },
    { label: "High risk", value: tierCounts.High.toLocaleString(), color: COLORS.red },
    { label: "Medium risk", value: tierCounts.Medium.toLocaleString(), color: COLORS.amber },
    { label: "Low risk", value: tierCounts.Low.toLocaleString(), color: COLORS.teal },
    { label: "Prior readmit", value: `${((priorReadmitCount / patients.length) * 100).toFixed(0)}%`, color: COLORS.purple },
  ];

  return (
    <div style={{
      display: "flex", gap: 0,
      border: `1px solid ${COLORS.line}`,
      borderRadius: 10, overflow: "hidden",
      background: COLORS.surface,
      marginBottom: 22,
    }}>
      {stats.map((s, i) => (
        <div key={s.label} style={{
          flex: 1, padding: "14px 16px",
          borderRight: i < stats.length - 1 ? `1px solid ${COLORS.line}` : "none",
          textAlign: "center",
        }}>
          <div style={{
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: 20, fontWeight: 500,
            color: s.color || COLORS.ink,
            marginBottom: 4,
          }}>{s.value}</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {s.label}
          </div>
        </div>
      ))}
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
  const [tableRows, setTableRows] = useState(8);

  const regenerate = useCallback(() => setSeed((s) => s + 1), []);

  const patients = useMemo(() => generateCohort(n, seed), [n, seed]);
  const kpis = useMemo(() => overallKpis(patients), [patients]);

  const readmitByTier = useMemo(() =>
    byGroup(
      [...patients].sort((a, b) => a.riskScore - b.riskScore),
      (p) => p.riskTier,
      (p, k) => p[k].readmitProb
    ).sort((a, b) =>
      ["Low", "Medium", "High"].indexOf(a.group) -
      ["Low", "Medium", "High"].indexOf(b.group)
    ),
    [patients]
  );

  const resolutionByTier = useMemo(() =>
    byGroup(
      patients,
      (p) => p.riskTier,
      (p, k) => p[k].engagementSuccessProb
    ).sort((a, b) =>
      ["Low", "Medium", "High"].indexOf(a.group) -
      ["Low", "Medium", "High"].indexOf(b.group)
    ),
    [patients]
  );

  const hoursByChannel = useMemo(() =>
    byGroup(patients, (p) => p.channel, (p, k) => p[k].hoursToEngage),
    [patients]
  );

  const agentDist = useMemo(() => agentDistribution(patients), [patients]);

  return (
    <div style={{
      background: COLORS.bg,
      minHeight: "100vh",
      fontFamily: "Inter, sans-serif",
      color: COLORS.ink,
    }}>
      {/* Top nav bar */}
      <div style={{
        background: COLORS.navy,
        padding: "0 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 52,
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: COLORS.teal,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Activity size={15} color="white" />
          </div>
          <span style={{
            fontFamily: "Space Grotesk, sans-serif",
            color: "white", fontSize: 14, fontWeight: 600,
            letterSpacing: "-0.01em",
          }}>
            Healthcare AI · Orchestration Impact
          </span>
        </div>
        <div style={{
          fontFamily: "Inter, sans-serif", fontSize: 11.5,
          color: "rgba(255,255,255,0.45)",
          letterSpacing: "0.02em",
        }}>
          Prototype · Synthetic data only
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 24px 60px" }}>

        {/* Page header */}
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", flexWrap: "wrap", gap: 16,
          marginBottom: 24,
        }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <h1 style={{
              fontFamily: "Space Grotesk, sans-serif",
              fontSize: 28, color: COLORS.navy,
              letterSpacing: "-0.02em", fontWeight: 700,
              lineHeight: 1.15, marginBottom: 10,
            }}>
              Orchestration impact dashboard
            </h1>
            <p style={{
              fontSize: 14, color: COLORS.muted,
              maxWidth: 580, lineHeight: 1.65,
            }}>
              A synthetic cohort walking through two outreach policies — assigning
              any available agent at random, versus routing each patient to the
              agent best suited to their risk profile. Same patients, same noise,
              two orchestration strategies.
            </p>
          </div>
          <div style={{
            border: `1px solid rgba(31,138,112,0.2)`,
            borderRadius: 10,
            padding: "14px 18px",
            fontSize: 13,
            color: COLORS.navyLight,
            maxWidth: 280,
            lineHeight: 1.6,
            background: COLORS.tealSoft,
            fontStyle: "italic",
          }}>
            "We're not just building agents anymore. We're building
            orchestrations of multiple agents."
            <div style={{ marginTop: 6, fontSize: 12, fontStyle: "normal", color: COLORS.teal, fontWeight: 600 }}>
              — Munjal Shah, CEO
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{
          display: "flex", alignItems: "center", gap: 20,
          flexWrap: "wrap",
          border: `1px solid ${COLORS.line}`,
          background: COLORS.surface,
          borderRadius: 10,
          padding: "16px 20px",
          marginBottom: 22,
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Cohort size
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                id="cohort-size-slider"
                type="range" min={200} max={2000} step={100} value={n}
                onChange={(e) => setN(Number(e.target.value))}
                style={{ width: 160 }}
              />
              <span style={{
                fontFamily: "IBM Plex Mono, monospace",
                fontSize: 15, color: COLORS.ink, fontWeight: 500,
                minWidth: 40,
              }}>
                {n}
              </span>
            </div>
          </div>

          <div style={{ width: 1, height: 40, background: COLORS.line }} />

          <button
            id="regenerate-cohort-btn"
            onClick={regenerate}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: COLORS.navy,
              color: "#fff", border: "none",
              borderRadius: 8, padding: "9px 16px",
              fontSize: 13, cursor: "pointer",
              fontFamily: "Inter, sans-serif", fontWeight: 500,
            }}
            onMouseEnter={e => e.currentTarget.style.background = COLORS.navyLight}
            onMouseLeave={e => e.currentTarget.style.background = COLORS.navy}
          >
            <RefreshCw size={14} />
            Regenerate cohort
          </button>

          <span style={{ fontSize: 12, color: COLORS.muted, fontFamily: "Inter, sans-serif" }}>
            Seed #{seed} · {n.toLocaleString()} synthetic patients · no real records
          </span>
        </div>

        {/* Cohort summary strip */}
        <StatStrip patients={patients} />

        {/* KPI row */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14, marginBottom: 22,
        }}>
          <KpiCard
            label="30-day readmission rate"
            naive={kpis.readmit.naive}
            orchestrated={kpis.readmit.orchestrated}
            formatter={pct}
            better="lower"
            icon={TrendingDown}
            description="Expected probability of readmission within 30 days."
          />
          <KpiCard
            label="Engagement resolution rate"
            naive={kpis.resolution.naive}
            orchestrated={kpis.resolution.orchestrated}
            formatter={pct}
            better="higher"
            icon={TrendingUp}
            description="Share of patients who respond and complete the interaction."
          />
          <KpiCard
            label="Avg. time to engagement"
            naive={kpis.hours.naive}
            orchestrated={kpis.hours.orchestrated}
            formatter={(x) => `${x.toFixed(1)}h`}
            better="lower"
            icon={Clock}
            description="Hours from first outreach attempt to resolved contact."
          />
        </div>

        {/* Charts grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <GroupedBarChart
            data={readmitByTier}
            title="Readmission rate by risk tier"
            subtitle="Does routing to a better-fit agent lower expected readmission risk within each tier?"
            valueSuffix="%"
          />
          <GroupedBarChart
            data={resolutionByTier}
            title="Engagement resolution by risk tier"
            subtitle="Share of patients who respond and complete the intended interaction, by risk tier."
            valueSuffix="%"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          <GroupedBarChart
            data={hoursByChannel}
            title="Time to engagement by channel"
            subtitle="Hours from first outreach attempt to resolved contact, by preferred channel."
            valueSuffix="hrs"
          />
          <AgentDistributionChart data={agentDist} />
        </div>

        {/* Sample patient table */}
        <div style={{
          marginBottom: 12,
          border: `1px solid ${COLORS.line}`,
          borderRadius: 10,
          background: COLORS.surface,
          overflow: "hidden",
        }}>
          <button
            id="toggle-table-btn"
            onClick={() => setShowTable((s) => !s)}
            style={{
              width: "100%", display: "flex",
              justifyContent: "space-between", alignItems: "center",
              padding: "16px 20px", background: "transparent",
              border: "none", cursor: "pointer",
              fontFamily: "Space Grotesk, sans-serif",
              fontSize: 14.5, color: COLORS.ink, fontWeight: 600,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Users size={15} color={COLORS.muted} />
              Sample patient records
              <span style={{
                background: COLORS.bg, color: COLORS.muted,
                borderRadius: 20, padding: "2px 8px",
                fontSize: 11, fontWeight: 500, fontFamily: "Inter, sans-serif",
              }}>
                showing {Math.min(tableRows, n)} of {n}
              </span>
            </div>
            {showTable ? <ChevronUp size={16} color={COLORS.muted} /> : <ChevronDown size={16} color={COLORS.muted} />}
          </button>

          {showTable && (
            <div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 720 }}>
                  <thead>
                    <tr style={{
                      background: COLORS.bg,
                      borderTop: `1px solid ${COLORS.line}`,
                      borderBottom: `1px solid ${COLORS.line}`,
                    }}>
                      {["ID", "Age", "Risk tier", "Prior readmit", "Comorbidities", "Channel", "Naive agent", "Orchestrated agent", "Readmit prob (naive → orch.)"].map((h) => (
                        <th key={h} style={{
                          padding: "9px 12px", textAlign: "left",
                          fontWeight: 600, fontSize: 11,
                          color: COLORS.muted, fontFamily: "Inter, sans-serif",
                          textTransform: "uppercase", letterSpacing: "0.04em",
                          whiteSpace: "nowrap",
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {patients.slice(0, tableRows).map((p, idx) => (
                      <tr key={p.id} style={{
                        background: idx % 2 === 1 ? COLORS.bg : COLORS.surface,
                        transition: "background 0.1s ease",
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = COLORS.tealSoft}
                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 1 ? COLORS.bg : COLORS.surface}
                      >
                        <td style={{ padding: "9px 12px", borderBottom: `1px solid ${COLORS.line}`, color: COLORS.muted, fontFamily: "IBM Plex Mono, monospace" }}>{p.id}</td>
                        <td style={{ padding: "9px 12px", borderBottom: `1px solid ${COLORS.line}`, fontFamily: "IBM Plex Mono, monospace" }}>{p.age}</td>
                        <td style={{ padding: "9px 12px", borderBottom: `1px solid ${COLORS.line}` }}><RiskBadge tier={p.riskTier} /></td>
                        <td style={{ padding: "9px 12px", borderBottom: `1px solid ${COLORS.line}` }}>
                          <span style={{
                            fontWeight: 600, fontSize: 11,
                            color: p.priorReadmit ? COLORS.red : COLORS.teal,
                          }}>
                            {p.priorReadmit ? "Yes" : "No"}
                          </span>
                        </td>
                        <td style={{ padding: "9px 12px", borderBottom: `1px solid ${COLORS.line}`, fontFamily: "IBM Plex Mono, monospace", textAlign: "center" }}>{p.comorbidities}</td>
                        <td style={{ padding: "9px 12px", borderBottom: `1px solid ${COLORS.line}` }}>{p.channel}</td>
                        <td style={{ padding: "9px 12px", borderBottom: `1px solid ${COLORS.line}`, color: COLORS.amberDark, fontSize: 12 }}>{AGENTS[p.naiveAgent]}</td>
                        <td style={{ padding: "9px 12px", borderBottom: `1px solid ${COLORS.line}`, color: COLORS.tealDark, fontSize: 12 }}>{AGENTS[p.orchestratedAgent]}</td>
                        <td style={{ padding: "9px 12px", borderBottom: `1px solid ${COLORS.line}`, fontFamily: "IBM Plex Mono, monospace", whiteSpace: "nowrap" }}>
                          <span style={{ color: COLORS.amberDark }}>{pct(p.naive.readmitProb)}</span>
                          <span style={{ color: COLORS.muted, margin: "0 6px" }}>→</span>
                          <span style={{ color: COLORS.tealDark }}>{pct(p.orchestrated.readmitProb)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {tableRows < n && (
                <div style={{ padding: "12px 20px", borderTop: `1px solid ${COLORS.line}`, textAlign: "center" }}>
                  <button
                    onClick={() => setTableRows(r => Math.min(r + 20, n))}
                    style={{
                      background: "transparent",
                      border: `1px solid ${COLORS.line}`,
                      borderRadius: 6, padding: "7px 16px",
                      fontSize: 12.5, color: COLORS.muted,
                      cursor: "pointer", fontFamily: "Inter, sans-serif",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = COLORS.bg; e.currentTarget.style.color = COLORS.ink; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = COLORS.muted; }}
                  >
                    Load 20 more rows
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Methodology */}
        <div style={{
          border: `1px solid ${COLORS.line}`,
          borderRadius: 10,
          background: COLORS.surface,
          overflow: "hidden",
        }}>
          <button
            id="toggle-methodology-btn"
            onClick={() => setShowMethod((s) => !s)}
            style={{
              width: "100%", display: "flex",
              justifyContent: "space-between", alignItems: "center",
              padding: "16px 20px", background: "transparent",
              border: "none", cursor: "pointer",
              fontFamily: "Space Grotesk, sans-serif",
              fontSize: 14.5, color: COLORS.ink, fontWeight: 600,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Info size={15} color={COLORS.muted} /> Methodology & caveats
            </span>
            {showMethod ? <ChevronUp size={16} color={COLORS.muted} /> : <ChevronDown size={16} color={COLORS.muted} />}
          </button>

          {showMethod && (
            <div style={{
              padding: "4px 22px 22px",
              borderTop: `1px solid ${COLORS.line}`,
            }}>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr",
                gap: 20, marginTop: 16,
              }}>
                {[
                  {
                    title: "Synthetic data only",
                    body: "Every patient is synthetic: risk score, age, comorbidity count, prior-readmission flag, and channel preference are drawn from distributions, not from any real health system, payer, or Hippocratic AI data.",
                  },
                  {
                    title: "Two outreach policies",
                    body: "Each patient runs through a naive policy (random agent) and an orchestrated policy (risk-tier matched routing). Outcomes are computed for both using the same patient profile and noise draw.",
                  },
                  {
                    title: "Outcome model",
                    body: "Engagement success, time-to-engagement, and readmission probability are generated from formulas that reward a good agent–patient match and add Gaussian noise. Not a validated propensity model.",
                  },
                  {
                    title: "Client-side computation",
                    body: "Everything is computed client-side from the seed shown above. Regenerating the cohort draws a fresh synthetic population and recomputes every chart. No data leaves your browser.",
                  },
                ].map((item) => (
                  <div key={item.title} style={{
                    background: COLORS.bg,
                    borderRadius: 8, padding: "14px 16px",
                    border: `1px solid ${COLORS.line}`,
                  }}>
                    <div style={{
                      fontFamily: "Space Grotesk, sans-serif",
                      fontSize: 13, fontWeight: 600,
                      color: COLORS.ink, marginBottom: 8,
                    }}>
                      {item.title}
                    </div>
                    <p style={{
                      fontSize: 12.5, color: COLORS.muted, lineHeight: 1.65, margin: 0,
                      fontFamily: "Inter, sans-serif",
                    }}>
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 36, textAlign: "center",
          fontSize: 11.5, color: COLORS.muted,
          fontFamily: "Inter, sans-serif",
        }}>
          Orchestration Impact Prototype · Synthetic data only · All computation client-side
        </div>
      </div>
    </div>
  );
}
