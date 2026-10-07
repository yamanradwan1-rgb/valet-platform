import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import {
  GuestAccessController,
  StaffGuestAccessController,
} from "../src/modules/guest-access/guest-access.controller";
import { GuestAccessModule } from "../src/modules/guest-access/guest-access.module";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { GuestBrowserSessionController } from "../src/modules/guest-access/guest-browser-session.controller";
import { GuestBrowserSessionService } from "../src/modules/guest-access/guest-browser-session.service";
import { GuestAuthOriginPolicy } from "../src/modules/guest-access/guest-browser-transport";
import { GuestCredentialAuthorizer } from "../src/modules/guest-access/guest-credential-authorizer";
import { GuestRatingController } from "../src/modules/guest-access/guest-rating.controller";
import { GuestRatingService } from "../src/modules/guest-access/guest-rating.service";

function metadata<T>(key: string): T[] {
  return (Reflect.getMetadata(key, GuestAccessModule) as T[] | undefined) ?? [];
}

describe("MGT-BE-09 Guest Rating module ownership", () => {
  it("keeps Guest Rating under Guest Access ownership", () => {
    expect(metadata(MODULE_METADATA.CONTROLLERS)).toEqual([
      StaffGuestAccessController,
      GuestAccessController,
      GuestRatingController,
      GuestBrowserSessionController,
    ]);
    expect(metadata(MODULE_METADATA.PROVIDERS)).toEqual([
      GuestAccessService,
      GuestBrowserSessionService,
      GuestAuthOriginPolicy,
      GuestCredentialAuthorizer,
      GuestRatingService,
    ]);
    expect(metadata(MODULE_METADATA.EXPORTS)).toEqual([
      GuestAccessService,
      GuestBrowserSessionService,
      GuestAuthOriginPolicy,
      GuestCredentialAuthorizer,
    ]);
  });
});
