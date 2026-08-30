export async function seedDemoShifts(query, ids, timestamps) {
  const shifts = [
    [ids.valetShift, ids.valetMembership],
    [ids.supervisorShift, ids.supervisorMembership],
  ];
  for (const [shiftId, membershipId] of shifts) {
    await query(
      `INSERT INTO shifts
         (id, organization_id, location_id, membership_id, status, started_at, ended_at, created_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5, NULL, $6)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         started_at = EXCLUDED.started_at,
         ended_at = EXCLUDED.ended_at`,
      [
        shiftId,
        ids.organization,
        ids.ammanLocation,
        membershipId,
        timestamps.shiftStarted,
        timestamps.created,
      ],
    );
  }
}

export async function seedDemoTasks(query, ids, timestamps) {
  // READY intentionally keeps its Retrieval Task IN_PROGRESS through handoff;
  // the supervisor owns that demo work so the canonical valet is smoke-safe.
  const tasks = [
    [
      ids.taskAParking,
      ids.sessionA,
      "PARKING",
      "COMPLETED",
      ids.valetMembership,
      timestamps.sessionACreated,
      timestamps.sessionAParked,
    ],
    [
      ids.taskBParking,
      ids.sessionB,
      "PARKING",
      "COMPLETED",
      ids.valetMembership,
      timestamps.sessionBCreated,
      timestamps.sessionBRequested,
    ],
    [
      ids.taskBRetrieval,
      ids.sessionB,
      "RETRIEVAL",
      "IN_PROGRESS",
      ids.supervisorMembership,
      timestamps.sessionBRequested,
      timestamps.sessionBReady,
    ],
  ];
  for (const [
    taskId,
    sessionId,
    type,
    status,
    assigneeId,
    createdAt,
    updatedAt,
  ] of tasks) {
    await query(
      `INSERT INTO tasks
         (id, organization_id, location_id, valet_session_id, task_type, status,
          current_assignee_membership_id, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::text::"task_type", $6::text::"task_status", $7, 1, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         current_assignee_membership_id = EXCLUDED.current_assignee_membership_id,
         updated_at = EXCLUDED.updated_at`,
      [
        taskId,
        ids.organization,
        ids.ammanLocation,
        sessionId,
        type,
        status,
        assigneeId,
        createdAt,
        updatedAt,
      ],
    );
  }
}
