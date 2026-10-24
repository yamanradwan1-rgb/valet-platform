import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "pg";

import { hashStaffPassword } from "../../src/modules/auth/staff-password-hashing";

async function main(): Promise<void> {
const ownedDatabase = "vaylet_wa310";
const credentialsPath = resolve(process.cwd(), "../../tmp/wa310-runtime/operator-private.json");
const connection = process.env.MIGRATION_DATABASE_URL;
const parsed = connection === undefined ? null : new URL(connection);
if (process.env.NODE_ENV !== "test" ||
    process.env.OUTBOUND_MESSAGING_SEND_ENABLED !== "false" ||
    process.env.GUEST_ACCESS_AUTO_ISSUE_ENABLED !== "false" ||
    parsed?.hostname !== "127.0.0.1" || parsed.port !== "56310" ||
    parsed.pathname !== `/${ownedDatabase}` ||
    decodeURIComponent(parsed.username) !== "wa310_migrate") {
  throw new Error("Issue310 bootstrap refuses any non-owned database or enabled sender.");
}
if (existsSync(credentialsPath)) {
  throw new Error("Issue310 tenant already bootstrapped; existing credentials preserved.");
}

const adminPassword = randomBytes(24).toString("base64url");
const employeePassword = randomBytes(24).toString("base64url");
const adminHash = await hashStaffPassword(adminPassword);
const employeeHash = await hashStaffPassword(employeePassword);

const ids = {
  organization: randomUUID(), location: randomUUID(),
  adminUser: randomUUID(), adminMembership: randomUUID(),
  employeeUser: randomUUID(), employeeMembership: randomUUID(),
  customer: randomUUID(), zone: randomUUID(), spot: randomUUID(),
  keySlot: randomUUID(),
};
const client = new Client({ connectionString: connection });
await client.connect();
try {
  await client.query("BEGIN");
  const database = await client.query("SELECT current_database() AS name");
  const count = await client.query("SELECT COUNT(*)::int AS total FROM organizations");
  if (database.rows[0]?.name !== ownedDatabase || count.rows[0]?.total !== 0) {
    throw new Error("Issue310 bootstrap requires its verified empty Organization scope.");
  }
  await client.query(
    "INSERT INTO organizations (id,name,status,timezone,updated_at) VALUES ($1,$2,'ACTIVE','Asia/Amman',now())",
    [ids.organization, "VAYLET WA310 Isolated Sandbox"],
  );
  await client.query(
    `INSERT INTO locations (id,organization_id,name,code,address_text,timezone,currency,status,accepting_intake,updated_at)
     VALUES ($1,$2,$3,'WA310-IRBID','Isolated synthetic test address','Asia/Amman','JOD','ACTIVE',true,now())`,
    [ids.location, ids.organization, "WA310 Test Valet — Irbid"],
  );
  const staff = [
    [ids.adminUser, ids.adminMembership, "admin@wa310.vaylet.invalid", adminHash, "ORG_ADMIN", "Sandbox", "Admin"],
    [ids.employeeUser, ids.employeeMembership, "employee@wa310.vaylet.invalid", employeeHash, "VALET_EMPLOYEE", "Sandbox", "Employee"],
  ];
  for (const [userId, membershipId, email, hash, role, first, last] of staff) {
    await client.query(
      "INSERT INTO users (id,email,password_hash,status,updated_at) VALUES ($1,$2,$3,'ACTIVE',now())",
      [userId, email, hash],
    );
    await client.query(
      `INSERT INTO organization_memberships
       (id,organization_id,user_id,first_name,last_name,role,status,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',now())`,
      [membershipId, ids.organization, userId, first, last, role],
    );
  }
  await client.query(
    "INSERT INTO membership_location_access (organization_id,membership_id,location_id) VALUES ($1,$2,$3)",
    [ids.organization, ids.employeeMembership, ids.location],
  );
  await client.query(
    "INSERT INTO parking_zones (id,organization_id,location_id,code,label,status,updated_at) VALUES ($1,$2,$3,'WA310-ZONE','WA310 Test Zone','ACTIVE',now())",
    [ids.zone, ids.organization, ids.location],
  );
  await client.query(
    `INSERT INTO parking_spots (id,organization_id,location_id,parking_zone_id,code,label,status,updated_at)
     VALUES ($1,$2,$3,$4,'WA310-01','WA310 Test Spot','ACTIVE',now())`,
    [ids.spot, ids.organization, ids.location, ids.zone],
  );
  await client.query(
    "INSERT INTO key_slots (id,organization_id,location_id,code,label,status,updated_at) VALUES ($1,$2,$3,'WA310-K1','WA310 Test Key','ACTIVE',now())",
    [ids.keySlot, ids.organization, ids.location],
  );
  await client.query(
    `INSERT INTO customers (id,organization_id,phone_normalized,display_name,updated_at)
     VALUES ($1,$2,'+15550100123','Synthetic WA310 — no WhatsApp consent',now())`,
    [ids.customer, ids.organization],
  );
  const recipient = await client.query(
    `SELECT count(*)::int AS total FROM outbound_messaging_permissions WHERE organization_id=$1`,
    [ids.organization],
  );
  if (recipient.rows[0]?.total !== 0) {
    throw new Error("New tenant unexpectedly has outbound consent.");
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

mkdirSync(resolve(credentialsPath, ".."), { recursive: true, mode: 0o700 });
writeFileSync(credentialsPath, JSON.stringify({
  ...ids,
  admin: { email: "admin@wa310.vaylet.invalid", password: adminPassword },
  employee: { email: "employee@wa310.vaylet.invalid", password: employeePassword },
}, null, 2), { encoding: "utf8", mode: 0o600, flag: "wx" });
console.log("Created one WA310 Organization/Location, admin, employee, no-consent synthetic customer and parking resources.");
console.log(`New Organization: ${ids.organization}; Location: ${ids.location}`);
console.log("Credentials stored in ignored local operator-private.json; passwords never printed.");
}

void main();
