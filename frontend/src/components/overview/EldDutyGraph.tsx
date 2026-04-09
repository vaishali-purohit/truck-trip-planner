import type { DutyStatusTotals, EldLogSegment, EldSegmentStatus } from "../../types/trip";
import { Box, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

const ROW_LABELS = ["Off Duty", "Sleeper", "Driving", "On Duty"] as const;

/**
 * 24-hour duty status graph (ELD-style): hour axis on top, four status bands (Off → Sleeper → Driving → On Duty),
 * step path with transitions. Rows match FMCSA-style order top to bottom.
 */
export default function EldDutyGraph(props: { dutyTotals: DutyStatusTotals; segments?: EldLogSegment[] }) {
  const { dutyTotals, segments: explicitSegments } = props;
  const theme = useTheme();
  const grid = alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.22 : 0.18);
  const ink = alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.92 : 0.86);
  const dutyStroke = "#111827";

  const W = 980;
  const leftPad = 8;
  const labelW = 110;
  const rightPad = 12;
  const chartW = W - leftPad - labelW - rightPad;
  const topPad = 52;
  const rowH = 54;
  const rows = 4;
  const chartH = topPad + rows * rowH;

  const x0 = leftPad + labelW;
  const minorXs = Array.from({ length: 24 * 4 + 1 }, (_, i) => x0 + (chartW / (24 * 4)) * i);

  const segments = (explicitSegments?.length ? explicitSegments : buildSegmentsFromTotals(dutyTotals)).map(
    (s) => ({
      fromHour: s.fromHour,
      toHour: s.toHour,
      row: statusToRowIndex(s.status),
    }),
  );

  const transitionNodes: { h: number; row: number }[] = buildTransitionNodes(segments);

  const pathD = buildStepPath({ x0, chartW, topPad, rowH, segments });

  return (
    <Box sx={{ width: "100%" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${chartH + 24}`}
        preserveAspectRatio="xMinYMin meet"
        style={{ display: "block", height: "auto" }}
      >
        <text x={leftPad} y={18} fill={ink} fontSize="12" fontWeight="700">
          Driver&apos;s Daily Log — 24 Hour Graph
        </text>

        {renderTopAxisLabels({ x0, chartW, ink })}

        <rect x={x0} y={topPad} width={chartW} height={rows * rowH} fill="none" stroke={grid} strokeWidth={1.2} />

        {minorXs.map((x, i) => (
          <line
            key={i}
            x1={x}
            x2={x}
            y1={topPad}
            y2={chartH}
            stroke={grid}
            strokeWidth={i % 4 === 0 ? 1 : 0.45}
            opacity={i % 4 === 0 ? 1 : 0.75}
          />
        ))}

        {ROW_LABELS.map((_, idx) => {
          const y = topPad + idx * rowH;
          return (
            <line
              key={idx}
              x1={x0}
              x2={x0 + chartW}
              y1={y}
              y2={y}
              stroke={grid}
              strokeWidth={1.2}
            />
          );
        })}
        <line x1={x0} x2={x0 + chartW} y1={chartH} y2={chartH} stroke={grid} strokeWidth={1.2} />

        {ROW_LABELS.map((label, idx) => {
          const cy = topPad + (idx + 0.5) * rowH;
          return (
            <g key={label}>
              <text
                x={leftPad}
                y={cy}
                dominantBaseline="middle"
                fill={ink}
                fontSize="12"
                fontWeight="650"
              >
                {label}
              </text>
            </g>
          );
        })}

        {transitionNodes.map((p, i) => {
          const x = x0 + (chartW / 24) * p.h;
          const y = topPad + p.row * rowH + rowH / 2;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={4}
              fill={theme.palette.background.paper}
              stroke={dutyStroke}
              strokeWidth={2}
            />
          );
        })}

        <path
          d={pathD}
          fill="none"
          stroke={dutyStroke}
          strokeWidth={4}
          strokeLinejoin="miter"
          strokeLinecap="square"
        />
      </svg>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
        Mid. → Mid. (24 hours). Line is generated from the plan schedule (segments) when available.
      </Typography>
    </Box>
  );
}

function buildStepPath(opts: {
  x0: number;
  chartW: number;
  topPad: number;
  rowH: number;
  segments: { fromHour: number; toHour: number; row: number }[];
}) {
  const { x0, chartW, topPad, rowH, segments } = opts;
  const x = (h: number) => x0 + (chartW / 24) * h;
  const y = (row: number) => topPad + row * rowH + rowH / 2;

  const parts: string[] = [];
  for (const seg of segments) {
    const x0 = x(seg.fromHour);
    const x1 = x(seg.toHour);
    const yy = y(seg.row);
    if (parts.length === 0) parts.push(`M ${x0} ${yy}`);
    else parts.push(`L ${x0} ${yy}`);
    parts.push(`L ${x1} ${yy}`);
  }
  return parts.join(" ");
}

function statusToRowIndex(status: EldSegmentStatus) {
  switch (status) {
    case "Off Duty":
      return 0;
    case "Sleeper":
      return 1;
    case "Driving":
      return 2;
    case "On Duty":
      return 3;
    default:
      return 0;
  }
}

function buildSegmentsFromTotals(totals: DutyStatusTotals): EldLogSegment[] {
  const order: Array<{ status: EldSegmentStatus; hours: number }> = [
    { status: "Off Duty", hours: totals.offDutyHours },
    { status: "Sleeper", hours: totals.sleeperBerthHours },
    { status: "Driving", hours: totals.drivingHours },
    { status: "On Duty", hours: totals.onDutyHours },
  ];

  const segments: EldLogSegment[] = [];
  let h = 0;
  for (const item of order) {
    const hours = Number.isFinite(item.hours) ? Math.max(0, item.hours) : 0;
    if (hours <= 0) continue;
    const fromHour = h;
    const toHour = Math.min(24, h + hours);
    if (toHour > fromHour) segments.push({ status: item.status, fromHour, toHour });
    h = toHour;
    if (h >= 24) break;
  }
  if (h < 24) segments.push({ status: "Off Duty", fromHour: h, toHour: 24 });
  return segments;
}

function buildTransitionNodes(segments: { fromHour: number; toHour: number; row: number }[]) {
  const nodes: { h: number; row: number }[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i];
    const b = segments[i + 1];
    const h = a.toHour;
    nodes.push({ h, row: a.row }, { h, row: b.row });
  }
  return nodes;
}

function renderTopAxisLabels(opts: { x0: number; chartW: number; ink: string }) {
  const { x0, chartW, ink } = opts;
  const x = (h: number) => x0 + (chartW / 24) * h;

  const labels: Array<{ at: number; text: string }> = [
    { at: 0, text: "Mid." },
    ...Array.from({ length: 11 }, (_, i) => ({ at: i + 1, text: String(i + 1) })),
    { at: 12, text: "Noon" },
    ...Array.from({ length: 11 }, (_, i) => ({ at: 12 + (i + 1), text: String(i + 1) })),
    { at: 24, text: "Mid." },
  ];

  return (
    <g>
      {labels.map((l, i) => (
        <text
          key={i}
          x={x(l.at)}
          y={36}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={ink}
          fontSize="11"
          fontWeight="650"
        >
          {l.text}
        </text>
      ))}
    </g>
  );
}
