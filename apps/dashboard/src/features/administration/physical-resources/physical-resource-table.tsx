"use client";

import type {
  KeySlotConfiguration,
  ParkingSpotListEntry,
} from "@valet/contracts";

import { StatusBadge, styles } from "../administration-ui";
import { physicalResourcesCopy } from "./physical-resources-copy";
import presentation from "./physical-resources.module.css";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { ResourceVehicleIdentity } from "../../../lib/presentation/resource-vehicle-identity-text";

export function PhysicalResourceTable(props: {
  readonly items: readonly (KeySlotConfiguration | ParkingSpotListEntry)[];
  readonly kind: "key-slot" | "parking-spot";
  readonly locale: DashboardLocale;
  readonly onLabel: (id: string) => void;
  readonly labelAllowed: boolean;
  readonly operational: boolean;
}) {
  const t = physicalResourcesCopy(props.locale);
  if (props.items.length === 0) {
    return (
      <div className={styles.empty}>
        {props.kind === "key-slot" ? t.keySlotsEmpty : t.parkingSpotsEmpty}
      </div>
    );
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t.code}</th>
            {props.kind === "parking-spot" ? (
              <>
                <th>{t.label}</th>
                <th>{t.parkingZone}</th>
              </>
            ) : null}
            <th>{t.status}</th>
            <th>
              <span className="sr-only">{t.viewLabel}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.items.map((item) => {
            const id =
              "keySlotId" in item ? item.keySlotId : item.parkingSpotId;
            const parking = "parkingSpotId" in item ? item : null;
            return (
              <tr key={id}>
                <td>
                  <bdi className={presentation.code} dir="ltr">
                    {item.code}
                  </bdi>
                </td>
                {parking ? (
                  <>
                    <td>{parking.label}</td>
                    <td>
                      {parking.parkingZone ? (
                        <>
                          <span>{parking.parkingZone.label}</span>{" "}
                          <bdi className={styles.muted} dir="ltr">
                            {parking.parkingZone.code}
                          </bdi>
                        </>
                      ) : (
                        <span className={styles.muted}>
                          {t.legacyUnassigned}
                        </span>
                      )}
                    </td>
                  </>
                ) : null}
                <td>
                  <StatusBadge good={item.status === "ACTIVE"}>
                    {item.status}
                  </StatusBadge>
                  {props.operational && parking?.occupancy !== undefined ? (
                    <>
                      <div className={styles.muted}>
                        {parking.occupancy === null ? t.available : t.occupied}
                      </div>
                      {parking.occupancy ? (
                        <div className={styles.muted}>
                          <ResourceVehicleIdentity
                            vehicle={parking.occupancy.vehicle}
                            locale={props.locale}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </td>
                <td>
                  <button
                    className={styles.quiet}
                    disabled={!props.labelAllowed || item.status !== "ACTIVE"}
                    onClick={() => props.onLabel(id)}
                    type="button"
                  >
                    {t.viewLabel}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
