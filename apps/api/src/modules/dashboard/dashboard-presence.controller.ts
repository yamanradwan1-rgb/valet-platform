import { Controller } from "@nestjs/common";

import { PresenceLocationPolicyController } from "../management/presence-location-policy-controller";
import { PresenceLocationZoneController } from "../management/presence-location-zone-controller";
import { PresenceLocationExceptionController } from "../management/presence-location-exception-controller";

@Controller(
  "v1/staff/dashboard/locations/:locationId/configuration/shift-presence",
)
export class PresenceLmPolicyController extends PresenceLocationPolicyController {
  protected readonly authority = "LOCATION_MANAGER" as const;
}
@Controller(
  "v1/staff/dashboard/locations/:locationId/configuration/shift-presence",
)
export class PresenceLmZoneController extends PresenceLocationZoneController {
  protected readonly authority = "LOCATION_MANAGER" as const;
}
@Controller(
  "v1/staff/dashboard/locations/:locationId/configuration/shift-presence",
)
export class PresenceLmExceptionController extends PresenceLocationExceptionController {
  protected readonly authority = "LOCATION_MANAGER" as const;
}
