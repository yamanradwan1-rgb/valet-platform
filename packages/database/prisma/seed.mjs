import "dotenv/config";

import pg from "pg";

const { Client } = pg;

if (process.env.NODE_ENV === "production") {
  throw new Error("VAYLET demo seed is disabled when NODE_ENV=production.");
}

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim() === "") {
  throw new Error("VAYLET demo seed requires DATABASE_URL.");
}

let parsedDatabaseUrl;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  throw new Error("VAYLET demo seed requires a valid PostgreSQL DATABASE_URL.");
}

if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) {
  throw new Error("VAYLET demo seed requires a valid PostgreSQL DATABASE_URL.");
}

const ids = {
  organization: "00000000-0000-4000-8000-000000000001",
  ammanLocation: "00000000-0000-4000-8000-000000000002",
  dubaiLocation: "00000000-0000-4000-8000-000000000003",
  adminUser: "00000000-0000-4000-8000-000000000010",
  managerUser: "00000000-0000-4000-8000-000000000011",
  supervisorUser: "00000000-0000-4000-8000-000000000012",
  valetUser: "00000000-0000-4000-8000-000000000013",
  adminMembership: "00000000-0000-4000-8000-000000000020",
  managerMembership: "00000000-0000-4000-8000-000000000021",
  supervisorMembership: "00000000-0000-4000-8000-000000000022",
  valetMembership: "00000000-0000-4000-8000-000000000023",
  valetShift: "00000000-0000-4000-8000-000000000030",
  customerA: "00000000-0000-4000-8000-000000000040",
  customerB: "00000000-0000-4000-8000-000000000041",
  customerC: "00000000-0000-4000-8000-000000000042",
  customerD: "00000000-0000-4000-8000-000000000043",
  vehicleA: "00000000-0000-4000-8000-000000000050",
  vehicleB: "00000000-0000-4000-8000-000000000051",
  vehicleC: "00000000-0000-4000-8000-000000000052",
  vehicleD: "00000000-0000-4000-8000-000000000053",
  spotA01: "00000000-0000-4000-8000-000000000060",
  spotA02: "00000000-0000-4000-8000-000000000061",
  spotA03: "00000000-0000-4000-8000-000000000062",
  spotA04: "00000000-0000-4000-8000-000000000063",
  spotD01: "00000000-0000-4000-8000-000000000064",
  keyK01: "00000000-0000-4000-8000-000000000070",
  keyK02: "00000000-0000-4000-8000-000000000071",
  keyK03: "00000000-0000-4000-8000-000000000072",
  keyK04: "00000000-0000-4000-8000-000000000073",
  keyDK01: "00000000-0000-4000-8000-000000000074",
  sessionA: "00000000-0000-4000-8000-000000000080",
  sessionB: "00000000-0000-4000-8000-000000000081",
  sessionC: "00000000-0000-4000-8000-000000000082",
  sessionD: "00000000-0000-4000-8000-000000000083",
  retrievalB: "00000000-0000-4000-8000-000000000090",
  handoffB: "00000000-0000-4000-8000-000000000091",
  auditSessionA: "00000000-0000-4000-8000-0000000000a0",
  auditPaymentD: "00000000-0000-4000-8000-0000000000a1",
  cashPayment: "00000000-0000-4000-8000-0000000000b0",
  digitalPayment: "00000000-0000-4000-8000-0000000000b1",
  cashEntry: "00000000-0000-4000-8000-0000000000b2",
  validation: "00000000-0000-4000-8000-0000000000b3",
  refund: "00000000-0000-4000-8000-0000000000b4",
  providerEvent: "00000000-0000-4000-8000-0000000000b5",
  incident: "00000000-0000-4000-8000-0000000000c0",
  pendingNotification: "00000000-0000-4000-8000-0000000000d0",
  sentNotification: "00000000-0000-4000-8000-0000000000d1",
};

const timestamps = {
  created: "2026-08-09T06:00:00.000Z",
  shiftStarted: "2026-08-09T06:30:00.000Z",
  sessionACreated: "2026-08-09T07:00:00.000Z",
  sessionAParked: "2026-08-09T07:08:00.000Z",
  sessionBCreated: "2026-08-09T07:15:00.000Z",
  sessionBRequested: "2026-08-09T08:00:00.000Z",
  sessionBRetrieving: "2026-08-09T08:03:00.000Z",
  sessionBReady: "2026-08-09T08:10:00.000Z",
  sessionCCreated: "2026-08-09T06:45:00.000Z",
  sessionCCompleted: "2026-08-09T07:30:00.000Z",
  sessionDCreated: "2026-08-09T08:15:00.000Z",
  sessionDCompleted: "2026-08-09T09:00:00.000Z",
  verificationExpires: "2030-08-09T09:00:00.000Z",
  accessExpires: "2030-08-09T23:59:59.000Z",
};

const client = new Client({ connectionString: databaseUrl });

async function query(text, values) {
  await client.query(text, values);
}

async function seed() {
  try {
    await client.connect();
  } catch {
    throw new Error("VAYLET demo seed could not connect using DATABASE_URL.");
  }

  try {
    await client.query("BEGIN");

    await query(
      `INSERT INTO organizations (id, name, status, timezone, created_at, updated_at)
       VALUES ($1, $2, 'ACTIVE', $3, $4, $4)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         status = EXCLUDED.status,
         timezone = EXCLUDED.timezone,
         updated_at = EXCLUDED.updated_at`,
      [
        ids.organization,
        "VAYLET Demo Operations",
        "Asia/Amman",
        timestamps.created,
      ],
    );

    for (const location of [
      [
        ids.ammanLocation,
        "VAYLET Demo — Amman",
        "AMM-DEMO",
        "Synthetic Demo Address — Amman",
        "Asia/Amman",
        "JOD",
      ],
      [
        ids.dubaiLocation,
        "VAYLET Demo — Dubai",
        "DXB-DEMO",
        "Synthetic Demo Address — Dubai",
        "Asia/Dubai",
        "AED",
      ],
    ]) {
      await query(
        `INSERT INTO locations
           (id, organization_id, name, code, address_text, timezone, currency, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           code = EXCLUDED.code,
           address_text = EXCLUDED.address_text,
           timezone = EXCLUDED.timezone,
           currency = EXCLUDED.currency,
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at`,
        [
          location[0],
          ids.organization,
          ...location.slice(1),
          timestamps.created,
        ],
      );
    }

    const staff = [
      [
        ids.adminUser,
        ids.adminMembership,
        "admin@vaylet.demo.invalid",
        "ORG_ADMIN",
      ],
      [
        ids.managerUser,
        ids.managerMembership,
        "manager@vaylet.demo.invalid",
        "LOCATION_MANAGER",
      ],
      [
        ids.supervisorUser,
        ids.supervisorMembership,
        "supervisor@vaylet.demo.invalid",
        "VALET_SUPERVISOR",
      ],
      [
        ids.valetUser,
        ids.valetMembership,
        "valet@vaylet.demo.invalid",
        "VALET_EMPLOYEE",
      ],
    ];

    for (const [userId, membershipId, email, role] of staff) {
      await query(
        `INSERT INTO users
           (id, email, password_hash, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'ACTIVE', $4, $4)
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at`,
        [
          userId,
          email,
          "$vaylet-demo-fixture$non-authentic-hash",
          timestamps.created,
        ],
      );
      await query(
        `INSERT INTO organization_memberships
           (id, organization_id, user_id, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $5)
         ON CONFLICT (id) DO UPDATE SET
           role = EXCLUDED.role,
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at`,
        [membershipId, ids.organization, userId, role, timestamps.created],
      );
    }

    const locationAccess = [
      [ids.adminMembership, ids.ammanLocation],
      [ids.adminMembership, ids.dubaiLocation],
      [ids.managerMembership, ids.ammanLocation],
      [ids.supervisorMembership, ids.ammanLocation],
      [ids.valetMembership, ids.ammanLocation],
    ];
    for (const [membershipId, locationId] of locationAccess) {
      await query(
        `INSERT INTO membership_location_access
           (organization_id, membership_id, location_id, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (membership_id, location_id) DO NOTHING`,
        [ids.organization, membershipId, locationId, timestamps.created],
      );
    }

    await query(
      `INSERT INTO shifts
         (id, organization_id, location_id, membership_id, status, started_at, ended_at, created_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5, NULL, $6)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         started_at = EXCLUDED.started_at,
         ended_at = EXCLUDED.ended_at`,
      [
        ids.valetShift,
        ids.organization,
        ids.ammanLocation,
        ids.valetMembership,
        timestamps.shiftStarted,
        timestamps.created,
      ],
    );

    const customers = [
      [ids.customerA, "+962790000101", "Demo Customer A"],
      [ids.customerB, "+962790000102", "Demo Customer B"],
      [ids.customerC, "+962790000103", "Demo Customer C"],
      [ids.customerD, "+962790000104", "Demo Customer D"],
    ];
    for (const customer of customers) {
      await query(
        `INSERT INTO customers
           (id, organization_id, phone_normalized, display_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT (id) DO UPDATE SET
           phone_normalized = EXCLUDED.phone_normalized,
           display_name = EXCLUDED.display_name,
           updated_at = EXCLUDED.updated_at`,
        [
          customer[0],
          ids.organization,
          customer[1],
          customer[2],
          timestamps.created,
        ],
      );
    }

    const vehicles = [
      [
        ids.vehicleA,
        "JO",
        "DEMO-A-101",
        "DEMOA101",
        null,
        "Demo Make",
        "Demo Sedan",
        "Blue",
      ],
      [
        ids.vehicleB,
        null,
        null,
        null,
        "Unreadable plate — silver demo SUV",
        "Demo Make",
        "Demo SUV",
        "Silver",
      ],
      [
        ids.vehicleC,
        "JO",
        "DEMO-C-103",
        "DEMOC103",
        null,
        "Demo Make",
        "Demo Compact",
        "White",
      ],
      [
        ids.vehicleD,
        "JO",
        "DEMO-D-104",
        "DEMOD104",
        null,
        "Demo Make",
        "Demo Crossover",
        "Black",
      ],
    ];
    for (const vehicle of vehicles) {
      await query(
        `INSERT INTO vehicles
           (id, organization_id, plate_country, plate_number_raw, plate_number_normalized,
            temporary_descriptor, make, model, color, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
         ON CONFLICT (id) DO UPDATE SET
           plate_country = EXCLUDED.plate_country,
           plate_number_raw = EXCLUDED.plate_number_raw,
           plate_number_normalized = EXCLUDED.plate_number_normalized,
           temporary_descriptor = EXCLUDED.temporary_descriptor,
           make = EXCLUDED.make,
           model = EXCLUDED.model,
           color = EXCLUDED.color,
           updated_at = EXCLUDED.updated_at`,
        [vehicle[0], ids.organization, ...vehicle.slice(1), timestamps.created],
      );
    }

    const spots = [
      [ids.spotA01, ids.ammanLocation, "A-01", "Amman Demo Spot 01"],
      [ids.spotA02, ids.ammanLocation, "A-02", "Amman Demo Spot 02"],
      [ids.spotA03, ids.ammanLocation, "A-03", "Amman Demo Spot 03"],
      [ids.spotA04, ids.ammanLocation, "A-04", "Amman Demo Spot 04"],
      [ids.spotD01, ids.dubaiLocation, "D-01", "Dubai Demo Spot 01"],
    ];
    for (const spot of spots) {
      await query(
        `INSERT INTO parking_spots
           (id, organization_id, location_id, code, label, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $6)
         ON CONFLICT (id) DO UPDATE SET
           code = EXCLUDED.code,
           label = EXCLUDED.label,
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at`,
        [
          spot[0],
          ids.organization,
          spot[1],
          spot[2],
          spot[3],
          timestamps.created,
        ],
      );
    }

    const keySlots = [
      [ids.keyK01, ids.ammanLocation, "K-01"],
      [ids.keyK02, ids.ammanLocation, "K-02"],
      [ids.keyK03, ids.ammanLocation, "K-03"],
      [ids.keyK04, ids.ammanLocation, "K-04"],
      [ids.keyDK01, ids.dubaiLocation, "DK-01"],
    ];
    for (const keySlot of keySlots) {
      await query(
        `INSERT INTO key_slots
           (id, organization_id, location_id, code, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $5)
         ON CONFLICT (id) DO UPDATE SET
           code = EXCLUDED.code,
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at`,
        [
          keySlot[0],
          ids.organization,
          keySlot[1],
          keySlot[2],
          timestamps.created,
        ],
      );
    }

    const sessions = [
      {
        id: ids.sessionA,
        vehicleId: ids.vehicleA,
        customerId: ids.customerA,
        state: "PARKED",
        spotId: ids.spotA01,
        keyId: ids.keyK01,
        createdAt: timestamps.sessionACreated,
        checkingInCompletedAt: "2026-08-09T07:03:00.000Z",
        parkingStartedAt: "2026-08-09T07:04:00.000Z",
        parkedAt: timestamps.sessionAParked,
        retrievalRequestedAt: null,
        retrievalStartedAt: null,
        readyAt: null,
        completedAt: null,
        completedBy: null,
      },
      {
        id: ids.sessionB,
        vehicleId: ids.vehicleB,
        customerId: ids.customerB,
        state: "READY",
        spotId: ids.spotA02,
        keyId: ids.keyK02,
        createdAt: timestamps.sessionBCreated,
        checkingInCompletedAt: "2026-08-09T07:18:00.000Z",
        parkingStartedAt: "2026-08-09T07:19:00.000Z",
        parkedAt: "2026-08-09T07:25:00.000Z",
        retrievalRequestedAt: timestamps.sessionBRequested,
        retrievalStartedAt: timestamps.sessionBRetrieving,
        readyAt: timestamps.sessionBReady,
        completedAt: null,
        completedBy: null,
      },
      {
        id: ids.sessionC,
        vehicleId: ids.vehicleC,
        customerId: ids.customerC,
        state: "COMPLETED",
        spotId: ids.spotA03,
        keyId: ids.keyK03,
        createdAt: timestamps.sessionCCreated,
        checkingInCompletedAt: "2026-08-09T06:48:00.000Z",
        parkingStartedAt: "2026-08-09T06:49:00.000Z",
        parkedAt: "2026-08-09T06:55:00.000Z",
        retrievalRequestedAt: "2026-08-09T07:15:00.000Z",
        retrievalStartedAt: "2026-08-09T07:18:00.000Z",
        readyAt: "2026-08-09T07:25:00.000Z",
        completedAt: timestamps.sessionCCompleted,
        completedBy: ids.supervisorMembership,
      },
      {
        id: ids.sessionD,
        vehicleId: ids.vehicleD,
        customerId: ids.customerD,
        state: "COMPLETED",
        spotId: ids.spotA04,
        keyId: ids.keyK04,
        createdAt: timestamps.sessionDCreated,
        checkingInCompletedAt: "2026-08-09T08:18:00.000Z",
        parkingStartedAt: "2026-08-09T08:19:00.000Z",
        parkedAt: "2026-08-09T08:25:00.000Z",
        retrievalRequestedAt: "2026-08-09T08:40:00.000Z",
        retrievalStartedAt: "2026-08-09T08:43:00.000Z",
        readyAt: "2026-08-09T08:52:00.000Z",
        completedAt: timestamps.sessionDCompleted,
        completedBy: ids.supervisorMembership,
      },
    ];

    for (const session of sessions) {
      await query(
        `INSERT INTO valet_sessions
           (id, customer_access_token_hash, customer_access_expires_at, organization_id, location_id,
            vehicle_id, customer_id, state, parking_spot_id, key_slot_id,
            current_assignee_membership_id, checked_in_by_membership_id, completed_by_membership_id,
            created_at, checking_in_completed_at, parking_started_at, parked_at,
            retrieval_requested_at, retrieval_started_at, ready_at, completed_at, version, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 $14, $15, $16, $17, $18, $19, $20, $21, 1, $14)
         ON CONFLICT (id) DO UPDATE SET
           state = EXCLUDED.state,
           parking_spot_id = EXCLUDED.parking_spot_id,
           key_slot_id = EXCLUDED.key_slot_id,
           current_assignee_membership_id = EXCLUDED.current_assignee_membership_id,
           completed_by_membership_id = EXCLUDED.completed_by_membership_id,
           checking_in_completed_at = EXCLUDED.checking_in_completed_at,
           parking_started_at = EXCLUDED.parking_started_at,
           parked_at = EXCLUDED.parked_at,
           retrieval_requested_at = EXCLUDED.retrieval_requested_at,
           retrieval_started_at = EXCLUDED.retrieval_started_at,
           ready_at = EXCLUDED.ready_at,
           completed_at = EXCLUDED.completed_at,
           updated_at = EXCLUDED.updated_at`,
        [
          session.id,
          `sha256:synthetic-demo-session-${session.id.slice(-2)}`,
          timestamps.accessExpires,
          ids.organization,
          ids.ammanLocation,
          session.vehicleId,
          session.customerId,
          session.state,
          session.spotId,
          session.keyId,
          ids.valetMembership,
          ids.supervisorMembership,
          session.completedBy,
          session.createdAt,
          session.checkingInCompletedAt,
          session.parkingStartedAt,
          session.parkedAt,
          session.retrievalRequestedAt,
          session.retrievalStartedAt,
          session.readyAt,
          session.completedAt,
        ],
      );
    }

    await query(
      `INSERT INTO retrieval_requests
         (id, organization_id, valet_session_id, requested_by_type, requested_by_customer_id,
          requested_by_membership_id, status, requested_at, cancelled_at, created_at)
       VALUES ($1, $2, $3, 'CUSTOMER', $4, NULL, 'ACCEPTED', $5, NULL, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        ids.retrievalB,
        ids.organization,
        ids.sessionB,
        ids.customerB,
        timestamps.sessionBRequested,
      ],
    );

    await query(
      `INSERT INTO handoff_verifications
         (id, organization_id, valet_session_id, method, secret_hash, expires_at,
          attempt_count, max_attempts, verified_at, verified_by_membership_id,
          consumed_at, override_reason, created_at)
       VALUES ($1, $2, $3, 'PICKUP_CODE', $4, $5, 0, 5, NULL, NULL, NULL, NULL, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        ids.handoffB,
        ids.organization,
        ids.sessionB,
        "sha256:synthetic-demo-pickup-verifier",
        timestamps.verificationExpires,
        timestamps.sessionBReady,
      ],
    );

    await query(
      `INSERT INTO payments
         (id, organization_id, location_id, valet_session_id, service_payer, collection_method,
          currency, service_amount, tip_amount, amount_due, amount_paid, status,
          creation_idempotency_key, provider, provider_reference, created_at, updated_at, paid_at)
       VALUES ($1, $2, $3, $4, 'CUSTOMER', 'CASH', 'JOD', 6.000, 1.000, 7.000, 7.000,
               'PAID', $5, NULL, NULL, $6, $6, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        ids.cashPayment,
        ids.organization,
        ids.ammanLocation,
        ids.sessionC,
        "demo-payment-cash-session-c",
        timestamps.sessionCCompleted,
      ],
    );
    await query(
      `INSERT INTO cash_entries
         (id, organization_id, payment_id, entry_type, amount,
          received_or_adjusted_by_membership_id, reason, submission_idempotency_key, occurred_at, created_at)
       VALUES ($1, $2, $3, 'RECEIPT', 7.000, $4, NULL, $5, $6, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        ids.cashEntry,
        ids.organization,
        ids.cashPayment,
        ids.supervisorMembership,
        "demo-cash-receipt-session-c",
        timestamps.sessionCCompleted,
      ],
    );

    await query(
      `INSERT INTO payments
         (id, organization_id, location_id, valet_session_id, service_payer, collection_method,
          currency, service_amount, tip_amount, amount_due, amount_paid, status,
          creation_idempotency_key, provider, provider_reference, created_at, updated_at, paid_at)
       VALUES ($1, $2, $3, $4, 'CUSTOMER', 'DIGITAL', 'JOD', 10.000, 2.000, 8.000, 8.000,
               'PAID', $5, 'demo_gateway', 'demo-payment-reference-001', $6, $6, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        ids.digitalPayment,
        ids.organization,
        ids.ammanLocation,
        ids.sessionD,
        "demo-payment-digital-session-d",
        timestamps.sessionDCompleted,
      ],
    );
    await query(
      `INSERT INTO validations
         (id, organization_id, payment_id, mode, amount, is_current,
          supersedes_validation_id, applied_by_membership_id, applied_at, created_at)
       VALUES ($1, $2, $3, 'PARTIAL', 4.000, true, NULL, $4, $5, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        ids.validation,
        ids.organization,
        ids.digitalPayment,
        ids.managerMembership,
        "2026-08-09T08:50:00.000Z",
      ],
    );
    await query(
      `INSERT INTO refunds
         (id, organization_id, payment_id, amount, reason, status,
          authorized_by_membership_id, idempotency_key, provider, provider_reference,
          requested_at, completed_at, created_at)
       VALUES ($1, $2, $3, 2.000, $4, 'SUCCEEDED', $5, $6, 'demo_gateway',
               'demo-refund-reference-001', $7, $8, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        ids.refund,
        ids.organization,
        ids.digitalPayment,
        "Synthetic demo refund",
        ids.adminMembership,
        "demo-refund-session-d",
        "2026-08-09T09:05:00.000Z",
        "2026-08-09T09:06:00.000Z",
      ],
    );
    await query(
      `INSERT INTO payment_provider_events
         (id, organization_id, payment_id, refund_id, provider, provider_event_id,
          provider_reference, processing_status, received_at, processed_at, safe_result_code, created_at)
       VALUES ($1, $2, $3, NULL, 'demo_gateway', $4, 'demo-payment-reference-001',
               'PROCESSED', $5, $5, 'payment_succeeded', $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        ids.providerEvent,
        ids.organization,
        ids.digitalPayment,
        "demo-event-payment-succeeded-001",
        timestamps.sessionDCompleted,
      ],
    );

    const auditEvents = [
      [
        ids.auditSessionA,
        ids.sessionA,
        ids.supervisorMembership,
        "DEMO_SESSION_SEEDED",
        "VALET_SESSION",
        ids.sessionA,
        timestamps.sessionAParked,
        "demo-audit-session-a",
      ],
      [
        ids.auditPaymentD,
        ids.sessionD,
        ids.managerMembership,
        "DEMO_PAYMENT_SEEDED",
        "PAYMENT",
        ids.digitalPayment,
        timestamps.sessionDCompleted,
        "demo-audit-payment-d",
      ],
    ];
    for (const event of auditEvents) {
      await query(
        `INSERT INTO audit_events
           (id, organization_id, location_id, valet_session_id, actor_membership_id,
            event_type, entity_type, entity_id, metadata_json, idempotency_key, occurred_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          event[0],
          ids.organization,
          ids.ammanLocation,
          event[1],
          event[2],
          event[3],
          event[4],
          event[5],
          '{"source":"demo-seed"}',
          event[7],
          event[6],
        ],
      );
    }

    await query(
      `INSERT INTO incidents
         (id, organization_id, location_id, valet_session_id, status, severity, type,
          description, reported_by_membership_id, created_at,
          resolved_at, resolved_by_membership_id, resolution_notes)
       VALUES ($1, $2, $3, $4, 'OPEN', 'MEDIUM', 'VEHICLE_DAMAGE', $5, $6, $7, NULL, NULL, NULL)
       ON CONFLICT (id) DO NOTHING`,
      [
        ids.incident,
        ids.organization,
        ids.ammanLocation,
        ids.sessionA,
        "Synthetic demo incident",
        ids.supervisorMembership,
        timestamps.sessionAParked,
      ],
    );

    await query(
      `INSERT INTO notifications
         (id, organization_id, valet_session_id, channel, recipient, template_key,
          status, provider_reference, created_at, sent_at, failed_at)
       VALUES ($1, $2, NULL, 'SMS', $3, 'demo.operations.notice', 'PENDING', NULL, $4, NULL, NULL)
       ON CONFLICT (id) DO NOTHING`,
      [
        ids.pendingNotification,
        ids.organization,
        "+962790000199",
        timestamps.created,
      ],
    );
    await query(
      `INSERT INTO notifications
         (id, organization_id, valet_session_id, channel, recipient, template_key,
          status, provider_reference, created_at, sent_at, failed_at)
       VALUES ($1, $2, $3, 'WHATSAPP', $4, 'demo.vehicle.ready', 'SENT',
               'demo-notification-reference-001', $5, $5, NULL)
       ON CONFLICT (id) DO NOTHING`,
      [
        ids.sentNotification,
        ids.organization,
        ids.sessionB,
        "+962790000102",
        timestamps.sessionBReady,
      ],
    );

    await client.query("COMMIT");
    console.log("VAYLET demo seed complete.");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original seed failure without exposing connection details.
    }
    const message =
      error instanceof Error ? error.message : "Unknown database error";
    throw new Error(`VAYLET demo seed failed: ${message}`);
  } finally {
    await client.end();
  }
}

await seed();
