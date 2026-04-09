import axios from "axios";
import AxiosMockAdapter from "axios-mock-adapter";
import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env", () => ({
  env: { apiUrl: "http://example.test" },
}));

import { createTripPlan, getTripById, listTrips } from "./tripApi";

describe("tripApi", () => {
  it("createTripPlan POSTs and returns response body", async () => {
    const mock = new AxiosMockAdapter(axios);
    mock
      .onPost("http://example.test/api/trip/plan/")
      .reply(201, {
        id: "1",
        tripNo: 1900,
        createdAt: "2026-04-09T00:00:00Z",
        result: { pickup: { city: "A", state: "AA" } },
      });

    const data = await createTripPlan({
      currentLocation: "A",
      pickupLocation: "A",
      dropoffLocation: "B",
      cycleHoursUsed: 0,
    });

    expect(data.id).toBe("1");
    expect(data.pickup.city).toBe("A");
    mock.restore();
  });

  it("listTrips GETs and returns response body", async () => {
    const mock = new AxiosMockAdapter(axios);
    mock.onGet("http://example.test/api/trip/").reply(200, [
      { id: "t1", tripNo: 1900, createdAt: "2026-04-09T00:00:00Z", result: {} },
    ]);

    const data = await listTrips();
    expect(data).toHaveLength(1);
    expect(data[0]?.id).toBe("t1");
    mock.restore();
  });

  it("getTripById GETs and returns response body", async () => {
    const mock = new AxiosMockAdapter(axios);
    mock
      .onGet("http://example.test/api/trip/abc/")
      .reply(200, { id: "abc", tripNo: 1900, createdAt: "2026-04-09T00:00:00Z", result: {} });

    const data = await getTripById("abc");
    expect(data.id).toBe("abc");
    mock.restore();
  });
});

