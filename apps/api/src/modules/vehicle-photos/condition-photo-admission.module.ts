import { Module } from "@nestjs/common";

import { AntiAbuseModule } from "../anti-abuse/anti-abuse.module";
import { ConditionPhotoAdmission } from "./condition-photo-admission";

@Module({
  imports: [AntiAbuseModule],
  providers: [ConditionPhotoAdmission],
  exports: [ConditionPhotoAdmission],
})
export class ConditionPhotoAdmissionModule {}
