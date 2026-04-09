import type { TripDetails } from "../types/trip";
import { formatDateOnly, formatDateTimeEastern, formatStop } from "./tripFormat";

type RemarkEntry = {
  time: string;
  status: "Off Duty" | "Sleeper" | "Driving" | "On Duty";
  location: string;
  description: string;
};

function safeText(v: unknown) {
  return typeof v === "string" ? v : String(v ?? "");
}

function buildRemarks(trip: TripDetails): RemarkEntry[] {
  const p = formatStop(trip.pickup);
  const d = formatStop(trip.dropoff);
  return [
    { time: "18:20", status: "On Duty", location: p, description: "Pre-trip inspection" },
    { time: "18:35", status: "Driving", location: p, description: "Driving" },
    { time: "22:00", status: "Off Duty", location: d, description: "30 minute break" },
    { time: "22:30", status: "Driving", location: d, description: "Driving" },
    { time: "23:39", status: "On Duty", location: d, description: "Pickup — Loading cargo" },
  ];
}

type DutyKey = "off" | "sleeper" | "driving" | "onDuty";

function buildScheduleFromTotals(t: TripDetails["dutyTotals"]) {
  const order: Array<{ statusKey: DutyKey; hours: number }> = [
    { statusKey: "off", hours: t.offDutyHours },
    { statusKey: "sleeper", hours: t.sleeperBerthHours },
    { statusKey: "driving", hours: t.drivingHours },
    { statusKey: "onDuty", hours: t.onDutyHours },
  ];

  const segments: Array<{ statusKey: DutyKey; fromHour: number; toHour: number }> = [];
  let h = 0;
  for (const item of order) {
    const hours = Number.isFinite(item.hours) ? Math.max(0, item.hours) : 0;
    if (hours <= 0) continue;
    const fromHour = h;
    const toHour = Math.min(24, h + hours);
    if (toHour > fromHour) segments.push({ statusKey: item.statusKey, fromHour, toHour });
    h = toHour;
    if (h >= 24) break;
  }
  if (h < 24) segments.push({ statusKey: "off", fromHour: h, toHour: 24 });

  const merged: typeof segments = [];
  for (const s of segments) {
    const last = merged[merged.length - 1];
    if (last && last.statusKey === s.statusKey && Math.abs(last.toHour - s.fromHour) < 1e-6) {
      last.toHour = s.toHour;
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

function statusKeyToRowIndex(statusKey: DutyKey) {
  switch (statusKey) {
    case "off":
      return 0;
    case "sleeper":
      return 1;
    case "driving":
      return 2;
    case "onDuty":
      return 3;
    default:
      return 0;
  }
}

function drawEldDutyGraph(opts: {
  doc: import("jspdf").jsPDF;
  x: number;
  y: number;
  w: number;
  dutyTotals: TripDetails["dutyTotals"];
}) {
  const { doc, x, y, w, dutyTotals } = opts;

  const labelW = Math.min(140, Math.max(110, w * 0.23));
  const rightPad = 6;
  const topAxisH = 32;
  const rowH = 34;
  const rows = 4;
  const chartW = w - labelW - rightPad;
  const chartH = topAxisH + rows * rowH;
  const x0 = x + labelW;
  const y0 = y + topAxisH;

  const grid = 210;
  const ink = 35;
  const dutyStroke = 20;

  doc.setDrawColor(grid);
  doc.setTextColor(ink);

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Driver's Daily Log — 24 Hour Graph", x, y + 12);

  // Top axis labels: Mid. 1..11 Noon 1..11 Mid.
  const labels: Array<{ at: number; text: string }> = [
    { at: 0, text: "Mid." },
    ...Array.from({ length: 11 }, (_, i) => ({ at: i + 1, text: String(i + 1) })),
    { at: 12, text: "Noon" },
    ...Array.from({ length: 11 }, (_, i) => ({ at: 12 + (i + 1), text: String(i + 1) })),
    { at: 24, text: "Mid." },
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const l of labels) {
    const xx = x0 + (chartW / 24) * l.at;
    doc.text(l.text, xx, y + 26, { align: "center" });
  }

  // Border rect
  doc.rect(x0, y0, chartW, rows * rowH);

  // Minor vertical grid (15 min)
  doc.setLineWidth(0.4);
  for (let i = 0; i <= 24 * 4; i++) {
    const xx = x0 + (chartW / (24 * 4)) * i;
    doc.setDrawColor(grid);
    if (i % 4 === 0) doc.setLineWidth(0.7);
    else doc.setLineWidth(0.35);
    doc.line(xx, y0, xx, y0 + rows * rowH);
  }

  // Row separators + row labels
  const rowLabels = ["Off Duty", "Sleeper", "Driving", "On Duty"];
  doc.setLineWidth(0.8);
  for (let r = 0; r < rows; r++) {
    const yy = y0 + r * rowH;
    doc.setDrawColor(grid);
    doc.line(x0, yy, x0 + chartW, yy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(rowLabels[r], x, yy + rowH / 2 + 3);
  }
  doc.line(x0, y0 + rows * rowH, x0 + chartW, y0 + rows * rowH);

  const schedule = buildScheduleFromTotals(dutyTotals);
  const segments = schedule.map((s) => ({
    fromHour: s.fromHour,
    toHour: s.toHour,
    row: statusKeyToRowIndex(s.statusKey),
  }));

  const xAt = (h: number) => x0 + (chartW / 24) * h;
  const yAt = (row: number) => y0 + row * rowH + rowH / 2;

  // Transition nodes (small circles)
  const nodes: { h: number; row: number }[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i];
    const b = segments[i + 1];
    nodes.push({ h: a.toHour, row: a.row }, { h: a.toHour, row: b.row });
  }

  doc.setDrawColor(dutyStroke);
  doc.setLineWidth(2.4);

  // Step path
  let started = false;
  let prevX = 0;
  let prevY = 0;
  for (const seg of segments) {
    const xStart = xAt(seg.fromHour);
    const xEnd = xAt(seg.toHour);
    const yy = yAt(seg.row);
    if (!started) {
      started = true;
      prevX = xStart;
      prevY = yy;
    } else {
      doc.line(prevX, prevY, xStart, yy);
      prevX = xStart;
      prevY = yy;
    }
    doc.line(prevX, prevY, xEnd, yy);
    prevX = xEnd;
    prevY = yy;
  }

  // Nodes on top
  doc.setFillColor(255, 255, 255);
  for (const n of nodes) {
    const cx = xAt(n.h);
    const cy = yAt(n.row);
    doc.circle(cx, cy, 3.2, "FD");
  }

  return chartH + 10;
}

export async function exportTripPdf(trip: TripDetails) {
  const [{ jsPDF }] = await Promise.all([import("jspdf")]);

  const doc = new jsPDF({ orientation: "p", unit: "pt", format: "letter" });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;

  let y = margin;

  const title = `Trip Export — ${trip.id}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(
    `${formatStop(trip.pickup)} → ${formatStop(trip.dropoff)}  •  Date: ${formatDateOnly(trip.dateISO)}  •  Driver: ${safeText(trip.driverName)}`,
    margin,
    y,
    { maxWidth: maxW },
  );
  y += 18;

  const section = (label: string) => {
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(label, margin, y);
    y += 10;
    doc.setDrawColor(210);
    doc.line(margin, y, pageW - margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
  };

  const ensureSpace = (need: number) => {
    if (y + need <= pageH - margin) return;
    doc.addPage();
    y = margin;
  };

  // Summary
  section("Summary");
  ensureSpace(120);
  const summaryLines = [
    `Trip ID: ${trip.id}`,
    `Date: ${formatDateOnly(trip.dateISO)}`,
    `Driver: ${safeText(trip.driverName)}`,
    `Truck / Trailer: ${trip.truckId}${trip.trailerId ? ` / ${trip.trailerId}` : ""}`,
    `Carrier Name: ${trip.carrierName}`,
    `Main office: ${trip.mainOfficeAddress}`,
    `Total Miles Driving Today: ${trip.totalMilesToday.toFixed(1)}`,
    `Estimated Arrival: ${formatDateTimeEastern(trip.estimatedArrivalISO)}`,
    `Distance: ${trip.totalDistanceMi.toFixed(1)} miles`,
    `Total Trip Time: ${trip.totalTripTimeHours.toFixed(1)} hrs`,
    `Rest Stops: ${trip.stopsCount}`,
  ];
  for (const line of summaryLines) {
    ensureSpace(14);
    doc.text(line, margin, y, { maxWidth: maxW });
    y += 14;
  }

  // Driver logs (match Logs UI)
  section("Driver Logs");

  // 24-hour graph
  ensureSpace(220);
  const graphH = drawEldDutyGraph({ doc, x: margin, y, w: maxW, dutyTotals: trip.dutyTotals });
  y += graphH;

  // Daily status totals (as shown on right sidebar)
  ensureSpace(140);
  const totalsLines = [
    `Off Duty: ${trip.dutyTotals.offDutyHours.toFixed(2)} hrs`,
    `Sleeper Berth: ${trip.dutyTotals.sleeperBerthHours.toFixed(2)} hrs`,
    `Driving: ${trip.dutyTotals.drivingHours.toFixed(2)} hrs`,
    `On Duty: ${trip.dutyTotals.onDutyHours.toFixed(2)} hrs`,
    `Total: ${(
      trip.dutyTotals.offDutyHours +
      trip.dutyTotals.sleeperBerthHours +
      trip.dutyTotals.drivingHours +
      trip.dutyTotals.onDutyHours
    ).toFixed(2)} hrs`,
  ];
  doc.setFont("helvetica", "bold");
  doc.text("Daily Status Totals", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  for (const line of totalsLines) {
    ensureSpace(14);
    doc.text(line, margin, y, { maxWidth: maxW });
    y += 14;
  }

  // Remarks
  section("Remarks & Duty Changes");
  const remarks = buildRemarks(trip);
  for (const r of remarks) {
    ensureSpace(28);
    doc.setFont("helvetica", "bold");
    doc.text(`${r.time}  —  ${r.status}`, margin, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.text(`${r.location}  •  ${r.description}`, margin, y, { maxWidth: maxW });
    y += 16;
  }

  doc.save(`${trip.id}.pdf`);
}

