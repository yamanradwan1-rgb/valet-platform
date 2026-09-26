"use client";

import type { ManagementLocation } from "@valet/contracts";
import { MapPin } from "lucide-react";
import type { ReactNode } from "react";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import { StatusBadge } from "../administration-ui";
import reference from "./locations-reference.module.css";

export function LocationDetail(props: {
  readonly location: ManagementLocation;
  readonly addressText?: string;
  readonly children?: ReactNode;
}) {
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const location = props.location;
  return (
    <>
      <div aria-hidden="true" className={reference.hero}>
        <MapPin size={48} />
      </div>
      <div className={reference.detailBody}>
        <div className={reference.detailHeading}>
          <h2>{location.name}</h2>
          <StatusBadge good={location.status === "ACTIVE"}>
            {location.status === "ACTIVE" ? t.active : t.inactive}
          </StatusBadge>
        </div>
        {props.addressText ? (
          <p className={reference.address}>
            <MapPin aria-hidden="true" size={16} />
            <span>{props.addressText}</span>
          </p>
        ) : null}
        <dl className={reference.facts}>
          {[
            [t.code, location.code],
            [t.timezone, location.timezone],
            [t.currency, location.currency],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <bdi dir="ltr">{value}</bdi>
              </dd>
            </div>
          ))}
        </dl>
        {props.children}
      </div>
    </>
  );
}
