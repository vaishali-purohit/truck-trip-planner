import axios from "axios";
import type { TripDetails, TripSummary } from "../types/trip";
import { env } from "../config/env";

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
    env.apiKey ? { headers: { "X-API-Key": env.apiKey } } : undefined,
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

export async function getTripById(id: string): Promise<TripDetails> {
  const res = await axios.get(
    `${env.apiUrl}/api/trip/${id}/`,
    env.apiKey ? { headers: { "X-API-Key": env.apiKey } } : undefined,
  );
  return unwrapTrip<TripDetails>(res.data as TripWrapper<TripDetails>);
}
