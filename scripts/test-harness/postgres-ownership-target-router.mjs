import {
  appendOwnershipEvent,
  assertClusterLeaseOwner,
  clusterKey as ownershipClusterKey,
} from "./ownership-state.mjs";
import { postgresEndpointIdentity } from "./postgres-endpoint.mjs";

const routerSymbol = Symbol.for("vaylet.test.postgres.ownership.targets");

function clusterKey(identity) {
  return `${identity.host}:${identity.port}`;
}

// pg.Client exposes the effective connectionParameters. For pg.Pool, construct
// a never-connected client to let pg resolve config and PG* defaults exactly.
// No query is issued, and neither a credential nor the URL is logged.
export function postgresEffectiveQueryTarget(instance, Client) {
  if (instance.options?.connectionString !== undefined) {
    // Client resolves config overrides, but a non-PG/ambiguous source scheme
    // must never become an owned target merely by coincidental host/DB text.
    postgresEndpointIdentity(instance.options.connectionString);
  }
  const parameters =
    instance.options === undefined
      ? instance.connectionParameters
      : new Client(instance.options).connectionParameters;
  if (!parameters || typeof parameters.host !== "string") {
    throw new Error("PostgreSQL test query target cannot be verified.");
  }
  if (!/^[a-zA-Z0-9_.:[\]-]+$/.test(parameters.host)) {
    throw new Error("PostgreSQL test query target cannot be verified.");
  }
  const host =
    parameters.host.includes(":") && !parameters.host.startsWith("[")
      ? `[${parameters.host}]`
      : parameters.host;
  try {
    return postgresEndpointIdentity(
      `postgresql://${host}:${parameters.port ?? 5432}/${encodeURIComponent(parameters.database ?? "")}`,
    );
  } catch {
    throw new Error("PostgreSQL test query target cannot be verified.");
  }
}

export function createPostgresOwnershipRouter({
  pg,
  primaryDatabaseUrl,
  appendPrimaryEvent,
}) {
  if (pg[routerSymbol]) {
    throw new Error("PostgreSQL ownership router is already installed.");
  }
  const primary = postgresEndpointIdentity(primaryDatabaseUrl);
  const primaryLedgerKey = ownershipClusterKey(primaryDatabaseUrl);
  const routes = new Map([
    [clusterKey(primary), { appendEvent: appendPrimaryEvent }],
  ]);
  const Client = pg.Client;
  const router = {
    resolve(instance) {
      const actual = postgresEffectiveQueryTarget(instance, Client);
      const route = routes.get(clusterKey(actual));
      if (route === undefined) {
        throw new Error(
          "PostgreSQL test query target is not an owned cluster.",
        );
      }
      if (route.databaseUrl !== undefined) {
        assertClusterLeaseOwner({
          databaseUrl: route.databaseUrl,
          runId: route.runId,
          stateRoot: route.stateRoot,
        });
      }
      return route.appendEvent;
    },
    registerSecondary({ databaseUrl, runId, stateRoot }) {
      if (typeof runId !== "string" || runId.length === 0) {
        throw new Error("Secondary PostgreSQL ownership requires a run ID.");
      }
      const secondary = postgresEndpointIdentity(databaseUrl);
      const key = clusterKey(secondary);
      if (ownershipClusterKey(databaseUrl) === primaryLedgerKey) {
        throw new Error(
          "Secondary PostgreSQL target shares the primary ownership ledger.",
        );
      }
      if (routes.has(key)) {
        throw new Error(
          "Secondary PostgreSQL ownership target is already registered.",
        );
      }
      // Docker target attestation is the caller's prerequisite. The acquired
      // cluster lease here proves the separate target/run identity is active.
      assertClusterLeaseOwner({ databaseUrl, runId, stateRoot });
      const route = {
        databaseUrl,
        runId,
        stateRoot,
        appendEvent: (event) =>
          appendOwnershipEvent({ databaseUrl, runId, event, stateRoot }),
      };
      routes.set(key, route);
      return () => {
        if (routes.get(key) === route) routes.delete(key);
      };
    },
  };
  pg[routerSymbol] = router;
  return router;
}

export function registerAttestedPostgresOwnershipTarget({
  pg,
  databaseUrl,
  runId,
  stateRoot,
}) {
  const router = pg?.[routerSymbol];
  if (!router) {
    throw new Error("PostgreSQL ownership router is not installed.");
  }
  return router.registerSecondary({ databaseUrl, runId, stateRoot });
}
