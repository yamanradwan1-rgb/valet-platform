CREATE INDEX "valet_sessions_location_id_state_idx"
ON "valet_sessions"("location_id", "state");

CREATE INDEX "valet_sessions_vehicle_id_created_at_idx"
ON "valet_sessions"("vehicle_id", "created_at" DESC);

CREATE INDEX "valet_sessions_location_id_retrieval_requested_at_idx"
ON "valet_sessions"("location_id", "retrieval_requested_at");
