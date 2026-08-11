import { Module } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { AntiAbuseKeyDeriver } from "./anti-abuse-key";
import { AntiAbuseService } from "./anti-abuse.service";
import { TrustedClientAddressResolver } from "./client-address";

@Module({
  imports: [RuntimeDatabaseModule],
  providers: [
    AntiAbuseKeyDeriver,
    AntiAbuseService,
    TrustedClientAddressResolver,
  ],
  exports: [
    AntiAbuseKeyDeriver,
    AntiAbuseService,
    TrustedClientAddressResolver,
  ],
})
export class AntiAbuseModule {}
