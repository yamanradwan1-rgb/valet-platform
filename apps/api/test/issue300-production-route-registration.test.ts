import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Module } from "@nestjs/common";
import { MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { NestFactory } from "@nestjs/core";
import type { AuditInvestigationSearchQuery } from "@valet/contracts";
import type { PostgresTransaction } from "../src/common/database/postgres";

import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import { MONOTONIC_CLOCK, OPERATION_OBSERVER }
  from "../src/common/observability/operation-observability";
import { STAFF_SESSION_CONTEXT_RESOLVER } from "../src/modules/auth/staff-session-context";
import { ManagementModule } from "../src/modules/management/management.module";
import { ManagementAuditController } from "../src/modules/management/management-audit.controller";
import { AuditInvestigationSearchController } from "../src/modules/management/audit-investigation/search/audit-investigation-search.controller";
import { AuditInvestigationSearchService, searchAuditInvestigationSessions }
  from "../src/modules/management/audit-investigation/search/audit-investigation-search.service";
import { AuditInvestigationTimelineController, AuditInvestigationTimelineService } from "../src/modules/management/audit-investigation/timeline/timeline.controller";

const ids = {
  org: "11000000-0000-4000-8000-000000000001",
  location: "11000000-0000-4000-8000-000000000002",
  session: "11000000-0000-4000-8000-000000000003",
  event: "11000000-0000-4000-8000-000000000004",
};
const base = `/v1/staff/management/organizations/${ids.org}/locations/${ids.location}/audit-investigations`;
const auth = { Authorization: "Bearer isolated-test-only-no-real-login" };

// The HTTP smoke checks ACTUAL Nest decorators/router in production mode,
// but deliberately stubs database and Staff resolution. It is NOT genuine
// CA/LM MFA or authorization acceptance (which requires owned real PG).
@Module({
  controllers: [AuditInvestigationSearchController, AuditInvestigationTimelineController],
  providers: [
    { provide: AuditInvestigationSearchService, useValue: {
      search: async (_context: unknown, organizationId: string,
        locationId: string, query: AuditInvestigationSearchQuery) => {
        if (query.make !== "Toyota") return { route: "sessions" };
        // Only the DB result is simulated. Run the *real* production Search
        // pagination guard through the real Nest HTTP error transport.
        const tx = { query: async () => ({ rows: Array(26).fill({}) }) } as unknown as PostgresTransaction;
        return searchAuditInvestigationSessions(tx, {
          organizationId, locationId,
          membershipId: ids.session, role: "LOCATION_MANAGER",
        }, query, {
          now: new Date("2026-10-18T12:00:00.000Z"),
          cutoff: "2026-10-18T12:00:00.000000Z", database: "100:101:",
        }, {
          purpose: "SEARCH_SESSIONS", organizationId, locationId,
          viewerSessionDigest: "a".repeat(64), filterDigest: "b".repeat(64),
        });
      },
      filters: async () => ({ route: "filters" }),
    } },
    { provide: AuditInvestigationTimelineService, useValue: {
      timeline: async () => ({ route: "timeline" }),
      detail: async () => ({ route: "detail" }),
    } },
    ApiOperationRunner,
    { provide: MONOTONIC_CLOCK, useValue: { now: () => 0 } },
    { provide: OPERATION_OBSERVER, useValue: { observe: async () => undefined } },
    { provide: STAFF_SESSION_CONTEXT_RESOLVER, useValue: {
      resolve: async () => ({ staffAuthSessionId: "isolated-stub" }),
    } },
  ],
})
class IsolatedInvestigationRouterFixture {}

describe("production Investigation router (isolated transport; no real users)", () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let origin: string;
  let prior: string | undefined;

  beforeAll(async () => {
    prior = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    app = await NestFactory.create(IsolatedInvestigationRouterFixture, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as { port: number };
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    await app?.close();
    if (prior === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prior;
  });

  it("the actual application ManagementModule registers both controllers AND legacy Audit Events", () => {
    const registered: unknown[] = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ManagementModule);
    expect(registered).toContain(AuditInvestigationSearchController);
    expect(registered).toContain(AuditInvestigationTimelineController);
    expect(registered).toContain(ManagementAuditController);
    expect(Reflect.getMetadata(PATH_METADATA, AuditInvestigationSearchController))
      .toContain("audit-investigations");
  });

  it.each([
    ["sessions", `${base}/sessions?from=2026-10-18T00%3A00%3A00.000Z&to=2026-10-19T00%3A00%3A00.000Z`],
    ["filters", `${base}/filters?kind=MEMBER`],
    ["timeline", `${base}/sessions/${ids.session}/timeline`],
    ["detail", `${base}/sessions/${ids.session}/events/AUDIT/${ids.event}`],
  ])("dispatches %s on actual Nest production-mode HTTP", async (kind, url) => {
    const response = await fetch(origin + url, { headers: auth });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ route: kind });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects absent bearer authorization before calling any mock service", async () => {
    const response = await fetch(`${origin}${base}/sessions?from=2026-10-18T00%3A00%3A00.000Z&to=2026-10-19T00%3A00%3A00.000Z`);
    expect(response.status).toBe(401);
  });

  it("returns real production HTTP 503, not partial 200, for 26 same-filter vehicle matches", async () => {
    const response = await fetch(origin + `${base}/sessions?from=2026-10-18T00%3A00%3A00.000Z&to=2026-10-19T00%3A00%3A00.000Z&make=Toyota&limit=25`, { headers: auth });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({
      code: "AUDIT_INVESTIGATION_SNAPSHOT_UNAVAILABLE",
    });
  });
});
