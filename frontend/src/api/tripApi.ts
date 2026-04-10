import axios from "axios";
import type { TripDetails, TripSummary } from "../types/trip";
import { env } from "../config/env";

/** ORS geocode + directions can be slow; align with gunicorn ``--timeout`` (e.g. 120s on Render). */
const TRIP_PLAN_TIMEOUT_MS = 120_000;

type TripWrapper<T> = {
  id: string;
  tripNo?: number;
  createdAt?: string;
  result: T;
};

function unwrapTrip<T extends object>(w: TripWrapper<T>): T & { id: string; tripNo?: number } {
  return { id: w.id, tripNo: w.tripNo, ...w.result };
}

export type TripPlanRequest = {
  currentLocation: string;
  pickupLocation: string;
  dropoffLocation: string;
  cycleHoursUsed: number;
};

export async function createTripPlan(payload: TripPlanRequest): Promise<TripDetails> {
  const res = await axios.post(
    `${env.apiUrl}/api/trip/plan/`,
    payload,
    {
      timeout: TRIP_PLAN_TIMEOUT_MS,
      ...(env.apiKey ? { headers: { "X-API-Key": env.apiKey } } : {}),
    },
  );
  return unwrapTrip<TripDetails>(res.data as TripWrapper<TripDetails>);
}

export async function listTrips(): Promise<TripSummary[]> {
  const res = await axios.get(
    `${env.apiUrl}/api/trip/`,
    env.apiKey ? { headers: { "X-API-Key": env.apiKey } } : undefined,
  );
  const items = res.data as TripWrapper<TripSummary>[];
  return items.map((w) => unwrapTrip<TripSummary>(w));
}

export async function getTripByTripNo(tripNo: number): Promise<TripDetails> {
  const res = await axios.get(
    `${env.apiUrl}/api/trip/${tripNo}/`,
    env.apiKey ? { headers: { "X-API-Key": env.apiKey } } : undefined,
  );
  return unwrapTrip<TripDetails>(res.data as TripWrapper<TripDetails>);
}
