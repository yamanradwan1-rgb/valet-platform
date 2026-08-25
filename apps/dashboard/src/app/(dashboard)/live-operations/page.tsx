"use client";

import "../../../features/live-operations/live-operations.css";

import { LiveOperationsView } from "../../../features/live-operations/live-operations-view";

/**
 * D3-001 — Management Dashboard Live Operations.
 *
 * Real backend integration over
 * GET /v1/staff/locations/:locationId/live-operations-map: operational list,
 * backend-positioned vehicle markers, server-authored freshness, snapshot
 * observation time, cursor pagination and explicit refresh.
 */
export default function LiveOperationsPage() {
  return <LiveOperationsView />;
}
