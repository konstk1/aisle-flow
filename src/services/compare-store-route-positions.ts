import type { StoreRoutePosition } from "@/domain/store-route";

export function compareStoreRoutePositions(
  first: StoreRoutePosition,
  second: StoreRoutePosition,
) {
  return (
    first.pathOrder - second.pathOrder ||
    (first.positionWithinSection ?? 0) - (second.positionWithinSection ?? 0)
  );
}
