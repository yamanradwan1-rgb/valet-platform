import { randomUUID } from "node:crypto";

// The provisioner rejects the deliberately unreachable endpoint before sending SQL.
// Supply the independently named writer identity so validation reaches its target.
export function unreachableManagementWriterProbe(migration: URL) {
  const writer = new URL(migration);
  writer.username = "vaylet_management_writer";
  writer.password = `probe-${randomUUID()}`;
  return {
    MANAGEMENT_WRITER_DATABASE_URL: writer.toString(),
    VAYLET_CI_RUNTIME_PROVISION_UNREACHABLE_PROBE: "1",
  };
}
