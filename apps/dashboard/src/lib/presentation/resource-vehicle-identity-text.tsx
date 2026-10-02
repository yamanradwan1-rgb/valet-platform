import type { ResourceVehicleIdentity as Vehicle } from "@valet/contracts";

import type { DashboardLocale } from "../i18n/locale";
import { resourceVehicleIdentity } from "./resource-vehicle-identity";

export function ResourceVehicleIdentity(props: {
  readonly vehicle: Vehicle | null;
  readonly locale: DashboardLocale;
}) {
  const identity = resourceVehicleIdentity(props.vehicle, props.locale);
  return <bdi dir={identity.dir}>{identity.label}</bdi>;
}
