import { setTimeout as pause } from "node:timers/promises";

import { withRelease } from "./postgres-test-release.mjs";
import { postgresEndpointIdentity } from "./postgres-endpoint.mjs";
import { postgresEffectiveQueryTarget } from "./postgres-ownership-target-router.mjs";

const poolCloserSymbol = Symbol.for("vaylet.test.postgres.close-owned-pools");

function registeredEndpoint(pool, Client) {
  try {
    return postgresEffectiveQueryTarget(pool, Client).key;
  } catch {
    return undefined;
  }
}

async function closeWithDeadline(pool, timeoutMs) {
  if (pool.ended) return;
  const controller = new AbortController();
  const timeout = pause(timeoutMs, undefined, {
    signal: controller.signal,
  }).then(() => {
    throw new Error(
      "Owned PostgreSQL test pool did not close before deadline.",
    );
  });
  try {
    if (pool.ending) {
      await Promise.race([
        (async () => {
          while (!pool.ended && !controller.signal.aborted) {
            await pause(20, undefined, { signal: controller.signal }).catch(
              () => undefined,
            );
          }
        })(),
        timeout,
      ]);
    } else {
      await Promise.race([pool.end(), timeout]);
    }
  } finally {
    controller.abort();
  }
}

// Pool instances can be numerous when separately privileged writers coexist.
// The hard capacity guarantee is the sum of their declared connection maxima.
export function installBoundedPostgresPools({ appendEvent, pg, profile }) {
  const OriginalPool = pg.Pool;
  const OriginalClient = pg.Client;
  let activePools = 0;
  let reservedPoolConnections = 0;
  const trackedPools = new Map();

  // Shared test-only hook: closes only live pools connected to one exact
  // generated fixture DB, including providers created before Nest boot fails.
  globalThis[poolCloserSymbol] = async (targetUrl) => {
    const target = postgresEndpointIdentity(targetUrl);
    const owned = [];
    for (const [pool, registered] of trackedPools) {
      const effective = registeredEndpoint(pool, OriginalClient);
      if (registered === target.key || effective === target.key) {
        if (registered !== effective) {
          throw new Error("PostgreSQL owned pool endpoint changed after registration.");
        }
        owned.push(pool);
      }
    }
    const results = await Promise.allSettled(
      owned.map((pool) => closeWithDeadline(pool, 5_000)),
    );
    const errors = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        "Owned PostgreSQL test pool cleanup incomplete.",
      );
    }
  };

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
        trackedPools.set(this, registeredEndpoint(this, OriginalClient));
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
        trackedPools.delete(this);
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
