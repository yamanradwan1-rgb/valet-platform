"use client";

import { useState } from "react";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { ParkingZoneCreateDialog } from "./parking-zone-create-dialog";
import { PhysicalResourceCreateDialog } from "./physical-resource-create-dialog";
import {
  issue304ActionIsCurrent,
  type Issue304ActionIntent,
  type Issue304CreatedResource,
  type Issue304ResourceKind,
} from "./issue304-action-intent";
import { ResourceLabelDialog } from "./resource-label-dialog";
import "./issue304-option3-actions.css";

export type {
  Issue304ActionIntent,
  Issue304CreatedResource,
  Issue304ResourceKind,
} from "./issue304-action-intent";

export interface Issue304ActionDialogsProps {
  readonly action: Issue304ActionIntent | null;
  readonly api: DashboardApiClient;
  readonly identityGeneration: number;
  readonly locationId: string;
  readonly locationStatus: "ACTIVE" | "INACTIVE";
  /** True only while the management workspace has exact Location authority. */
  readonly managementAuthorized: boolean;
  /** Include identity + Location; changes on logout, switch, re-auth. */
  readonly scopeKey: string;
  readonly onClose: () => void;
  /** Refresh the affected resource family; never optimistically invent rows. */
  readonly onChanged: (resource: Issue304CreatedResource) => void;
  /** Reconcile an uncertain POST outcome from an authoritative server read. */
  readonly onReconcile: () => void;
}

/**
 * Mounted by W2 *inside* the approved visual shell; it draws only the
 * existing production mutation/QR dialogs, never a second custom UI.
 *
 * Key this host by scopeKey and identityGeneration in the caller so React
 * disposes old dialog state on a Location/auth identity transition.
 */
export function Issue304ActionDialogs(props: Issue304ActionDialogsProps) {
  const [createdLabel, setCreatedLabel] = useState<{
    readonly kind: Issue304ResourceKind;
    readonly resourceId: string;
    readonly actionKey: string;
  } | null>(null);

  if (!issue304ActionIsCurrent(props.action, props)) return null;

  const action = props.action;
  const actionKey = [
    props.scopeKey,
    props.identityGeneration,
    action.type,
    action.type === "create" || action.type === "label" ? action.kind : "",
    action.type === "label" ? action.resourceId : "",
  ].join(":");
  const label =
    createdLabel?.actionKey === actionKey
      ? createdLabel
      : action.type === "label" ? action : null;

  if (label !== null) {
    return (
      <div data-issue304-action-surface="label">
        <ResourceLabelDialog
          api={props.api}
          kind={label.kind}
          resourceId={label.resourceId}
          key={`${actionKey}:label:${label.resourceId}`}
          locationId={props.locationId}
          scopeKey={`${actionKey}:label:${label.resourceId}`}
          fromKeysWorkspace
          issue304Variant
          onClose={props.onClose}
        />
      </div>
    );
  }

  if (action.type === "create-zone") {
    return (
      <div data-issue304-action-surface="create-zone">
        <ParkingZoneCreateDialog
          api={props.api}
          identityGeneration={props.identityGeneration}
          key={actionKey}
          locationId={props.locationId}
          scopeKey={actionKey}
          fromKeysWorkspace
          issue304Variant
          onClose={props.onClose}
          onReconcile={props.onReconcile}
          onCreated={(zone) => {
            props.onChanged({ type: "parking-zone", resourceId: zone.parkingZoneId });
            props.onClose();
          }}
        />
      </div>
    );
  }

  return (
    <div data-issue304-action-surface="create">
      <PhysicalResourceCreateDialog
        api={props.api}
        identityGeneration={props.identityGeneration}
        key={actionKey}
        kind={action.kind}
        locationId={props.locationId}
        scopeKey={actionKey}
        fromKeysWorkspace
        issue304Variant
        onClose={props.onClose}
        onReconcile={props.onReconcile}
        onCreated={(resourceId) => {
          props.onChanged({ type: action.kind, resourceId });
          setCreatedLabel({ kind: action.kind, resourceId, actionKey });
        }}
      />
    </div>
  );
}
