import { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const G_ACCEPTED = 6.674e-11;

// Wire torsion constant presets (N·m/rad) — these are the base values for
// user-controlled sliders. Historical presets override kappa directly.
const WIRE_PRESETS = {
  tungsten: { label: "Tungsten",         kappa: 2.5e-6, color: "#6b7280" },
  quartz:   { label: "Quartz Fiber",     kappa: 8.0e-8, color: "#a5b4fc" },
  copper:   { label: "Copper",           kappa: 1.2e-6, color: "#f59e0b" },
  nylon:    { label: "Nylon",            kappa: 3.0e-8, color: "#86efac" },
  pvc:      { label: "PVC (your attempt!)", kappa: 4e-4, color: "#f97316" },
};

// ─── HISTORICAL EXPERIMENT PRESETS ────────────────────────────────────────────
// For each preset we store the historically-documented kappa (torsion constant)
// so that theta_equil = tauGrav / kappa lands in the correct microradian range
// and is always orders of magnitude smaller than any contact angle.
//
// Verification formula for each:
//   tauGrav = 2 × G × M × m × L / r²
//   theta_equil = tauGrav / kappaOverride   ← must be << contact angle
//   contact angle ≈ arcsin((r - rS - rL) / L)   (rough check)
const HISTORICAL_PRESETS = [
  {
    id: "cavendish1798",
    label: "Cavendish (1798)",
    flag: "🇬🇧",
    year: 1798,
    description: "Henry Cavendish's original apparatus at Clapham Common, London. Two 158 kg lead spheres attracted two 0.73 kg balls on a 1.83 m wooden beam, suspended by a silver wire. Isolated in a shed to prevent air drafts. Yielded G within 1% of the accepted value.",
    gResult: "6.74×10⁻¹¹",
    // tauGrav ≈ 2×6.674e-11×158×0.73×0.914/0.225² ≈ 1.24e-7 N·m
    // Historical theta_equil ≈ 1.4e-3 rad  →  kappa = 1.24e-7/1.4e-3 ≈ 8.9e-5
    params: {
      smallMass: 0.730, largeMass: 158.0, beamHalfLength: 0.914,
      wireType: "tungsten", wireLength: 1.0, separation: 0.225,
      kappaOverride: 8.9e-5,
      vibration: 0.05, airflow: 0.03, thermal: 0.04,
      acoustic: 0.02, electrostatic: 0.01, leveling: 0.02, measureNoise: 0.03,
    },
  },
  {
    id: "boys1895",
    label: "Boys (1895)",
    flag: "🇬🇧",
    year: 1895,
    description: "C.V. Boys miniaturized the apparatus using a tiny quartz fiber and gold balls, reducing air disturbance dramatically. His precision was remarkable for the era.",
    gResult: "6.658×10⁻¹¹",
    // tauGrav ≈ 2×6.674e-11×7×0.0026×0.0225/0.15² ≈ 3.0e-13 N·m
    // quartz fiber: theta_equil ≈ 1e-3 rad → kappa ≈ 3e-10
    params: {
      smallMass: 0.0026, largeMass: 7.0, beamHalfLength: 0.0225,
      wireType: "quartz", wireLength: 0.4, separation: 0.15,
      kappaOverride: 3.0e-10,
      vibration: 0.02, airflow: 0.01, thermal: 0.02,
      acoustic: 0.01, electrostatic: 0.01, leveling: 0.01, measureNoise: 0.02,
    },
  },
  {
    id: "braun1897",
    label: "Braun (1897)",
    flag: "🇩🇪",
    year: 1897,
    description: "Karl Ferdinand Braun (Nobel 1909) used a modified torsion balance with copper wire and larger separations to improve measurement of G, achieving results consistent with Cavendish.",
    gResult: "6.658×10⁻¹¹",
    // tauGrav ≈ 2×6.674e-11×5×0.05×0.20/0.12² ≈ 4.6e-12 N·m
    // theta_equil ≈ 1e-3 rad → kappa ≈ 4.6e-9
    params: {
      smallMass: 0.05, largeMass: 5.0, beamHalfLength: 0.20,
      wireType: "copper", wireLength: 1.2, separation: 0.12,
      kappaOverride: 4.6e-9,
      vibration: 0.04, airflow: 0.05, thermal: 0.05,
      acoustic: 0.03, electrostatic: 0.02, leveling: 0.03, measureNoise: 0.04,
    },
  },
  {
    id: "heyl1930",
    label: "Heyl (1930)",
    flag: "🇺🇸",
    year: 1930,
    description: "Paul Heyl at the National Bureau of Standards used a resonance method — exciting the torsion pendulum and measuring its period shift — rather than static deflection, greatly improving precision.",
    gResult: "6.670×10⁻¹¹",
    // tauGrav ≈ 2×6.674e-11×66×0.04×0.275/0.18² ≈ 5.3e-11 N·m
    // theta_equil ≈ 1e-3 rad → kappa ≈ 5.3e-8
    params: {
      smallMass: 0.040, largeMass: 66.0, beamHalfLength: 0.275,
      wireType: "tungsten", wireLength: 1.8, separation: 0.18,
      kappaOverride: 5.3e-8,
      vibration: 0.01, airflow: 0.02, thermal: 0.03,
      acoustic: 0.01, electrostatic: 0.01, leveling: 0.01, measureNoise: 0.02,
    },
  },
  {
    id: "rose1969",
    label: "Rose et al. (1969)",
    flag: "🇺🇸",
    year: 1969,
    description: "University of Virginia team used a modern servo-feedback torsion balance in a vacuum chamber with tungsten wire, achieving one of the most precise measurements of the era.",
    gResult: "6.674×10⁻¹¹",
    // tauGrav ≈ 2×6.674e-11×12×0.020×0.15/0.12² ≈ 3.3e-12 N·m
    // theta_equil ≈ 1e-3 rad → kappa ≈ 3.3e-9
    params: {
      smallMass: 0.020, largeMass: 12.0, beamHalfLength: 0.15,
      wireType: "tungsten", wireLength: 0.8, separation: 0.12,
      kappaOverride: 3.3e-9,
      vibration: 0.005, airflow: 0.005, thermal: 0.01,
      acoustic: 0.005, electrostatic: 0.005, leveling: 0.005, measureNoise: 0.01,
    },
  },
  {
    id: "gundlach2000",
    label: "Gundlach & Merkowitz (2000)",
    flag: "🇺🇸",
    year: 2000,
    description: "University of Washington 'Eöt-Wash' experiment. Rotating torsion balance with thin quartz fiber in high vacuum, eliminating static deflection errors. Produced the most precise G to date.",
    gResult: "6.6742×10⁻¹¹",
    // tauGrav ≈ 2×6.674e-11×3×0.008×0.085/0.09² ≈ 2.6e-13 N·m
    // theta_equil ≈ 1e-3 rad → kappa ≈ 2.6e-10
    params: {
      smallMass: 0.008, largeMass: 3.0, beamHalfLength: 0.085,
      wireType: "quartz", wireLength: 0.6, separation: 0.09,
      kappaOverride: 2.6e-10,
      vibration: 0.001, airflow: 0.001, thermal: 0.005,
      acoustic: 0.001, electrostatic: 0.002, leveling: 0.001, measureNoise: 0.005,
    },
  },
  {
    id: "schoollab",
    label: "Typical School Lab",
    flag: "🏫",
    year: null,
    description: "A standard educational Cavendish apparatus (e.g. PASCO or Leybold kit). Steel wire, lead balls, room-temperature environment with typical background noise from students and HVAC.",
    gResult: "varies widely",
    // tauGrav ≈ 2×6.674e-11×1.5×0.015×0.06/0.085² ≈ 1.6e-13 N·m
    // theta_equil ≈ 1e-3 rad → kappa ≈ 1.6e-10
    params: {
      smallMass: 0.015, largeMass: 1.5, beamHalfLength: 0.06,
      wireType: "tungsten", wireLength: 0.7, separation: 0.085,
      kappaOverride: 1.6e-10,
      vibration: 0.35, airflow: 0.30, thermal: 0.20,
      acoustic: 0.40, electrostatic: 0.10, leveling: 0.15, measureNoise: 0.25,
    },
  },
];

// ─── TOOLTIP CONTENT ──────────────────────────────────────────────────────────
const TOOLTIPS = {
  smallMass:    "The two small lead balls (m) suspended on the beam. Heavier small balls increase gravitational torque but also raise moment of inertia.",
  largeMass:    "The two large lead balls (M) positioned near the small balls. These are the source masses — their gravity twists the wire.",
  beamLength:   "Half-length of the beam (L). The gravitational torque scales with L, so a longer beam gives a larger deflection.",
  wireType:     "The torsion fiber material. Its stiffness (κ) determines how much the wire resists twisting. Stiffer wire = smaller deflection.",
  wireLength:   "Longer wires have a lower effective torsion constant, making the apparatus more sensitive — but also more susceptible to noise.",
  separation:   "Center-to-center horizontal distance between small and large balls. Gravitational force scales as 1/r².",
  vibration:    "Simulates floor/building vibrations (seismic noise). Adds random angular impulses to the beam — the #1 enemy of real Cavendish experiments.",
  airflow:      "Convection currents or drafts in the room. Creates stochastic drag torque that can mask the true equilibrium position.",
  thermal:      "Temperature gradients cause the wire's torsion constant κ to drift slowly over time, shifting the equilibrium.",
  acoustic:     "Sound waves (voices, HVAC) create high-frequency jitter on the optical lever readout.",
  electrostatic:"Charge buildup on the balls creates an extra force. Common in dry lab environments with plastic components.",
  leveling:     "If the apparatus isn't perfectly level, gravity adds a constant offset torque — a systematic error.",
  measureNoise: "Random Gaussian noise added to the angle readout, simulating imperfect optical lever or camera measurement.",
  timeAccel:    "Compress real experiment time. The actual Cavendish experiment takes ~45 minutes to reach equilibrium.",
};

// ─── TOOLTIP COMPONENT ───────────────────────────────────────────────────────
function InfoBubble({ text }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  return (
    <span
      ref={ref}
      className="info-bubble-trigger"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="info-icon">?</span>
      {show && (
        <span className="info-bubble">
          {text}
        </span>
      )}
    </span>
  );
}

// ─── LABELED SLIDER ───────────────────────────────────────────────────────────
function LabeledSlider({ label, tooltip, value, min, max, step, onChange, format, unit }) {
  return (
    <div className="slider-row">
      <div className="slider-label-row">
        <span className="slider-label">{label} <InfoBubble text={tooltip} /></span>
        <span className="slider-value">{format ? format(value) : value}{unit ? ` ${unit}` : ""}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="slider"
      />
    </div>
  );
}

// ─── PHYSICS ENGINE ───────────────────────────────────────────────────────────
function createPhysicsState() {
  return {
    theta: 0,
    omega: 0,
    t: 0,
    thetaEquil: 0,
  };
}

// ─── GEOMETRY HELPERS ─────────────────────────────────────────────────────────
// Cavendish apparatus top-down geometry:
//   - Beam pivot at origin (0, 0)
//   - At rest (θ=0) small ball sits at (L, 0)
//   - Large ball is fixed at (L, r) — directly beside the small ball,
//     offset by distance r perpendicular to the resting beam
//   - As the beam rotates by angle θ, the small ball moves to
//     (L·cosθ, L·sinθ)
//   - Distance between ball centres:
//     d²(θ) = (L·cosθ − L)² + (L·sinθ − r)²
//           = L²(cosθ−1)² + (L·sinθ − r)²
//   - Contact occurs when d = rS + rL
//   - We need the POSITIVE θ at which this first happens (beam swinging toward M)
//
// Solve numerically: scan from 0 upward until d ≤ contact.
// This is robust for all parameter combinations.

const RHO_LEAD = 11340; // kg/m³

function ballRadius(mass) {
  return Math.cbrt((3 * mass) / (4 * Math.PI * RHO_LEAD));
}

function maxContactAngle(params) {
  const rS = ballRadius(params.m);
  const rL = ballRadius(params.M);
  const contact = rS + rL;
  const L = params.L;
  const r = params.r; // perpendicular offset between ball centres at rest

  // Distance between ball centres as a function of beam angle θ
  function dist(theta) {
    const dx = L * Math.cos(theta) - L;
    const dy = L * Math.sin(theta) - r;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // At rest distance — if already overlapping, params are physically impossible
  const d0 = dist(0);
  if (d0 <= contact) {
    // Balls overlap even at rest — return a huge angle (no realistic swing will touch)
    // This prevents false collision triggers for well-designed apparatus
    return Math.PI;
  }

  // Scan from θ=0 toward θ=π/2 in fine steps to find first contact
  const steps = 2000;
  for (let i = 1; i <= steps; i++) {
    const theta = (i / steps) * (Math.PI / 2);
    if (dist(theta) <= contact) {
      // Found contact — return the angle just before
      return ((i - 1) / steps) * (Math.PI / 2);
    }
  }

  // No contact found in 0..π/2 — beam can swing freely
  return Math.PI;
}

function stepPhysics(state, params, noiseParams, dt) {
  const { m, M, L, kappa, wireMult, r, damping } = params;
  const { vibration, airflow, thermal, acoustic, electrostatic, leveling } = noiseParams;

  // Moment of inertia: two small balls on beam
  const I = 2 * m * L * L;

  // Gravitational force between one pair
  const Fg = (G_ACCEPTED * M * m) / (r * r);
  // Gravitational torque (both sides)
  const tauGrav = 2 * Fg * L;

  // Torsion constant with wire length multiplier and thermal drift
  const thermalDrift = 1 + thermal * 0.15 * Math.sin(state.t * 0.001 + 1.7);
  const kEff = kappa * wireMult * thermalDrift;

  // Equilibrium angle
  const thetaEquil = tauGrav / kEff;

  // Electrostatic extra force (opposes or aids depending on sign)
  const tauElectro = electrostatic * 3e-11 * (Math.random() > 0.5 ? 1 : -1);

  // Leveling bias (constant offset torque)
  const tauLevel = leveling * 8e-12;

  // Net torque
  let tau = tauGrav - kEff * state.theta - damping * state.omega + tauElectro + tauLevel;

  // Vibration: random angular impulses
  if (vibration > 0) {
    tau += vibration * 4e-12 * (Math.random() - 0.5) * 2;
  }

  // Airflow: stochastic drag
  if (airflow > 0) {
    const airTorque = airflow * 1.5e-12 * Math.sin(state.t * 0.3 + Math.random() * 0.5);
    tau += airTorque;
  }

  // Euler integration
  const alpha = tau / I;
  let omega = state.omega + alpha * dt;
  let theta = state.theta + omega * dt;

  // ── COLLISION DETECTION ──────────────────────────────────────────────────
  // The beam can only swing until the small balls physically touch the large balls.
  // When contact is reached, stop the beam dead (inelastic contact) and zero velocity.
  const thetaMax = maxContactAngle(params);
  let colliding = false;
  if (theta > thetaMax) {
    theta = thetaMax;
    omega = 0;
    colliding = true;
  } else if (theta < -thetaMax) {
    theta = -thetaMax;
    omega = 0;
    colliding = true;
  }
  // ────────────────────────────────────────────────────────────────────────

  // Acoustic jitter (added to readout only, not true physical motion)
  const acousticJitter = acoustic * 2e-5 * (Math.random() - 0.5);
  const thetaReadout = theta + acousticJitter;

  return {
    theta,
    omega,
    t: state.t + dt,
    thetaEquil,
    thetaReadout,
    thetaMax,
    colliding,
  };
}

function calcG(kappa, L, M, m, r, theta) {
  // Cavendish formula: at equilibrium, gravitational torque = torsion restoring torque
  //   2·G·M·m·L / r² = κ·θ
  //   → G = κ·θ·r² / (2·M·m·L)
  if (Math.abs(theta) < 1e-9) return 0;
  return (kappa * Math.abs(theta) * r * r) / (2 * M * m * L);
}

// ─── SVG APPARATUS ────────────────────────────────────────────────────────────
function CavendishSVG({ theta, thetaEquil, thetaMax, largeMassFlipped, params, running, colliding }) {
  const cx = 300, cy = 160;
  const SVG_L = 100; // SVG pixels for beam half-length (display only)
  const BIG_R = 24;
  const SMALL_R = 12;
  const WIRE_TOP = 10;
  const WIRE_BOT = cy;

  // ── VISUAL SCALING ────────────────────────────────────────────────────────
  // The physical theta values are microradians — far too small to see directly.
  // We map them to a visible angle by treating thetaEquil (the settled target)
  // as equivalent to EQUIL_VIS_RAD on screen. The beam then visibly swings
  // toward that position and oscillates around it, proportionally scaled.
  // This works regardless of whether thetaMax is large (no contact) or small.
  const EQUIL_VIS_RAD = (30 * Math.PI) / 180; // equilibrium maps to 30° on screen
  const refAngle = Math.abs(thetaEquil) > 1e-9 ? Math.abs(thetaEquil) : 1e-6;
  // Scale raw theta by same ratio, clamped to ±50° so it never spins
  const MAX_VIS_RAD = (50 * Math.PI) / 180;
  const thetaVis = Math.max(-MAX_VIS_RAD, Math.min(MAX_VIS_RAD,
    (theta / refAngle) * EQUIL_VIS_RAD
  ));

  const cosT = Math.cos(thetaVis);
  const sinT = Math.sin(thetaVis);

  // Rotating beam endpoints (small balls ride these)
  const x1 = cx + SVG_L * cosT,  y1 = cy + SVG_L * sinT;   // +arm end
  const x2 = cx - SVG_L * cosT,  y2 = cy - SVG_L * sinT;   // −arm end

  // ── LARGE BALL POSITIONS ─────────────────────────────────────────────────
  // Large balls sit on the SAME circular arc (radius SVG_L from pivot) as the
  // small balls, placed at a fixed angle LARGE_MASS_ANGLE ahead of the rest
  // position. This means:
  //   • At rest (0°): clear visible gap between m and M
  //   • At equilibrium (30°): small balls settle visibly just short of M
  //   • At max overshoot (50°): still a safe gap — no visual contact
  //
  // LARGE_MASS_ANGLE = 77°
  // Gap check at max overshoot (50°):
  //   arc dist = SVG_L * 2*sin((77-50)/2 * π/180) = 100*2*sin(13.5°) = 46.6px
  //   surface gap = 46.6 - SMALL_R - BIG_R = 46.6 - 12 - 24 = 10.6px ✓ safe
  // Gap check at equilibrium (30°):
  //   arc dist ≈ 79.7px → surface gap ≈ 43.7px → visibly close but not touching ✓
  const LARGE_MASS_ANGLE = (77 * Math.PI) / 180; // radians along the arc
  const sign = largeMassFlipped ? -1 : 1;

  // Large ball 1: on the +arm side, sign * LARGE_MASS_ANGLE ahead of rest
  const lm1x = cx + SVG_L * Math.cos(sign * LARGE_MASS_ANGLE);
  const lm1y = cy + SVG_L * Math.sin(sign * LARGE_MASS_ANGLE);
  // Large ball 2: exactly opposite (beam is symmetric)
  const lm2x = cx - SVG_L * Math.cos(sign * LARGE_MASS_ANGLE);
  const lm2y = cy - SVG_L * Math.sin(sign * LARGE_MASS_ANGLE);

  // Collision flash colour
  const beamColor = colliding ? "#dc2626" : "#1e3a5f";

  return (
    <svg viewBox="0 0 600 320" className={`apparatus-svg ${running && !colliding ? 'apparatus-pulse' : ''}`}
      aria-label="Cavendish torsion balance top-down view">
      <defs>
        <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
        </pattern>
        <radialGradient id="bigBallGrad" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#fbbf24"/>
          <stop offset="100%" stopColor="#92400e"/>
        </radialGradient>
        <radialGradient id="smallBallGrad" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#6ee7b7"/>
          <stop offset="100%" stopColor="#065f46"/>
        </radialGradient>
        <radialGradient id="smallBallHit" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#fca5a5"/>
          <stop offset="100%" stopColor="#991b1b"/>
        </radialGradient>
        <filter id="shadow">
          <feDropShadow dx="2" dy="2" stdDeviation="3" floodOpacity="0.15"/>
        </filter>
      </defs>

      <rect width="600" height="320" fill="url(#grid)" rx="8"/>
      <rect width="600" height="320" fill="rgba(249,250,251,0.7)" rx="8"/>

      {/* Ceiling mount */}
      <rect x={cx - 18} y={0} width="36" height="12" fill="#374151" rx="3"/>

      {/* Wire (torsion fiber) */}
      <line x1={cx} y1={WIRE_TOP} x2={cx} y2={WIRE_BOT}
        stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="4,3"/>

      {/* Glass case outline — large balls sit at 77° on the arc, extending to y≈281 */}
      <rect x="16" y="12" width="568" height="278" fill="none"
        stroke="#bfdbfe" strokeWidth="1.5" strokeDasharray="6,4" rx="6"/>
      <text x="24" y="27" fontSize="10" fill="#93c5fd" fontFamily="monospace">vacuum enclosure</text>

      {/* Large balls — FIXED, do not rotate with beam */}
      <circle cx={lm1x} cy={lm1y} r={BIG_R} fill="url(#bigBallGrad)" filter="url(#shadow)"/>
      <text x={lm1x} y={lm1y + 5} textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">M</text>
      <circle cx={lm2x} cy={lm2y} r={BIG_R} fill="url(#bigBallGrad)" filter="url(#shadow)"/>
      <text x={lm2x} y={lm2y + 5} textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">M</text>

      {/* Beam */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={beamColor} strokeWidth="5" strokeLinecap="round" filter="url(#shadow)"/>

      {/* Center pivot */}
      <circle cx={cx} cy={cy} r="6" fill="#374151"/>

      {/* Small balls — rotate with beam */}
      <circle cx={x1} cy={y1} r={SMALL_R}
        fill={colliding ? "url(#smallBallHit)" : "url(#smallBallGrad)"} filter="url(#shadow)"/>
      <text x={x1} y={y1 + 4} textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">m</text>
      <circle cx={x2} cy={y2} r={SMALL_R}
        fill={colliding ? "url(#smallBallHit)" : "url(#smallBallGrad)"} filter="url(#shadow)"/>
      <text x={x2} y={y2 + 4} textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">m</text>

      {/* Gravity force arrows (dashed lines from small toward large) */}
      {running && !colliding && (
        <>
          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#f87171"/>
            </marker>
          </defs>
          <line x1={x1} y1={y1} x2={lm1x} y2={lm1y}
            stroke="#f87171" strokeWidth="1.2" strokeDasharray="3,2" markerEnd="url(#arrow)" opacity="0.55"/>
          <line x1={x2} y1={y2} x2={lm2x} y2={lm2y}
            stroke="#f87171" strokeWidth="1.2" strokeDasharray="3,2" markerEnd="url(#arrow)" opacity="0.55"/>
        </>
      )}

      {/* Collision indicator */}
      {colliding && (
        <text x={cx} y={52} textAnchor="middle" fontSize="12"
          fill="#dc2626" fontWeight="bold" fontFamily="monospace">
          ⚠ CONTACT — balls touching
        </text>
      )}

      {/* Deflection angle arc */}
      {Math.abs(thetaVis) > 0.002 && (
        <path
          d={`M ${cx + 48} ${cy} A 48 48 0 0 ${thetaVis >= 0 ? 1 : 0} ${cx + 48 * cosT} ${cy + 48 * sinT}`}
          fill="none" stroke="#6366f1" strokeWidth="1.5" opacity="0.75"/>
      )}
      <text x={cx + 56} y={cy + 5} fontSize="10" fill="#6366f1" fontFamily="monospace">θ</text>

      {/* Scale note */}
      <text x="300" y="313" textAnchor="middle" fontSize="9" fill="#6b7280" fontFamily="Georgia, serif">
        Top-down view — visual swing scaled to ±50° for clarity (physical θ shown in results panel)
      </text>
    </svg>
  );
}

// ─── SECTION HEADER ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title }) {
  return (
    <div className="section-header">
      <span className="section-icon">{icon}</span>
      <span className="section-title">{title}</span>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function CavendishSimulator() {
  // Apparatus params
  const [smallMass, setSmallMass] = useState(0.025);      // kg
  const [largeMass, setLargeMass] = useState(1.5);         // kg
  const [beamHalfLength, setBeamHalfLength] = useState(0.15); // m
  const [wireType, setWireType] = useState("tungsten");
  const [wireLength, setWireLength] = useState(1.0);       // m (multiplier effect)
  const [separation, setSeparation] = useState(0.05);      // m

  // Noise params (0–1)
  const [vibration, setVibration]       = useState(0);
  const [airflow, setAirflow]           = useState(0);
  const [thermal, setThermal]           = useState(0);
  const [acoustic, setAcoustic]         = useState(0);
  const [electrostatic, setElectrostatic] = useState(0);
  const [leveling, setLeveling]         = useState(0);
  const [measureNoise, setMeasureNoise] = useState(0);

  // Sim controls
  const [timeAccel, setTimeAccel] = useState(500);
  const [running, setRunning]     = useState(false);
  const [flipped, setFlipped]     = useState(false);
  const [showHow, setShowHow]     = useState(false);

  // State
  const physRef    = useRef(createPhysicsState());
  const rafRef     = useRef(null);
  const lastRef    = useRef(null);
  const dataRef    = useRef([]);
  const thetaEMARef = useRef(0);   // exponential moving average of theta — stable readout
  const frameCount  = useRef(0);   // frame counter for downsampling state updates

  const [theta, setTheta]           = useState(0);
  const [thetaRaw, setThetaRaw]     = useState(0);  // raw oscillating — drives SVG animation
  const [thetaEquil, setThetaEquil] = useState(0);
  const [thetaMax, setThetaMax]     = useState(0.01);
  const [colliding, setColliding]   = useState(false);
  const [gMeasured, setGMeasured]   = useState(0);
  const [gIdeal, setGIdeal]         = useState(0);
  const [simTime, setSimTime]       = useState(0);
  const [graphData, setGraphData]   = useState([]);

  // Preset selection
  const [activePreset, setActivePreset] = useState(null);
  const [presetDetail, setPresetDetail] = useState(null);
  const [kappaOverride, setKappaOverride] = useState(null); // null = use wire material kappa

  const applyPreset = useCallback((preset) => {
    const p = preset.params;
    setSmallMass(p.smallMass);
    setLargeMass(p.largeMass);
    setBeamHalfLength(p.beamHalfLength);
    setWireType(p.wireType);
    setWireLength(p.wireLength);
    setSeparation(p.separation);
    setKappaOverride(p.kappaOverride ?? null);
    setVibration(p.vibration);
    setAirflow(p.airflow);
    setThermal(p.thermal);
    setAcoustic(p.acoustic);
    setElectrostatic(p.electrostatic);
    setLeveling(p.leveling);
    setMeasureNoise(p.measureNoise);
    setActivePreset(preset.id);
    setPresetDetail(preset);
    // reset sim so new params take effect cleanly
    cancelAnimationFrame(rafRef.current);
    physRef.current = createPhysicsState();
    dataRef.current = [];
    thetaEMARef.current = 0;
    frameCount.current = 0;
    setTheta(0); setThetaRaw(0); setThetaEquil(0); setGMeasured(0); setGIdeal(0);
    setThetaMax(0.01); setColliding(false);
    setSimTime(0); setGraphData([]); setRunning(false);
    lastRef.current = null;
  }, []);

  const wireProp = WIRE_PRESETS[wireType];
  // Use historical kappa when a preset provides one; otherwise derive from wire material + length
  const kappa    = kappaOverride !== null ? kappaOverride : wireProp.kappa / wireLength;
  const wireMult = 1; // already folded into kappa above
  const damping  = 2 * Math.sqrt(2 * smallMass * beamHalfLength ** 2 * kappa) * 0.05;

  const params = {
    m: smallMass, M: largeMass, L: beamHalfLength,
    kappa, wireMult: 1, r: separation, damping
  };
  const noiseParams = { vibration, airflow, thermal, acoustic, electrostatic, leveling };

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    physRef.current = createPhysicsState();
    dataRef.current = [];
    thetaEMARef.current = 0;
    frameCount.current = 0;
    setTheta(0); setThetaRaw(0); setThetaEquil(0); setGMeasured(0); setGIdeal(0);
    setThetaMax(0.01); setColliding(false);
    setSimTime(0); setGraphData([]); setRunning(false);
    lastRef.current = null;
  }, []);

  const flipMasses = () => {
    setFlipped(f => !f);
    physRef.current.omega *= -0.1;
  };

  useEffect(() => {
    if (!running) { cancelAnimationFrame(rafRef.current); return; }

    const loop = (ts) => {
      if (lastRef.current === null) { lastRef.current = ts; }
      const wallDt = Math.min((ts - lastRef.current) / 1000, 0.05);
      lastRef.current = ts;

      const simDt = wallDt * timeAccel;
      const steps = Math.min(Math.ceil(simDt / 0.05), 40);
      const dt = simDt / steps;

      for (let i = 0; i < steps; i++) {
        physRef.current = stepPhysics(physRef.current, params, noiseParams, dt);
      }

      const s = physRef.current;

      // ── STABLE G via Exponential Moving Average ──────────────────────────
      // Rather than reading the instantaneous swinging theta (which bounces
      // violently as the pendulum oscillates), we maintain an EMA that slowly
      // converges to the true settled equilibrium — exactly how a real
      // experimenter reads the apparatus after waiting for oscillations to damp.
      //
      // Alpha controls how fast the EMA tracks the signal:
      //   - Small alpha = very slow, very stable (ignores noise well)
      //   - Large alpha = faster tracking but noisier
      //
      // We use a small base alpha and scale it by simDt so that the EMA
      // convergence rate is independent of time acceleration.
      const emaAlpha = Math.min(0.002 * simDt, 0.15);
      const rawReadout = isFinite(s.thetaReadout) ? s.thetaReadout : 0;
      thetaEMARef.current = (thetaEMARef.current === 0 || !isFinite(thetaEMARef.current))
        ? rawReadout
        : thetaEMARef.current + emaAlpha * (rawReadout - thetaEMARef.current);

      // Additional measurement noise (simulates optical lever imprecision)
      // Applied as a fixed per-run offset rather than per-frame jitter,
      // so it biases the settled value rather than making it bounce.
      // We compute it once and add it to the EMA (it varies very slowly).
      const measureBias = measureNoise * 3e-6 * Math.sin(s.t * 0.0003 + 1.2);
      const stableTheta = thetaEMARef.current + measureBias;

      // G from stable EMA theta (what the experiment actually reports)
      const gStable = calcG(kappa, beamHalfLength, largeMass, smallMass, separation, stableTheta);
      // G from the ideal equilibrium angle — computed fresh from base physics, no thermal drift
      // so it reads a fixed number once params are set, not a wandering value.
      const tauGravBase = 2 * G_ACCEPTED * largeMass * smallMass * beamHalfLength / (separation * separation);
      const thetaEquilBase = tauGravBase / kappa;
      const gPerfect = calcG(kappa, beamHalfLength, largeMass, smallMass, separation, thetaEquilBase);

      frameCount.current += 1;

      // thetaRaw updates EVERY frame — drives smooth SVG animation
      setThetaRaw(s.theta);
      setColliding(s.colliding ?? false);

      // Throttled state updates for results panel (every 6 frames)
      if (frameCount.current % 6 === 0) {
        setTheta(stableTheta);
        setThetaEquil(thetaEquilBase);
        setThetaMax(s.thetaMax ?? 0.01);
        setGMeasured(gStable);
        setGIdeal(gPerfect);
        setSimTime(s.t);
      }

      // Graph: record the raw oscillating theta AND the stable EMA so the
      // graph still shows the damped oscillation shape
      const lastPt = dataRef.current[dataRef.current.length - 1];
      if (!lastPt || s.t - lastPt.t > 1.5) {
        dataRef.current = [...dataRef.current.slice(-200), {
          t: Math.round(s.t),
          theta: +(rawReadout * 1e6).toFixed(4),
          equil: +(thetaEquilBase * 1e6).toFixed(4),
          stable: +(stableTheta * 1e6).toFixed(4),
        }];
        setGraphData([...dataRef.current]);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, timeAccel, smallMass, largeMass, beamHalfLength, kappa,
      separation, damping, vibration, airflow, thermal, acoustic, electrostatic,
      leveling, measureNoise]);

  // ── PRE-RUN PREDICTION ───────────────────────────────────────────────────
  // Compute predicted G and error purely from current slider values,
  // before the simulation runs. This gives the user an instant forecast
  // that updates live as they change any parameter.
  //
  // Ideal prediction: straight Cavendish formula.
  // Since calcG(kappa, L, M, m, r, thetaEquil) = G_ACCEPTED by construction,
  // the ideal error is always ~0% — this confirms the apparatus is set up correctly.
  //
  // Noise prediction: each noise source contributes a static bias to theta
  // proportional to its slider value. These coefficients mirror the physics
  // engine's noise magnitudes, giving a meaningful pre-run forecast.
  const tauGravPred   = 2 * G_ACCEPTED * largeMass * smallMass * beamHalfLength / (separation * separation);
  const thetaEquilPred = tauGravPred / kappa;  // ideal equilibrium angle (same as thetaEquilBase)

  // Static noise bias estimate — each term is the expected magnitude of
  // the persistent offset that noise adds to the settled theta reading.
  // Coefficients tuned to match the physics engine's noise model.
  const noiseBiasPred =
    vibration     * 8e-5  +   // random impulses → persistent angular bias
    airflow       * 6e-5  +   // stochastic drag → slow drift
    thermal       * thetaEquilPred * 0.12 +  // κ drift → proportional equil shift
    acoustic      * 4e-5  +   // readout jitter → averaged bias
    electrostatic * 5e-5  +   // charge force → offset
    leveling      * 1.5e-4 +  // constant torque → direct theta shift
    measureNoise  * 3e-5;     // optical lever imprecision

  const thetaPredWithNoise = thetaEquilPred + noiseBiasPred;
  const gPredIdeal     = calcG(kappa, beamHalfLength, largeMass, smallMass, separation, thetaEquilPred);
  const gPredWithNoise = calcG(kappa, beamHalfLength, largeMass, smallMass, separation, thetaPredWithNoise);
  const errPredIdeal   = ((Math.abs(gPredIdeal - G_ACCEPTED) / G_ACCEPTED) * 100);
  const errPredNoise   = ((Math.abs(gPredWithNoise - G_ACCEPTED) / G_ACCEPTED) * 100);

  const gError = gMeasured > 0
    ? ((Math.abs(gMeasured - G_ACCEPTED) / G_ACCEPTED) * 100).toFixed(2)
    : "—";

  const formatSci = v => v.toExponential(3);
  const fmtTime = s => {
    if (s < 60) return `${s.toFixed(1)} s`;
    if (s < 3600) return `${(s / 60).toFixed(1)} min`;
    return `${(s / 3600).toFixed(2)} hr`;
  };

  return (
    <div className="app-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;600&family=Nunito:wght@400;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --cream: #faf8f4;
          --paper: #f3f0ea;
          --ivory: #ece8df;
          --border: #d6cfc2;
          --text: #1c1917;
          --muted: #6b6460;
          --accent: #1e40af;
          --accent2: #0f766e;
          --warn: #b45309;
          --danger: #991b1b;
          --gold: #92400e;
          --green: #065f46;
          --shadow: 0 2px 12px rgba(0,0,0,0.08);
          --shadow-lg: 0 8px 32px rgba(0,0,0,0.12);
        }

        body { background: var(--cream); }

        .app-root {
          font-family: 'Nunito', sans-serif;
          background: var(--cream);
          min-height: 100vh;
          color: var(--text);
        }

        /* HEADER */
        .app-header {
          background: #1c2541;
          color: white;
          padding: 18px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 3px solid #c8a84b;
        }
        .app-title {
          font-family: 'Lora', serif;
          font-size: 1.55rem;
          letter-spacing: 0.01em;
          color: #f5f0e0;
        }
        .app-subtitle {
          font-size: 0.75rem;
          color: #94a3b8;
          font-family: 'JetBrains Mono', monospace;
          margin-top: 2px;
        }
        .how-btn {
          background: transparent;
          border: 1.5px solid #c8a84b;
          color: #c8a84b;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-family: 'Nunito', sans-serif;
          font-size: 0.82rem;
          font-weight: 600;
          transition: background 0.2s, color 0.2s;
        }
        .how-btn:hover { background: #c8a84b22; }

        /* HOW IT WORKS PANEL */
        .how-panel {
          background: #f0f4ff;
          border-bottom: 2px solid #bfdbfe;
          padding: 20px 32px;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 20px;
        }
        .how-card {
          background: white;
          border-radius: 8px;
          padding: 14px 16px;
          border-left: 4px solid var(--accent);
          box-shadow: var(--shadow);
        }
        .how-card h4 {
          font-family: 'Lora', serif;
          font-size: 0.88rem;
          color: var(--accent);
          margin-bottom: 6px;
        }
        .how-card p {
          font-size: 0.78rem;
          color: var(--muted);
          line-height: 1.5;
        }
        .how-card .eq {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8rem;
          color: var(--text);
          background: #f0f4ff;
          border-radius: 4px;
          padding: 4px 8px;
          margin-top: 6px;
          display: inline-block;
        }

        /* LAYOUT — 3 column: 25% | 50% | 25% */
        .main-grid {
          display: grid;
          grid-template-columns: 25% 50% 25%;
          gap: 0;
          height: calc(100vh - 70px);
          overflow: hidden;
        }

        /* SIDEBAR — shared by left and right columns */
        .sidebar {
          background: var(--paper);
          border-right: 1px solid var(--border);
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          height: 100%;
        }
        .sidebar-right {
          background: var(--paper);
          border-left: 1px solid var(--border);
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          height: 100%;
        }

        .control-card {
          background: white;
          border-radius: 10px;
          padding: 12px 14px;
          box-shadow: var(--shadow);
          border: 1px solid var(--border);
          flex-shrink: 0;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1.5px solid var(--ivory);
        }
        .section-icon { font-size: 1rem; }
        .section-title {
          font-family: 'Lora', serif;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text);
        }

        /* SLIDERS */
        .slider-row { margin-bottom: 10px; }
        .slider-label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        .slider-label {
          font-size: 0.78rem;
          color: var(--muted);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .slider-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          color: var(--accent);
          font-weight: 600;
          min-width: 80px;
          text-align: right;
        }
        .slider {
          width: 100%;
          accent-color: var(--accent);
          height: 4px;
          cursor: pointer;
        }

        /* WIRE SELECTOR */
        .wire-select-label {
          font-size: 0.78rem;
          color: var(--muted);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
          margin-bottom: 6px;
        }
        .wire-select {
          width: 100%;
          padding: 6px 8px;
          border: 1px solid var(--border);
          border-radius: 6px;
          font-family: 'Nunito', sans-serif;
          font-size: 0.82rem;
          background: var(--cream);
          color: var(--text);
          cursor: pointer;
        }
        .wire-badge {
          display: inline-block;
          margin-top: 6px;
          padding: 2px 8px;
          border-radius: 99px;
          font-size: 0.7rem;
          font-family: 'JetBrains Mono', monospace;
          font-weight: 600;
          color: white;
        }

        /* NOISE SLIDERS — color-coded */
        .noise-slider { accent-color: #dc2626; }
        .slider-row.noise .slider { accent-color: #dc2626; }
        .slider-row.noise .slider-value { color: #b91c1c; }

        /* SIM CONTROLS */
        .sim-btns {
          display: flex;
          gap: 8px;
          margin-bottom: 10px;
        }
        .btn {
          flex: 1;
          padding: 8px 10px;
          border-radius: 7px;
          border: none;
          cursor: pointer;
          font-family: 'Nunito', sans-serif;
          font-weight: 700;
          font-size: 0.82rem;
          transition: all 0.15s;
        }
        .btn-run {
          background: #1e3a8a;
          color: white;
        }
        .btn-run:hover { background: #1d4ed8; }
        .btn-pause {
          background: #92400e;
          color: white;
        }
        .btn-pause:hover { background: #b45309; }
        .btn-reset {
          background: var(--ivory);
          color: var(--text);
          border: 1px solid var(--border);
        }
        .btn-reset:hover { background: var(--border); }
        .btn-flip {
          background: #064e3b;
          color: white;
          width: 100%;
          margin-top: 4px;
        }
        .btn-flip:hover { background: #065f46; }

        /* CONTENT AREA */
        .content-area {
          display: flex;
          flex-direction: column;
          padding: 10px;
          gap: 8px;
          background: var(--cream);
          height: 100%;
          overflow: hidden;
        }

        /* APPARATUS SVG */
        .apparatus-card {
          background: white;
          border-radius: 10px;
          padding: 8px 12px;
          box-shadow: var(--shadow);
          border: 1px solid var(--border);
          flex: 0 0 auto;
        }
        .apparatus-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .apparatus-title {
          font-family: 'Lora', serif;
          font-size: 1rem;
          font-weight: 600;
        }
        .status-badge {
          padding: 3px 10px;
          border-radius: 99px;
          font-size: 0.72rem;
          font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
        }
        .status-running { background: #d1fae5; color: #065f46; }
        .status-paused  { background: #fef3c7; color: #92400e; }
        .status-idle    { background: #f1f5f9; color: #475569; }

        .apparatus-svg { width: 100%; border-radius: 8px; }
        @keyframes pulseBorder {
          0%,100% { filter: drop-shadow(0 0 0px #6366f100); }
          50% { filter: drop-shadow(0 0 6px #6366f155); }
        }
        .apparatus-pulse { animation: pulseBorder 2s ease-in-out infinite; }

        /* BOTTOM GRID */
        .bottom-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          flex: 1 1 0;
          min-height: 0;
        }

        /* GRAPH */
        .graph-card {
          background: white;
          border-radius: 10px;
          padding: 10px 12px;
          box-shadow: var(--shadow);
          border: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
        }
        .graph-title {
          font-family: 'Lora', serif;
          font-size: 0.82rem;
          font-weight: 600;
          margin-bottom: 6px;
          color: var(--text);
          flex-shrink: 0;
        }

        /* RESULTS */
        .results-card {
          background: white;
          border-radius: 10px;
          padding: 10px 12px;
          box-shadow: var(--shadow);
          border: 1px solid var(--border);
          overflow-y: auto;
          min-height: 0;
        }
        .results-title {
          font-family: 'Lora', serif;
          font-size: 0.88rem;
          font-weight: 600;
          margin-bottom: 10px;
          color: var(--text);
        }
        .result-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 7px 0;
          border-bottom: 1px solid var(--ivory);
        }
        .result-row:last-child { border-bottom: none; }
        .result-label {
          font-size: 0.78rem;
          color: var(--muted);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .result-val {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text);
        }
        .result-val.good { color: #065f46; }
        .result-val.warn { color: #92400e; }
        .result-val.bad  { color: #991b1b; }

        .g-display {
          background: #f0f4ff;
          border-radius: 8px;
          padding: 12px 14px;
          margin-bottom: 14px;
          border: 1px solid #bfdbfe;
          text-align: center;
        }
        .g-display-label {
          font-size: 0.72rem;
          color: var(--muted);
          font-family: 'JetBrains Mono', monospace;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 4px;
        }
        .g-display-val {
          font-family: 'JetBrains Mono', monospace;
          font-size: 1.3rem;
          font-weight: 700;
          color: var(--accent);
        }
        .g-accepted {
          font-size: 0.68rem;
          color: var(--muted);
          margin-top: 2px;
        }

        /* INFO BUBBLE */
        .info-bubble-trigger {
          position: relative;
          display: inline-flex;
          align-items: center;
          cursor: help;
        }
        .info-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #dbeafe;
          color: #1d4ed8;
          font-size: 9px;
          font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
          cursor: help;
          flex-shrink: 0;
        }
        .info-bubble {
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          background: #1c2541;
          color: #e2e8f0;
          padding: 8px 10px;
          border-radius: 7px;
          font-size: 0.72rem;
          font-family: 'Nunito', sans-serif;
          font-weight: 400;
          line-height: 1.5;
          width: 220px;
          z-index: 999;
          pointer-events: none;
          box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        }
        .info-bubble::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 5px solid transparent;
          border-top-color: #1c2541;
        }

        /* SIM TIME DISPLAY */
        .sim-time-bar {
          display: flex;
          gap: 12px;
          margin-bottom: 8px;
        }
        .sim-time-chip {
          background: var(--ivory);
          border-radius: 6px;
          padding: 4px 10px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          color: var(--muted);
        }
        .sim-time-chip span { color: var(--accent); font-weight: 700; }

        /* NOISE INTENSITY BAR */
        .noise-intensity {
          height: 4px;
          background: #fee2e2;
          border-radius: 2px;
          margin-top: 3px;
          overflow: hidden;
        }
        .noise-fill {
          height: 100%;
          background: linear-gradient(90deg, #fca5a5, #dc2626);
          border-radius: 2px;
          transition: width 0.2s;
        }

        /* HISTORICAL PRESETS */
        .preset-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .preset-btn {
          background: var(--cream);
          border: 1.5px solid var(--border);
          border-radius: 7px;
          padding: 7px 8px;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
          font-family: 'Nunito', sans-serif;
        }
        .preset-btn:hover {
          border-color: var(--accent);
          background: #eff6ff;
        }
        .preset-btn.active {
          border-color: var(--accent);
          background: #dbeafe;
          box-shadow: 0 0 0 2px #bfdbfe;
        }
        .preset-flag { font-size: 1rem; display: block; margin-bottom: 2px; }
        .preset-name {
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--text);
          line-height: 1.2;
          display: block;
        }
        .preset-year {
          font-size: 0.65rem;
          color: var(--muted);
          font-family: 'JetBrains Mono', monospace;
        }
        .preset-detail {
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          border-radius: 8px;
          padding: 10px 12px;
          margin-top: 8px;
          font-size: 0.74rem;
          color: #0c4a6e;
          line-height: 1.5;
        }
        .preset-detail strong {
          display: block;
          font-size: 0.78rem;
          color: #0369a1;
          margin-bottom: 4px;
          font-family: 'Lora', serif;
        }
        .preset-g-result {
          margin-top: 5px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
          color: #065f46;
          font-weight: 700;
        }

        /* PRE-RUN PREDICTION */
        .prediction-panel {
          background: #f0f4ff;
          border: 1.5px solid #bfdbfe;
          border-radius: 8px;
          padding: 10px 12px;
          margin-top: 10px;
        }
        .prediction-title {
          font-size: 0.7rem;
          font-weight: 700;
          color: #1e40af;
          font-family: 'Lora', serif;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .prediction-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 0;
          border-bottom: 1px solid #dbeafe;
          font-size: 0.72rem;
        }
        .prediction-row:last-child { border-bottom: none; }
        .prediction-label { color: var(--muted); font-weight: 600; }
        .prediction-val {
          font-family: 'JetBrains Mono', monospace;
          font-weight: 700;
          font-size: 0.75rem;
        }
        .pred-good  { color: #15803d; }
        .pred-warn  { color: #92400e; }
        .pred-bad   { color: #991b1b; }

        @media (max-width: 1100px) {
          .main-grid { grid-template-columns: 240px 1fr 240px; }
        }
        @media (max-width: 800px) {
          .main-grid { grid-template-columns: 1fr; height: auto; overflow: auto; }
          .sidebar, .sidebar-right { height: auto; }
          .content-area { height: auto; overflow: visible; }
          .bottom-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* HEADER */}
      <header className="app-header">
        <div>
          <div className="app-title">Samantha W. Sr. Thesis — Cavendish Simulator with Environmental Interference</div>
          <div className="app-subtitle">Senior Thesis Tool · Interactive Physics · G = {G_ACCEPTED.toExponential(3)} N·m²/kg²</div>
        </div>
        <button className="how-btn" onClick={() => setShowHow(s => !s)}>
          {showHow ? "Hide" : "How It Works ▾"}
        </button>
      </header>

      {/* HOW IT WORKS */}
      {showHow && (
        <div className="how-panel">
          <div className="how-card">
            <h4>The Experiment</h4>
            <p>Henry Cavendish (1798) measured the gravitational constant G by observing how large lead balls attract small ones suspended on a torsion fiber. The tiny gravitational torque twists the wire until restoring torque balances it.</p>
          </div>
          <div className="how-card">
            <h4>The Physics</h4>
            <p>The beam obeys Newton's second law for rotation. At equilibrium, gravitational torque equals wire restoring torque:</p>
            <div className="eq">2·G·M·m·L / r² = κ·θ</div>
            <p style={{marginTop:'6px'}}>Solving: <strong>G = κ·θ·r² / (2·M·m·L)</strong></p>
          </div>
          <div className="how-card">
            <h4>Why It's Hard</h4>
            <p>G is extraordinarily small. The gravitational force between lab masses is measured in nano-Newtons. Any vibration, air current, or temperature change dwarfs the signal — exactly why this is one of the hardest classic experiments to recreate.</p>
          </div>
          <div className="how-card">
            <h4>Torsion Constant κ</h4>
            <p>Different wire materials have vastly different stiffness. Quartz fibers are most sensitive; tungsten is stiffer. A stiffer wire resists twisting more, giving a smaller deflection angle θ and harder-to-measure result.</p>
          </div>
          <div className="how-card">
            <h4>The Optical Lever</h4>
            <p>Cavendish used a mirror on the beam to reflect a light beam across the room — amplifying tiny angles into measurable displacements. The "measurement noise" slider simulates imperfect readout of this system.</p>
          </div>
          <div className="how-card">
            <h4>Time Acceleration</h4>
            <p>Real experiments take 30–60 minutes per half-period. The time slider compresses this so equilibrium is reached in seconds. Set to ×500 to watch it settle; ×1 to see real physics timescales.</p>
          </div>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className="main-grid">
        {/* SIDEBAR */}
        <aside className="sidebar">

          {/* ① SIM CONTROLS — moved to top */}
          <div className="control-card">
            <SectionHeader icon="⏱️" title="Simulation Controls" />
            <div className="sim-time-bar">
              <div className="sim-time-chip">t = <span>{fmtTime(simTime)}</span></div>
              <div className="sim-time-chip">×<span>{timeAccel}</span></div>
            </div>
            <LabeledSlider
              label="Time Acceleration" tooltip={TOOLTIPS.timeAccel}
              value={timeAccel} min={1} max={5000} step={1}
              onChange={setTimeAccel}
              format={v => `×${v}`}
            />
            <div className="sim-btns">
              {!running
                ? <button className="btn btn-run" onClick={() => setRunning(true)}>▶ Run</button>
                : <button className="btn btn-pause" onClick={() => setRunning(false)}>⏸ Pause</button>
              }
              <button className="btn btn-reset" onClick={reset}>↺ Reset</button>
            </div>
            <button className="btn btn-flip" onClick={flipMasses}>
              ⇄ Flip Large Mass Position
            </button>
            <p style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '6px', lineHeight: '1.4' }}>
              Flipping the large masses mid-experiment is the classic Cavendish verification technique — the beam should swing to a new equilibrium.
            </p>

            {/* PRE-RUN PREDICTION PANEL */}
            <div className="prediction-panel">
              <div className="prediction-title">⚡ Pre-Run Forecast</div>
              <div className="prediction-row">
                <span className="prediction-label">Predicted G (ideal)</span>
                <span className={`prediction-val ${errPredIdeal < 2 ? 'pred-good' : errPredIdeal < 10 ? 'pred-warn' : 'pred-bad'}`}>
                  {gPredIdeal.toExponential(3)}
                </span>
              </div>
              <div className="prediction-row">
                <span className="prediction-label">Ideal error</span>
                <span className={`prediction-val ${errPredIdeal < 2 ? 'pred-good' : errPredIdeal < 10 ? 'pred-warn' : 'pred-bad'}`}>
                  {errPredIdeal.toFixed(2)}%
                </span>
              </div>
              <div className="prediction-row">
                <span className="prediction-label">Predicted G (w/ noise)</span>
                <span className={`prediction-val ${errPredNoise < 2 ? 'pred-good' : errPredNoise < 10 ? 'pred-warn' : 'pred-bad'}`}>
                  {gPredWithNoise.toExponential(3)}
                </span>
              </div>
              <div className="prediction-row">
                <span className="prediction-label">Est. error w/ noise</span>
                <span className={`prediction-val ${errPredNoise < 2 ? 'pred-good' : errPredNoise < 10 ? 'pred-warn' : 'pred-bad'}`}>
                  {errPredNoise.toFixed(2)}%
                </span>
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: 6, lineHeight: 1.35 }}>
                Updates live as you change parameters. Run to see actual measured result.
              </div>
            </div>
          </div>

          {/* ② HISTORICAL PRESETS */}
          <div className="control-card">
            <SectionHeader icon="🏛️" title="Historical Experiments" />
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '10px', lineHeight: '1.4' }}>
              Load parameters from famous real-world Cavendish experiments. All sliders will update automatically.
            </p>
            <div className="preset-grid">
              {HISTORICAL_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  className={`preset-btn ${activePreset === preset.id ? 'active' : ''}`}
                  onClick={() => applyPreset(preset)}
                  title={preset.description}
                >
                  <span className="preset-flag">{preset.flag}</span>
                  <span className="preset-name">{preset.label}</span>
                  <span className="preset-year">{preset.year ?? 'Modern'}</span>
                </button>
              ))}
            </div>
            {presetDetail && (
              <div className="preset-detail">
                <strong>{presetDetail.label}</strong>
                {presetDetail.description}
                <div className="preset-g-result">Reported G: {presetDetail.gResult} N·m²/kg²</div>
              </div>
            )}
          </div>

        </aside>

        {/* CONTENT AREA — centre column */}
        <main className="content-area">

          {/* APPARATUS DISPLAY */}
          <div className="apparatus-card">
            <div className="apparatus-card-header">
              <span className="apparatus-title">Torsion Balance — Top-Down View</span>
              <span className={`status-badge ${running ? 'status-running' : simTime > 0 ? 'status-paused' : 'status-idle'}`}>
                {running ? '● RUNNING' : simTime > 0 ? '⏸ PAUSED' : '○ IDLE'}
              </span>
            </div>
            <CavendishSVG
              theta={thetaRaw}
              thetaEquil={thetaEquil}
              thetaMax={thetaMax}
              largeMassFlipped={flipped}
              params={params}
              running={running}
              colliding={colliding}
            />
          </div>

          {/* BOTTOM GRID */}
          <div className="bottom-grid">

            {/* GRAPH */}
            <div className="graph-card">
              <div className="graph-title">Angular Deflection θ vs. Simulated Time</div>
              {graphData.length < 2 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '0.78rem', fontStyle: 'italic' }}>
                  Press Run to begin recording…
                </div>
              ) : (
                <div style={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={graphData} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="t" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                      label={{ value: 'sim time (s)', position: 'insideBottom', offset: -2, fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                      label={{ value: 'θ (μrad)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ fontFamily: 'JetBrains Mono', fontSize: '0.72rem' }}
                      formatter={(v, n) => [`${v.toFixed(4)} μrad`,
                        n === 'theta' ? 'Raw θ' : n === 'stable' ? 'Settled θ (EMA)' : 'Ideal equilibrium'
                      ]}
                    />
                    <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="2 2" />
                    <Line type="monotone" dataKey="equil" stroke="#059669" strokeWidth={1.5}
                      dot={false} strokeDasharray="5 3" name="equil" />
                    <Line type="monotone" dataKey="theta" stroke="#93c5fd" strokeWidth={1}
                      dot={false} name="theta" opacity={0.6} />
                    <Line type="monotone" dataKey="stable" stroke="#3b82f6" strokeWidth={2}
                      dot={false} name="stable" />
                  </LineChart>
                </ResponsiveContainer>
                </div>
              )}
              <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
                <span style={{ fontSize: '0.7rem', color: '#93c5fd', fontFamily: 'JetBrains Mono' }}>─ Raw θ (oscillating)</span>
                <span style={{ fontSize: '0.7rem', color: '#3b82f6', fontFamily: 'JetBrains Mono' }}>─ Settled θ (EMA)</span>
                <span style={{ fontSize: '0.7rem', color: '#059669', fontFamily: 'JetBrains Mono' }}>- - Ideal equilibrium</span>
              </div>
            </div>

            {/* RESULTS */}
            <div className="results-card">
              <div className="results-title">Measurement Results</div>

              {/* ── G COMPARISON: ideal vs measured ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                {/* Ideal G — no noise */}
                <div className="g-display" style={{ background: '#f0fdf4', borderColor: '#86efac' }}>
                  <div className="g-display-label" style={{ color: '#166534' }}>G — Ideal (no noise)</div>
                  <div className="g-display-val" style={{ fontSize: '0.9rem', color: '#15803d' }}>
                    {gIdeal > 0 ? gIdeal.toExponential(3) : "—"}
                  </div>
                  {(() => {
                    if (gIdeal <= 0) return <div className="g-accepted" style={{ color: '#166534' }}>awaiting data</div>;
                    const errPct = (Math.abs(gIdeal - G_ACCEPTED) / G_ACCEPTED) * 100;
                    const col = errPct < 2 ? '#15803d' : errPct < 10 ? '#92400e' : '#991b1b';
                    return (
                      <div style={{ marginTop: 3 }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem', fontWeight: 700, color: col }}>
                          {errPct.toFixed(2)}% error
                        </span>
                      </div>
                    );
                  })()}
                </div>
                {/* Measured G — with noise */}
                <div className="g-display" style={{
                  background: gMeasured > 0 ? '#fff7ed' : '#f8fafc',
                  borderColor: gMeasured > 0 ? '#fdba74' : '#e2e8f0'
                }}>
                  <div className="g-display-label" style={{ color: '#92400e' }}>G — With Noise</div>
                  <div className="g-display-val" style={{ fontSize: '0.9rem', color: '#c2410c' }}>
                    {gMeasured > 0 ? gMeasured.toExponential(3) : "—"}
                  </div>
                  {(() => {
                    if (gMeasured <= 0) return <div className="g-accepted" style={{ color: '#92400e' }}>awaiting data</div>;
                    const errPct = (Math.abs(gMeasured - G_ACCEPTED) / G_ACCEPTED) * 100;
                    const col = errPct < 2 ? '#15803d' : errPct < 10 ? '#92400e' : '#991b1b';
                    return (
                      <div style={{ marginTop: 3 }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem', fontWeight: 700, color: col }}>
                          {errPct.toFixed(2)}% error
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Accepted value reference */}
              <div style={{
                textAlign: 'center', fontSize: '0.68rem', color: 'var(--muted)',
                fontFamily: 'JetBrains Mono, monospace', marginBottom: 8,
                padding: '3px 0', borderBottom: '1px solid var(--ivory)'
              }}>
                Accepted G = {G_ACCEPTED.toExponential(4)} N·m²/kg²
              </div>

              {/* Noise impact bar — fixed height, warning always reserves space */}
              {(() => {
                const noiseDelta = gIdeal > 0 && gMeasured > 0 ? Math.abs(gMeasured - gIdeal) : 0;
                const pctShift = Math.min((noiseDelta / G_ACCEPTED) * 100, 100);
                const anyNoise = [vibration, airflow, thermal, acoustic, electrostatic, leveling, measureNoise].some(v => v > 0);
                const barColor = pctShift > 20
                  ? 'linear-gradient(90deg,#fca5a5,#dc2626)'
                  : pctShift > 5
                    ? 'linear-gradient(90deg,#fde68a,#d97706)'
                    : 'linear-gradient(90deg,#86efac,#16a34a)';
                const labelColor = pctShift > 20 ? '#dc2626' : pctShift > 5 ? '#d97706' : '#16a34a';
                return (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)' }}>
                        Noise Impact on G <InfoBubble text="How much the environmental noise is shifting your G measurement away from the ideal (no-noise) result." />
                      </span>
                      <span style={{ fontSize: '0.68rem', fontFamily: 'JetBrains Mono, monospace', color: labelColor, fontWeight: 700 }}>
                        {gIdeal > 0 && gMeasured > 0
                          ? (anyNoise ? `+${pctShift.toFixed(1)}% shift` : 'no noise active')
                          : '—'}
                      </span>
                    </div>
                    <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
                      <div style={{
                        height: '100%', borderRadius: 4,
                        width: `${pctShift}%`,
                        background: barColor,
                        transition: 'width 0.4s ease, background 0.4s ease'
                      }}/>
                    </div>
                    {/* Fixed-height warning area — always rendered, visibility toggled so layout never shifts */}
                    <div style={{
                      fontSize: '0.65rem', lineHeight: 1.35,
                      minHeight: '2.7em',  /* always reserves space for 2 lines */
                      visibility: (anyNoise && pctShift > 5 && gMeasured > 0) ? 'visible' : 'hidden'
                    }}>
                      ⚠ Environmental interference is corrupting your G measurement.
                      Reduce noise sliders to improve accuracy.
                      {pctShift > 50 && ' Current noise makes precision measurement impossible.'}
                    </div>
                  </div>
                );
              })()}

              {/* Detail rows */}
              {[
                {
                  label: "Deflection θ (measured)",
                  tip: "Settled beam deflection angle (EMA) after oscillations damp out, in microradians.",
                  val: isFinite(theta) && Math.abs(theta) > 1e-12 ? `${(theta * 1e6).toFixed(4)} μrad` : "—", cls: ''
                },
                {
                  label: "Equilibrium θ (ideal)",
                  tip: "Theoretical equilibrium angle from apparatus parameters alone — no noise, no drift.",
                  val: isFinite(thetaEquil) && thetaEquil > 1e-12 ? `${(thetaEquil * 1e6).toFixed(4)} μrad` : "—", cls: ''
                },
                {
                  label: "Wire κ",
                  tip: "Effective torsion constant of the wire/fiber.",
                  val: `${kappa.toExponential(2)} N·m/rad`, cls: ''
                },
                {
                  label: "Grav. Torque",
                  tip: "Theoretical gravitational torque driving the beam toward equilibrium.",
                  val: thetaEquil > 0 ? `${(kappa * thetaEquil * 1e12).toFixed(3)} pN·m` : "—",
                  cls: ''
                },
                {
                  label: "Simulated Time",
                  tip: "Total elapsed simulation time.",
                  val: fmtTime(simTime), cls: ''
                },
              ].map(({ label, tip, val, cls }) => (
                <div className="result-row" key={label}>
                  <span className="result-label">{label} <InfoBubble text={tip} /></span>
                  <span className={`result-val ${cls}`}>{val}</span>
                </div>
              ))}
            </div>

          </div>
        </main>

        {/* RIGHT SIDEBAR — Apparatus Parameters + Environmental Interference */}
        <aside className="sidebar-right">

          {/* ③ APPARATUS CONTROLS */}
          <div className="control-card">
            <SectionHeader icon="⚙️" title="Apparatus Parameters" />
            <LabeledSlider
              label="Small Ball Mass (m)" tooltip={TOOLTIPS.smallMass}
              value={smallMass} min={0.005} max={0.1} step={0.005}
              onChange={v => { setSmallMass(v); setActivePreset(null); setKappaOverride(null); reset(); }}
              format={v => v.toFixed(3)} unit="kg"
            />
            <LabeledSlider
              label="Large Ball Mass (M)" tooltip={TOOLTIPS.largeMass}
              value={largeMass} min={0.5} max={200} step={0.5}
              onChange={v => { setLargeMass(v); setActivePreset(null); setKappaOverride(null); reset(); }}
              format={v => v.toFixed(1)} unit="kg"
            />
            <LabeledSlider
              label="Beam Half-Length (L)" tooltip={TOOLTIPS.beamLength}
              value={beamHalfLength} min={0.02} max={1.0} step={0.005}
              onChange={v => { setBeamHalfLength(v); setActivePreset(null); setKappaOverride(null); reset(); }}
              format={v => v.toFixed(3)} unit="m"
            />
            <LabeledSlider
              label="Ball Separation (r)" tooltip={TOOLTIPS.separation}
              value={separation} min={0.02} max={0.3} step={0.005}
              onChange={v => {
                const rS = ballRadius(smallMass);
                const rL = ballRadius(largeMass);
                const minSep = (rS + rL) * 1.25;
                setSeparation(Math.max(v, minSep));
                setActivePreset(null); setKappaOverride(null); reset();
              }}
              format={v => v.toFixed(3)} unit="m"
            />
            <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginBottom: 6, lineHeight: 1.4 }}>
              Radii: m={( ballRadius(smallMass)*100).toFixed(1)}cm, M={(ballRadius(largeMass)*100).toFixed(1)}cm.
              Min sep: {((ballRadius(smallMass)+ballRadius(largeMass))*1.25*100).toFixed(1)}cm.
            </div>
            <div className="slider-row">
              <div className="wire-select-label">
                Wire / Fiber Material <InfoBubble text={TOOLTIPS.wireType} />
              </div>
              <select
                className="wire-select"
                value={wireType}
                onChange={e => { setWireType(e.target.value); setActivePreset(null); reset(); }}
              >
                {Object.entries(WIRE_PRESETS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <div>
                <span className="wire-badge" style={{ background: wireProp.color }}>
                  κ = {kappa.toExponential(1)} N·m/rad
                </span>
              </div>
            </div>
            <LabeledSlider
              label="Wire Length" tooltip={TOOLTIPS.wireLength}
              value={wireLength} min={0.3} max={3.0} step={0.1}
              onChange={v => { setWireLength(v); setActivePreset(null); reset(); }}
              format={v => v.toFixed(1)} unit="m"
            />
          </div>

          {/* ④ ENVIRONMENTAL NOISE */}
          <div className="control-card">
            <SectionHeader icon="🌪️" title="Environmental Interference" />
            {[
              { label: "Vibration / Seismic", val: vibration, set: v => { setVibration(v); setActivePreset(null); }, tip: TOOLTIPS.vibration },
              { label: "Air Currents",        val: airflow,   set: v => { setAirflow(v);   setActivePreset(null); }, tip: TOOLTIPS.airflow },
              { label: "Thermal Drift",       val: thermal,   set: v => { setThermal(v);   setActivePreset(null); }, tip: TOOLTIPS.thermal },
              { label: "Acoustic Noise",      val: acoustic,  set: v => { setAcoustic(v);  setActivePreset(null); }, tip: TOOLTIPS.acoustic },
              { label: "Electrostatic",       val: electrostatic, set: v => { setElectrostatic(v); setActivePreset(null); }, tip: TOOLTIPS.electrostatic },
              { label: "Leveling Error",      val: leveling,  set: v => { setLeveling(v);  setActivePreset(null); }, tip: TOOLTIPS.leveling },
              { label: "Measurement Noise",   val: measureNoise, set: v => { setMeasureNoise(v); setActivePreset(null); }, tip: TOOLTIPS.measureNoise },
            ].map(({ label, val, set, tip }) => (
              <div className="slider-row noise" key={label}>
                <div className="slider-label-row">
                  <span className="slider-label">{label} <InfoBubble text={tip} /></span>
                  <span className="slider-value" style={{ color: val > 0.5 ? '#991b1b' : val > 0.2 ? '#b45309' : '#6b6460' }}>
                    {(val * 100).toFixed(0)}%
                  </span>
                </div>
                <input type="range" min={0} max={1} step={0.01} value={val}
                  onChange={e => set(parseFloat(e.target.value))}
                  className="slider noise-slider"
                  style={{ accentColor: val > 0.5 ? '#dc2626' : val > 0.2 ? '#d97706' : '#9ca3af' }}
                />
                <div className="noise-intensity">
                  <div className="noise-fill" style={{ width: `${val * 100}%` }} />
                </div>
              </div>
            ))}
          </div>

        </aside>

      </div>
    </div>
  );
}
