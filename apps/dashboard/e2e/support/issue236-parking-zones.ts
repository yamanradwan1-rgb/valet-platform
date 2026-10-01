import type { ParkingZoneSelector } from "@valet/contracts";
import { expect, type Page, type Request } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
  type FixtureReply,
} from "./dashboard-api-fixture";
import { Issue232PhysicalState } from "./issue232-physical-resources";
import { enterPhysicalResources } from "./keys-spots";

export const zonePath = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/physical-resources/parking-zones`;
export class Issue236ZoneState {
  readonly resources = new Issue232PhysicalState(false);
  readonly zones: ParkingZoneSelector[] = [];
  readonly posts: { code: string; label: string; operationId: string }[] = [];
  readonly reads: (string | null)[] = [];
  readonly operations = new Map<string, ParkingZoneSelector>();
  nextError: string | null = null;
  reply(path: string, request: Request): FixtureReply | undefined {
    if (path === zonePath) {
      if (request.method() === "GET") {
        const cursor = new URL(request.url()).searchParams.get("cursor");
        this.reads.push(cursor);
        const offset = cursor
          ? Number(Buffer.from(cursor, "base64url").toString())
          : 0;
        const items = [...this.zones]
          .sort((a, b) => a.code.localeCompare(b.code))
          .slice(offset, offset + 100);
        return {
          body: {
            items,
            nextCursor:
              offset + 100 < this.zones.length
                ? Buffer.from(String(offset + 100).padStart(6, "0")).toString(
                    "base64url",
                  )
                : null,
          },
        };
      }
      const input = request.postDataJSON() as (typeof this.posts)[number];
      this.posts.push(input);
      if (this.nextError) {
        const code = this.nextError;
        this.nextError = null;
        return {
          status: code.startsWith("MFA_") ? 403 : 409,
          body: {
            code,
            message:
              code === "RESOURCE_CODE_CONFLICT"
                ? "Duplicate Zone code"
                : "Verification required",
            requestId: "zone-error",
          },
        };
      }
      const replay = this.operations.get(input.operationId);
      if (replay) return { status: 201, body: replay };
      if (this.zones.some((zone) => zone.code === input.code.trim()))
        return {
          status: 409,
          body: {
            code: "RESOURCE_CODE_CONFLICT",
            message: "Duplicate Zone code",
            requestId: "zone-duplicate",
          },
        };
      const zone = {
        parkingZoneId: `66666666-6666-4666-8666-${String(this.zones.length + 1).padStart(12, "0")}`,
        code: input.code.trim(),
        label: input.label.trim(),
        status: "ACTIVE" as const,
      };
      this.zones.push(zone);
      this.operations.set(input.operationId, zone);
      return { status: 201, body: zone };
    }
    const reply = this.resources.reply(path, request);
    if (
      path.endsWith("/parking-spots") &&
      request.method() === "POST" &&
      reply?.status === 201
    ) {
      const body = reply.body as Record<string, unknown>;
      body.parkingZone = this.zones.find(
        (zone) => zone.parkingZoneId === request.postDataJSON().parkingZoneId,
      );
    }
    return reply;
  }
}
export function zoneFixture(state: Issue236ZoneState) {
  return new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => state.reply(path, request),
  });
}
export async function openSpot(page: Page) {
  await page.getByRole("tab", { name: "Parking Spots" }).click();
  await page
    .getByRole("button", { name: "Add Parking Spot", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Add Parking Spot",
    exact: true,
  });
  await expect(dialog.getByLabel("Parking Zone")).toBeEnabled();
  return dialog;
}
export async function enterZoneFlow(page: Page, state: Issue236ZoneState) {
  const api = zoneFixture(state);
  await api.install(page);
  await enterPhysicalResources(page);
  return { api, spot: await openSpot(page) };
}
