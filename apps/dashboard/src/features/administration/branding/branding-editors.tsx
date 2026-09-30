"use client";

import {
  brandingClearRequestSchema,
  brandingSetRequestSchema,
  managementBrandingClearRequestSchema,
  managementBrandingSetRequestSchema,
  type BrandingReadResponse,
  type ManagementCompanyBrandingResponse,
  type ManagementLocationBrandingResponse,
} from "@valet/contracts";
import { useState } from "react";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { styles } from "../administration-ui";
import { useSensitiveMutation } from "../use-sensitive-mutation";
import {
  clearLocationManagerBranding, clearManagementLocationBranding, setCompanyBranding,
  setLocationManagerBranding, setManagementLocationBranding,
} from "./branding-api";

function BrandingForm(props: {
  readonly api: DashboardApiClient;
  readonly clearDisplay?: () => Promise<unknown>;
  readonly clearPrimary?: () => Promise<unknown>;
  readonly displayName: string;
  readonly displayOverride?: boolean;
  readonly intentKey: string;
  readonly onReload: () => void;
  readonly primaryColor: string;
  readonly primaryOverride?: boolean;
  readonly saveDisplay: (value: string) => Promise<unknown>;
  readonly savePrimary: (value: string) => Promise<unknown>;
}) {
  const { locale } = useDashboardLocale(); const t = administrationCopy(locale);
  const [displayName, setDisplayName] = useState(props.displayName);
  const [primaryColor, setPrimaryColor] = useState(props.primaryColor);
  const mutation = useSensitiveMutation(props.intentKey, props.onReload);
  return <div className={`${styles.card} ${styles.brandingCard}`}><div className={styles.stack}>
    <div className={styles.grid2}>
      <div className={styles.field}><label htmlFor="brand-display-name">{t.displayName}</label><input className={styles.input} id="brand-display-name" maxLength={120} onChange={(e) => setDisplayName(e.target.value)} value={displayName} /><div className={styles.muted}>{props.displayOverride === undefined ? t.effective : props.displayOverride ? t.overridden : t.inherited}</div></div>
      <div className={styles.field}><label htmlFor="brand-primary-color">{t.primaryColor}</label><input className={styles.input} dir="ltr" id="brand-primary-color" onChange={(e) => setPrimaryColor(e.target.value.toUpperCase())} pattern="#[0-9A-Fa-f]{6}" value={primaryColor} /><div className={styles.muted}>{props.primaryOverride === undefined ? t.effective : props.primaryOverride ? t.overridden : t.inherited}</div></div>
    </div>
    <div className={styles.formFooter}><button className={`${styles.primary} ${styles.brandingButton}`} disabled={mutation.busy || displayName === props.displayName} onClick={() => void mutation.run(() => props.saveDisplay(displayName), props.onReload)} type="button">{t.save} {t.displayName}</button>{props.clearDisplay ? <button className={`${styles.secondary} ${styles.brandingButton} ${styles.brandingSecondary}`} disabled={mutation.busy || props.displayOverride === false} onClick={() => void mutation.run(props.clearDisplay!, props.onReload)} type="button">{t.clearOverride}</button> : null}<button className={`${styles.primary} ${styles.brandingButton}`} disabled={mutation.busy || primaryColor === props.primaryColor} onClick={() => void mutation.run(() => props.savePrimary(primaryColor), props.onReload)} type="button">{t.save} {t.primaryColor}</button>{props.clearPrimary ? <button className={`${styles.secondary} ${styles.brandingButton} ${styles.brandingSecondary}`} disabled={mutation.busy || props.primaryOverride === false} onClick={() => void mutation.run(props.clearPrimary!, props.onReload)} type="button">{t.clearOverride}</button> : null}</div>
    {mutation.error ? <div className={styles.error} role="alert">{mutation.error}</div> : null}
    {mutation.mfaOpen ? <SensitiveMfaDialog api={props.api} onAssured={mutation.onMfaAssured} onClose={mutation.closeMfa} /> : null}
  </div></div>;
}

export function CompanyBrandingEditor(props: { readonly api: DashboardApiClient; readonly data: ManagementCompanyBrandingResponse; readonly onReload: () => void }) {
  const request = (setting: "brandDisplayName" | "brandPrimaryColor", value: string) => managementBrandingSetRequestSchema.parse({ setting, value, expectedUpdatedAt: props.data.updatedAt });
  return <BrandingForm api={props.api} displayName={props.data.displayName} intentKey={`company-branding:${props.data.organizationId}:${props.data.updatedAt}`} onReload={props.onReload} primaryColor={props.data.primaryColor}
    saveDisplay={(value) => setCompanyBranding(props.api, props.data.organizationId, request("brandDisplayName", value))}
    savePrimary={(value) => setCompanyBranding(props.api, props.data.organizationId, request("brandPrimaryColor", value))} />;
}

export function ManagementLocationBrandingEditor(props: { readonly api: DashboardApiClient; readonly data: ManagementLocationBrandingResponse; readonly onReload: () => void }) {
  const set = (setting: "brandDisplayName" | "brandPrimaryColor", value: string) => setManagementLocationBranding(props.api, props.data.organizationId, props.data.locationId, managementBrandingSetRequestSchema.parse({ setting, value, expectedUpdatedAt: props.data.updatedAt }));
  const clear = (setting: "brandDisplayName" | "brandPrimaryColor") => clearManagementLocationBranding(props.api, props.data.organizationId, props.data.locationId, managementBrandingClearRequestSchema.parse({ setting, expectedUpdatedAt: props.data.updatedAt }));
  return <BrandingForm api={props.api} clearDisplay={() => clear("brandDisplayName")} clearPrimary={() => clear("brandPrimaryColor")}
    displayName={props.data.displayName.effective as string} displayOverride={props.data.displayName.overridePresent}
    intentKey={`management-location-branding:${props.data.locationId}:${props.data.updatedAt}`} onReload={props.onReload} primaryColor={props.data.primaryColor.effective as string} primaryOverride={props.data.primaryColor.overridePresent}
    saveDisplay={(value) => set("brandDisplayName", value)} savePrimary={(value) => set("brandPrimaryColor", value)} />;
}

export function LocationManagerBrandingEditor(props: { readonly api: DashboardApiClient; readonly data: BrandingReadResponse; readonly onReload: () => void }) {
  const set = (setting: "brandDisplayName" | "brandPrimaryColor", value: string) => setLocationManagerBranding(props.api, props.data.locationId, brandingSetRequestSchema.parse({ setting, value, expectedUpdatedAt: props.data.updatedAt }));
  const clear = (setting: "brandDisplayName" | "brandPrimaryColor") => clearLocationManagerBranding(props.api, props.data.locationId, brandingClearRequestSchema.parse({ setting, expectedUpdatedAt: props.data.updatedAt }));
  return <BrandingForm api={props.api} clearDisplay={() => clear("brandDisplayName")} clearPrimary={() => clear("brandPrimaryColor")}
    displayName={props.data.displayName.effective} displayOverride={props.data.displayName.overridePresent}
    intentKey={`location-branding:${props.data.locationId}:${props.data.updatedAt}`} onReload={props.onReload} primaryColor={props.data.primaryColor.effective} primaryOverride={props.data.primaryColor.overridePresent}
    saveDisplay={(value) => set("brandDisplayName", value)} savePrimary={(value) => set("brandPrimaryColor", value)} />;
}
