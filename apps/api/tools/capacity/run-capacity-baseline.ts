import { performance } from "node:perf_hooks";

import { Pool } from "pg";

import { migrationClientConfig } from "../../../../packages/database/scripts/database-connection-policy.mjs";
import { loadBootstrapEnvironment } from "../local-dev/local-dev-environment";
import { capacityLogin, parseCapacityAuth } from "./capacity-auth";
import { capacityEnvironment } from "./capacity-environment";
import {
  CAPACITY_COHORT,
  inspectCapacityEffects,
  seedCapacityFixture,
} from "./capacity-fixture";
import { requestJson, runConcurrent } from "./capacity-http";
import { writeCapacityResult } from "./capacity-result";
import { CapacitySafetyMonitor } from "./capacity-safety";
import { summarize } from "./capacity-statistics";
import {
  validateCapacityDetail,
  validateCapacityQueue,
} from "./capacity-validation";
import type { AuthenticatedClient, WorkloadResult } from "./capacity-types";

const API_ORIGIN = "http://127.0.0.1:3001";

async function main(): Promise<void> {
  if (process.env.CAPACITY_CONFIRM_LOCAL !== "mob-025a") {
    throw new Error(
      "Set CAPACITY_CONFIRM_LOCAL=mob-025a for the guarded local run.",
    );
  }
  const loaded = loadBootstrapEnvironment();
  const pool = new Pool({
    ...migrationClientConfig(loaded.environment.migration, "development"),
    max: 3,
  });
  const apiPidRaw = process.env.CAPACITY_API_PID;
  const apiPid = apiPidRaw === undefined ? undefined : Number(apiPidRaw);
  if (apiPid !== undefined && (!Number.isInteger(apiPid) || apiPid <= 1)) {
    throw new Error("CAPACITY_API_PID must be a positive process ID.");
  }
  const monitor = new CapacitySafetyMonitor(pool, apiPid);
  const workloads: WorkloadResult[] = [];
  const startedAt = new Date().toISOString();
  try {
    await monitor.snapshot();
    const environment = await capacityEnvironment(pool);
    const fixture = await seedCapacityFixture(pool);

    const coldStarted = performance.now();
    const cold = await capacityLogin(API_ORIGIN, fixture.clients[0]!.email);
    if (cold.auth === undefined)
      throw new Error("Synthetic cold login failed.");
    monitor.record(cold.sample);
    const coldDuration = performance.now() - coldStarted;
    workloads.push({
      concurrency: 1,
      durationMs: Number(coldDuration.toFixed(2)),
      maximumInFlight: 1,
      name: "first-auth-request-api-warm",
      retries: 0,
      summary: summarize([cold.sample], coldDuration),
    });

    const tokens: Array<
      { accessToken: string; refreshToken: string } | undefined
    > = [];
    const authBurst = await runConcurrent(
      "authentication-burst",
      fixture.clients.length,
      5,
      monitor,
      async (index) => {
        const result = await capacityLogin(
          API_ORIGIN,
          fixture.clients[index]!.email,
        );
        if (result.auth !== undefined) tokens[index] = result.auth;
        return result.sample;
      },
    );
    workloads.push(authBurst.result);
    if (
      tokens.length !== fixture.clients.length ||
      fixture.clients.some((_, index) => tokens[index] === undefined)
    ) {
      throw new Error(
        "Authentication burst did not produce the complete client cohort.",
      );
    }
    const clients: AuthenticatedClient[] = fixture.clients.map(
      (client, index) => {
        const token = tokens[index];
        if (token === undefined)
          throw new Error("Authentication token is missing.");
        return { ...client, ...token };
      },
    );

    const refreshBurst = await runConcurrent(
      "native-refresh-rotation-burst",
      clients.length,
      clients.length,
      monitor,
      async (index) => {
        const client = clients[index]!;
        const response = await requestJson(
          API_ORIGIN,
          "auth-refresh",
          "POST",
          "/v1/staff/auth/native/refresh",
          { body: { refreshToken: client.refreshToken } },
        );
        if (response.sample.status === 200)
          Object.assign(client, parseCapacityAuth(response.body));
        return response.sample;
      },
    );
    workloads.push(refreshBurst.result);

    for (const [concurrency, count] of [
      [1, 50],
      [5, 250],
      [10, 500],
      [20, 1_000],
    ] as const) {
      const run = await runConcurrent(
        `queue-read-step-${concurrency}`,
        count,
        concurrency,
        monitor,
        async (index) => {
          const client = clients[index % clients.length]!;
          const response = await requestJson(
            API_ORIGIN,
            "task-queue",
            "GET",
            `/v1/staff/tasks/queue?locationId=${client.locationId}`,
            { token: client.accessToken },
          );
          if (
            response.sample.status === 200 &&
            !validateCapacityQueue(response.body, client)
          )
            throw new Error("Task queue omitted the representative fixture.");
          return response.sample;
        },
      );
      workloads.push(run.result);
    }

    const detail = await runConcurrent(
      "session-detail-read-wave",
      100,
      20,
      monitor,
      async (index) => {
        const client = clients[index % clients.length]!;
        const sessionId =
          client.allowedSessionIds[Math.floor(index / clients.length)]!;
        const response = await requestJson(
          API_ORIGIN,
          "session-detail",
          "GET",
          `/v1/staff/valet-sessions/${sessionId}`,
          { token: client.accessToken },
        );
        if (response.sample.status === 200)
          validateCapacityDetail(response.body, client.locationId, sessionId);
        return response.sample;
      },
    );
    workloads.push(detail.result);

    const command = await runConcurrent(
      "parking-task-idempotency-burst",
      CAPACITY_COHORT.locations * 5,
      CAPACITY_COHORT.locations * 5,
      monitor,
      async (index) => {
        const location = Math.floor(index / 5);
        const client =
          clients[location * CAPACITY_COHORT.employeesPerLocation]!;
        const response = await requestJson(
          API_ORIGIN,
          "parking-task-queue",
          "POST",
          `/v1/staff/valet-sessions/${client.sentinelSessionId}/parking-task/queue`,
          { body: {}, token: client.accessToken },
        );
        return response.sample;
      },
    );
    workloads.push(command.result);
    const commandFinishedAt = performance.now();
    const effects = await inspectCapacityEffects(pool);
    if (
      effects.sentinelTasks !== CAPACITY_COHORT.locations ||
      effects.dispatchEvents !== CAPACITY_COHORT.locations
    ) {
      throw new Error(
        "Hard-zero failure: duplicate protected effect detected.",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const stalenessSamples: number[] = [];
    const poll = await runConcurrent(
      "five-second-poll-observation",
      clients.length,
      clients.length,
      monitor,
      async (index) => {
        const client = clients[index]!;
        const response = await requestJson(
          API_ORIGIN,
          "task-queue",
          "GET",
          `/v1/staff/tasks/queue?locationId=${client.locationId}`,
          { token: client.accessToken },
        );
        if (
          response.sample.status === 200 &&
          validateCapacityQueue(response.body, client, true)
        ) {
          stalenessSamples.push(performance.now() - commandFinishedAt);
        }
        return response.sample;
      },
    );
    workloads.push(poll.result);

    const reconnectStarted = performance.now();
    const recoveryMs: number[] = [];
    const reconnect = await runConcurrent(
      "reconnect-authoritative-reread-wave",
      clients.length,
      clients.length,
      monitor,
      async (index) => {
        const client = clients[index]!;
        const response = await requestJson(
          API_ORIGIN,
          "operational-context",
          "GET",
          "/v1/staff/operational-context",
          { token: client.accessToken },
        );
        if (response.sample.status === 200)
          recoveryMs.push(performance.now() - reconnectStarted);
        return response.sample;
      },
    );
    workloads.push(reconnect.result);

    const outputPath = await writeCapacityResult({
      clients: clients.length,
      effects,
      environment,
      outputRoot: loaded.repositoryRoot,
      recoveryMs,
      safetyMonitor: monitor,
      stalenessMs: stalenessSamples,
      startedAt,
      workloads,
    });
    process.stdout.write(`${outputPath}\n`);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Capacity run failed."}\n`,
  );
  process.exitCode = 1;
});
