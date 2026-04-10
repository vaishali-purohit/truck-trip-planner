export type ComplianceStatus = "compliant" | "warning";

export type TripDriverLogStatus = "completed" | "pending";

export interface TripStop {
  city: string;
  state: string;
}

export type LngLat = [number, number];

export interface TripRoute {
  line: {
    type: "LineString";
    coordinates: LngLat[];
  };
  pickupLngLat: LngLat;
  dropoffLngLat: LngLat;
  /** Human-readable place for pickup coordinates (e.g. City, ST). */
  pickupLocationName?: string;
  /** Human-readable place for drop-off coordinates (e.g. City, ST). */
  dropoffLocationName?: string;
}

export interface TripSummary {
  id: string;
  tripNo?: number;
  dateISO: string;
  driverName: string;
  truckId: string;
  trailerId?: string;
  pickup: TripStop;
  dropoff: TripStop;
  totalDistanceMi: number;
  drivingHours: number;
  totalTripTimeHours: number;
  compliance: ComplianceStatus;
  driverLogs: TripDriverLogStatus;
}

export interface DutyStatusTotals {
  offDutyHours: number;
  sleeperBerthHours: number;
  drivingHours: number;
  onDutyHours: number;
}

export interface TripStopPlan {
  fuelStops: number;
  breakStops: number;
  breakMinutes: number;
  stopCount: number;
}

export type EldSegmentStatus = "Off Duty" | "Sleeper" | "Driving" | "On Duty";

export interface EldLogSegment {
  status: EldSegmentStatus;
  fromHour: number;
  toHour: number;
  label?: string;
  /** Place line for remarks (e.g. city, ST). */
  location?: string;
}

export interface EldLogSheet {
  dateISO: string;
  dutyTotals: DutyStatusTotals;
  segments?: EldLogSegment[];
  /** 1-based day number within the trip. */
  dayIndex?: number;
  fromLocation?: string;
  toLocation?: string;
  totalMilesDrivingToday?: number;
}

export interface TripInputs {
  currentLocation: string;
  pickupLocation: string;
  dropoffLocation: string;
  cycleHoursUsed: number;
}

export interface RouteInstruction {
  instruction: string;
  distance_mi: number;
  duration_min: number;
  road_name: string;
}

export interface TripDetails extends TripSummary {
  carrierName: string;
  mainOfficeAddress: string;
  totalMilesToday: number;
  dutyTotals: DutyStatusTotals;
  estimatedArrivalISO: string;
  stopsCount: number;
  /** Number of daily EOD log sheets (driving days). */
  totalLogDays?: number;
  route?: TripRoute;
  stopPlan?: TripStopPlan;
  routeInstructions?: RouteInstruction[];
  eldLogSheets?: EldLogSheet[];
  inputs?: TripInputs;
}
