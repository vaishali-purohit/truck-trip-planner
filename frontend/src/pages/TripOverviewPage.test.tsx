import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// Avoid requiring real VITE_API_URL during tests.
vi.mock("../config/env", () => ({
  env: { apiUrl: "http://example.test" },
}));

// Mapbox / canvas-heavy component: stub out for jsdom.
vi.mock("../components/map/RouteMapPanel", () => ({
  default: () => <div data-testid="route-map" />,
}));

// Keep tests focused: stub purely presentational cards.
vi.mock("../components/overview/DailyStatusTotalsCard", () => ({
  default: () => <div />,
}));
vi.mock("../components/overview/TripLifecycleSummaryCard", () => ({
  default: () => <div />,
}));
vi.mock("../components/overview/DutyStatusCard", () => ({
  default: () => <div />,
}));
vi.mock("../components/overview/RemarksCard", () => ({
  default: () => <div />,
}));

// Autocomplete triggers debounced location search; stub to keep tests offline.
vi.mock("../api/locationApi", () => ({
  searchLocations: vi.fn().mockResolvedValue([]),
}));

const createTripPlan = vi.fn();
const getTripByTripNo = vi.fn();

vi.mock("../api/tripApi", () => ({
  createTripPlan: (...args: unknown[]) => createTripPlan(...args),
  getTripByTripNo: (...args: unknown[]) => getTripByTripNo(...args),
}));

import TripOverviewPage from "./TripOverviewPage";

describe("TripOverviewPage", () => {
  it("renders draft header when no trip number in URL", async () => {
    render(
      <MemoryRouter initialEntries={["/overview"]}>
        <Routes>
          <Route path="/overview" element={<TripOverviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Trip Plan & HOS Overview \(Draft\)/i),
    ).toBeInTheDocument();
  });

  it("loads trip when trip number is present in URL", async () => {
    getTripByTripNo.mockResolvedValueOnce({
      id: "abc",
      tripNo: 1900,
      dateISO: "2026-01-01",
      pickup: { city: "Chicago", state: "IL" },
      dropoff: { city: "Denver", state: "CO" },
      totalDistanceMi: 0,
      drivingHours: 0,
      totalTripTimeHours: 0,
      compliance: "compliant",
      driverLogs: "completed",
      carrierName: "",
      mainOfficeAddress: "",
      totalMilesToday: 0,
      dutyTotals: { offDutyHours: 0, sleeperBerthHours: 0, drivingHours: 0, onDutyHours: 0 },
      estimatedArrivalISO: "2026-01-01T00:00:00Z",
      stopsCount: 0,
      stopPlan: { fuelStops: 0, breakStops: 0, breakMinutes: 0, stopCount: 0 },
      routeInstructions: [],
      eldLogSheets: [{ dateISO: "2026-01-01", dutyTotals: { offDutyHours: 0, sleeperBerthHours: 0, drivingHours: 0, onDutyHours: 0 }, segments: [] }],
      inputs: { currentLocation: "Chicago, IL", pickupLocation: "Chicago, IL", dropoffLocation: "Denver, CO", cycleHoursUsed: 0 },
    });

    render(
      <MemoryRouter initialEntries={["/overview/1900"]}>
        <Routes>
          <Route path="/overview/:tripNo" element={<TripOverviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Trip Plan & HOS Overview/i)).toBeInTheDocument();
    expect(getTripByTripNo).toHaveBeenCalledWith(1900);
    expect(await screen.findByText("1900")).toBeInTheDocument();
  });

  it("submits createTripPlan when user clicks Generate", async () => {
    createTripPlan.mockResolvedValueOnce({
      id: "new-id",
      tripNo: 2001,
      dateISO: "2026-01-01",
      pickup: { city: "Chicago", state: "IL" },
      dropoff: { city: "Denver", state: "CO" },
      totalDistanceMi: 0,
      drivingHours: 0,
      totalTripTimeHours: 0,
      compliance: "compliant",
      driverLogs: "completed",
      carrierName: "",
      mainOfficeAddress: "",
      totalMilesToday: 0,
      dutyTotals: { offDutyHours: 0, sleeperBerthHours: 0, drivingHours: 0, onDutyHours: 0 },
      estimatedArrivalISO: "2026-01-01T00:00:00Z",
      stopsCount: 0,
      stopPlan: { fuelStops: 0, breakStops: 0, breakMinutes: 0, stopCount: 0 },
      routeInstructions: [],
      eldLogSheets: [{ dateISO: "2026-01-01", dutyTotals: { offDutyHours: 0, sleeperBerthHours: 0, drivingHours: 0, onDutyHours: 0 }, segments: [] }],
      inputs: { currentLocation: "", pickupLocation: "", dropoffLocation: "", cycleHoursUsed: 0 },
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/overview"]}>
        <Routes>
          <Route path="/overview" element={<TripOverviewPage />} />
          <Route path="/overview/:tripNo" element={<div data-testid="nav-ok" />} />
        </Routes>
      </MemoryRouter>,
    );

    const routeCard = within(container)
      .getByText("Route Details")
      .closest(".MuiPaper-root");
    expect(routeCard).toBeTruthy();
    const routeForm = within(routeCard as HTMLElement);
    const comboboxes = routeForm.getAllByRole("combobox");
    expect(comboboxes).toHaveLength(3);
    await userEvent.type(comboboxes[0]!, "Chicago, IL");
    await userEvent.type(comboboxes[1]!, "Chicago, IL");
    await userEvent.type(comboboxes[2]!, "Denver, CO");
    await userEvent.clear(routeForm.getByRole("spinbutton"));
    await userEvent.type(routeForm.getByRole("spinbutton"), "10");

    const btns = await screen.findAllByRole("button", { name: /generate route & hos logs/i });
    await userEvent.click(btns[0]!);

    expect(createTripPlan).toHaveBeenCalledTimes(1);
  });
});

