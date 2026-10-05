import type { StockLocation } from "./types";
import { LocationKind } from "./types";
import {
  DuplicateCodeError,
  InactiveLocationError,
  InvalidLocationError,
  UnknownEntityError,
} from "./errors";

/**
 * Every place stock can sit: fixed branches and riders' vans.
 *
 * Vans are first-class stock locations on purpose. If a rider's load were only
 * a memo, the branch count would drop when the van left and nobody could say
 * what was on the road — which is how "the cashier did not post it" starts.
 */
export class LocationRegistry {
  private readonly locations = new Map<string, StockLocation>();

  add(location: StockLocation): this {
    if ([...this.locations.values()].some((l) => l.code === location.code)) {
      throw new DuplicateCodeError("location", location.code);
    }
    if (location.kind === LocationKind.Van) {
      if (!location.homeLocationId) {
        throw new InvalidLocationError(
          location.id,
          "a van must belong to a branch (homeLocationId)",
        );
      }
      if (!location.rider) {
        throw new InvalidLocationError(
          location.id,
          "a van must have a rider responsible for it",
        );
      }
    } else if (location.homeLocationId) {
      throw new InvalidLocationError(
        location.id,
        "only a van has a homeLocationId",
      );
    }
    this.locations.set(location.id, { ...location });
    return this;
  }

  require(id: string): StockLocation {
    const found = this.locations.get(id);
    if (!found) throw new UnknownEntityError("location", id);
    return found;
  }

  /** Throws when the location exists but is closed for trading. */
  requireActive(id: string): StockLocation {
    const location = this.require(id);
    if (!location.active) throw new InactiveLocationError(id);
    return location;
  }

  list(): StockLocation[] {
    return [...this.locations.values()];
  }

  branches(): StockLocation[] {
    return this.list().filter((l) => l.kind === LocationKind.Branch);
  }

  vans(): StockLocation[] {
    return this.list().filter((l) => l.kind === LocationKind.Van);
  }

  /** The vans that belong to one branch. */
  vansOf(branchId: string): StockLocation[] {
    return this.vans().filter((v) => v.homeLocationId === branchId);
  }
}
