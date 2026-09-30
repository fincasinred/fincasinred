export interface Wgs84Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface SiarStationCatalogEntry {
  readonly stationId: string;
  readonly coordinates: Wgs84Coordinates;
  readonly active: boolean;
}

export interface SiarStationResolutionInput {
  readonly farmCoordinates: Wgs84Coordinates;
  readonly catalog: readonly SiarStationCatalogEntry[];
}

export interface SiarStationResolutionSelection {
  readonly stationId: string;
  readonly distanceKm: number;
  readonly stationCoordinates: Wgs84Coordinates;
  readonly reason: "NEAREST_ACTIVE_SIAR_STATION";
  readonly provenance: "SIAR_OFFICIAL_STATION_CATALOG";
}

export type SiarStationResolutionResult =
  | {
      readonly status: "RESOLVED";
      readonly selection: Readonly<SiarStationResolutionSelection>;
    }
  | {
      readonly status: "PENDING";
      readonly missingFields: readonly ["siar.stationCatalog" | "siar.activeStation"];
    }
  | {
      readonly status: "BLOCKED";
      readonly issues: readonly ["farmCoordinates" | "stationCoordinates"];
    };

const EARTH_RADIUS_KM = 6371.0088;

function isValidCoordinates(value: Wgs84Coordinates): boolean {
  return (
    Number.isFinite(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    Number.isFinite(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180
  );
}

function compareStations(
  left: SiarStationCatalogEntry,
  right: SiarStationCatalogEntry,
): number {
  if (left.stationId < right.stationId) return -1;
  if (left.stationId > right.stationId) return 1;
  if (left.coordinates.latitude !== right.coordinates.latitude) {
    return left.coordinates.latitude - right.coordinates.latitude;
  }
  return left.coordinates.longitude - right.coordinates.longitude;
}

function haversineDistanceKm(
  origin: Wgs84Coordinates,
  destination: Wgs84Coordinates,
): number {
  const latitudeDelta = (destination.latitude - origin.latitude) * Math.PI / 180;
  const longitudeDelta = (destination.longitude - origin.longitude) * Math.PI / 180;
  const originLatitude = origin.latitude * Math.PI / 180;
  const destinationLatitude = destination.latitude * Math.PI / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

export function resolveSiarStation(
  input: Readonly<SiarStationResolutionInput>,
): Readonly<SiarStationResolutionResult> {
  if (!isValidCoordinates(input.farmCoordinates)) {
    return Object.freeze({
      status: "BLOCKED",
      issues: ["farmCoordinates"] as const,
    });
  }

  if (input.catalog.length === 0) {
    return Object.freeze({
      status: "PENDING",
      missingFields: ["siar.stationCatalog"] as const,
    });
  }

  const activeStations = input.catalog
    .filter((station) => station.active)
    .sort(compareStations);

  if (activeStations.some((station) => !isValidCoordinates(station.coordinates))) {
    return Object.freeze({
      status: "BLOCKED",
      issues: ["stationCoordinates"] as const,
    });
  }

  const nearest = activeStations.reduce<SiarStationCatalogEntry | undefined>(
    (current, candidate) => {
      if (current === undefined) return candidate;
      const currentDistance = haversineDistanceKm(
        input.farmCoordinates,
        current.coordinates,
      );
      const candidateDistance = haversineDistanceKm(
        input.farmCoordinates,
        candidate.coordinates,
      );
      return candidateDistance < currentDistance ? candidate : current;
    },
    undefined,
  );

  if (nearest === undefined) {
    return Object.freeze({
      status: "PENDING",
      missingFields: ["siar.activeStation"] as const,
    });
  }

  return Object.freeze({
    status: "RESOLVED",
    selection: Object.freeze({
      stationId: nearest.stationId,
      distanceKm: haversineDistanceKm(input.farmCoordinates, nearest.coordinates),
      stationCoordinates: Object.freeze({ ...nearest.coordinates }),
      reason: "NEAREST_ACTIVE_SIAR_STATION",
      provenance: "SIAR_OFFICIAL_STATION_CATALOG",
    }),
  });
}