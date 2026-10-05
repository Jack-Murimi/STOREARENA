import type { Branch } from "./types";
import { DuplicateCodeError, InactiveBranchError, UnknownEntityError } from "./errors";

/** Branches gate operations, so they are held separately from the catalogue. */
export class BranchRegistry {
  private readonly branches = new Map<string, Branch>();

  add(branch: Branch): this {
    if ([...this.branches.values()].some((b) => b.code === branch.code)) {
      throw new DuplicateCodeError("branch", branch.code);
    }
    this.branches.set(branch.id, { ...branch });
    return this;
  }

  require(id: string): Branch {
    const found = this.branches.get(id);
    if (!found) throw new UnknownEntityError("branch", id);
    return found;
  }

  /** Throws when the branch exists but is closed for trading. */
  requireActive(id: string): Branch {
    const branch = this.require(id);
    if (!branch.active) throw new InactiveBranchError(id);
    return branch;
  }

  list(): Branch[] {
    return [...this.branches.values()];
  }
}
