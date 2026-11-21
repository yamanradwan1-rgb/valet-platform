export const runtimeReadOnlyTables = [
  "organizations",
  "locations",
  "users",
  "organization_memberships",
  "membership_location_access",
  "parking_zones",
  "parking_spots",
  "key_slots",
  "incidents",
  "location_map_points",
  "location_map_areas",
  "location_map_area_vertices",
];

export const runtimeInsertOnlyTables = ["customers", "payments", "incidents"];

export const customerPrivileges = {
  anyColumn: [["public.customers", "UPDATE", false]],
  table: [
    ["public.customers", "SELECT", true],
    ["public.customers", "INSERT", true],
    ["public.customers", "UPDATE", false],
    ["public.customers", "DELETE", false],
    ["public.customers", "TRUNCATE", false],
    ["public.customers", "REFERENCES", false],
    ["public.customers", "TRIGGER", false],
  ],
};

export const runtimeOperationalTables = [
  "vehicles",
  "valet_sessions",
  "tasks",
  "retrieval_requests",
  "handoff_verifications",
];

export const runtimeTrackingSessionTables = ["task_tracking_sessions"];

export const runtimeFinancialUpdateColumns = [
  "service_payer",
  "service_amount",
  "tip_amount",
  "amount_due",
  "amount_paid",
  "collection_method",
  "status",
  "provider",
  "provider_reference",
  "updated_at",
  "paid_at",
];

export const runtimeShiftUpdateColumns = [
  "status",
  "ended_at",
  "cash_expected",
  "cash_reported",
  "cash_variance",
  "cash_currency",
  "cash_reported_at",
  "cash_reported_by_membership_id",
];

export const runtimeRefundInsertColumns = [
  "id",
  "organization_id",
  "payment_id",
  "amount",
  "reason",
  "status",
  "authorized_by_membership_id",
  "idempotency_key",
  "provider",
  "requested_at",
  "completed_at",
];

export const runtimeMapSetupFunctions = [
  "public.map_setup_create_point(uuid,uuid,uuid,location_map_point_kind,text,text,numeric,numeric,text,boolean)",
  "public.map_setup_update_point(uuid,uuid,uuid,location_map_point_kind,text,text,numeric,numeric,text,boolean,timestamp with time zone)",
  "public.map_setup_create_area(uuid,uuid,uuid,location_map_area_purpose,text,text,text,boolean,uuid,numeric[],numeric[])",
  "public.map_setup_update_area(uuid,uuid,uuid,location_map_area_purpose,text,text,text,boolean,uuid,timestamp with time zone)",
  "public.map_setup_replace_area_vertices(uuid,uuid,uuid,numeric[],numeric[],timestamp with time zone)",
];

export const runtimePrivateMapSetupFunctions = [
  "public.map_setup_authorized_organization(uuid,uuid)",
  "public.map_setup_validate_labels(text,text,text)",
  "public.map_setup_append_audit(uuid,uuid,uuid,text,text,uuid,text,boolean,boolean)",
];

export const runtimeMaintenanceFunctions = [
  "public.cleanup_expired_raw_gps_samples(integer)",
  "public.cleanup_staff_push_v1()",
];

export const runtimeLockColumns = [
  ["users", "last_login_at"],
  ["users", "updated_at"],
  ["organizations", "updated_at"],
  ["locations", "updated_at"],
  ["organization_memberships", "updated_at"],
  ["membership_location_access", "created_at"],
  ["key_slots", "updated_at"],
  ["parking_spots", "updated_at"],
  ["parking_zones", "updated_at"],
];
