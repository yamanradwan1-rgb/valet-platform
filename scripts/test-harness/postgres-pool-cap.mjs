import { withRelease } from "./postgres-test-release.mjs";

// Pool instances can be numerous when separately privileged writers coexist.
// The hard capacity guarantee is the sum of their declared connection maxima.
export function installBoundedPostgresPools({ appendEvent, pg, profile }) {
  const OriginalPool = pg.Pool;
  let activePools = 0;
  let reservedPoolConnections = 0;

  class BoundedTestPool extends OriginalPool {
    #counted = false;
    #reserved = 0;

    constructor(config = {}) {
      const requested = config.max;
      const appliedMax = requested ?? profile.poolMax;
      if (
        !Number.isSafeInteger(appliedMax) ||
        appliedMax < 1 ||
        appliedMax > profile.poolMax
      ) {
        throw new Error(
          `PostgreSQL test pool requested max=${String(requested)} above ${profile.name} cap=${profile.poolMax} or invalid.`,
        );
      }
      if (activePools >= profile.poolCount) {
        throw new Error(
          `PostgreSQL test profile ${profile.name} exceeded poolCount=${profile.poolCount}.`,
        );
      }
      if (reservedPoolConnections + appliedMax > profile.poolConnectionBudget) {
        throw new Error(
          `PostgreSQL test profile ${profile.name} exceeded poolConnectionBudget=${profile.poolConnectionBudget}.`,
        );
      }
      super({ ...config, max: appliedMax });
      activePools += 1;
      reservedPoolConnections += appliedMax;
      this.#reserved = appliedMax;
      this.#counted = true;
      try {
        appendEvent({
          type: "pool-registered",
          profile: profile.name,
          activePools,
          reservedPoolConnections,
          appliedMax,
          requestedMax: requested ?? null,
        });
      } catch (error) {
        this.#counted = false;
        activePools -= 1;
        reservedPoolConnections -= appliedMax;
        void super.end().catch(() => undefined);
        throw error;
      }
    }

    end(...args) {
      return withRelease(super.end.bind(this), args, () => {
        if (!this.#counted) return;
        this.#counted = false;
        activePools -= 1;
        reservedPoolConnections -= this.#reserved;
        appendEvent({
          type: "pool-released",
          profile: profile.name,
          activePools,
          reservedPoolConnections,
        });
      });
    }
  }

  pg.Pool = BoundedTestPool;
}
