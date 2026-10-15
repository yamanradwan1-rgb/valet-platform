import { randomUUID } from "node:crypto";
import { provisionOutboundRuntimePrivileges, verifyOutboundRuntimePrivileges } from "./outbound-runtime-privileges.mjs";
import { provisionOutboundPrincipal } from "./outbound-principal-privileges.mjs";

function roleName(kind) {
  return `outbound_w1_${kind}_${randomUUID().replaceAll("-", "").slice(0,12)}`;
}

async function formatted(client, format, values) {
  const placeholders = values.map((_, i) => `$${i + 2}::text`).join(", ");
  const result = await client.query(`SELECT format($1,${placeholders}) AS statement`,
    [format, ...values]);
  await client.query(result.rows[0].statement);
}

export async function runOutboundRoleSmoke(client, database, generatedRoles) {
  const runtime = roleName("runtime");
  const sender = roleName("sender");
  const webhook = roleName("webhook");
  for (const role of [runtime,sender,webhook]) {
    await formatted(client, `CREATE ROLE %I WITH LOGIN NOINHERIT NOSUPERUSER
      NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L`,
    [role, randomUUID()]);
    generatedRoles.push(role);
  }
  await formatted(client, "GRANT USAGE ON SCHEMA public TO %I", [runtime]);
  await provisionOutboundRuntimePrivileges(client, formatted, runtime);
  await verifyOutboundRuntimePrivileges(client, runtime);
  await provisionOutboundPrincipal(client, "sender", sender, database);
  await provisionOutboundPrincipal(client, "webhook", webhook, database);

  for (const [role, shouldSee] of [[runtime,false],[sender,false],[webhook,false]]) {
    const result = await client.query(
      "SELECT has_table_privilege($1,'public.outbound_message_envelopes','SELECT') AS allowed",
      [role],
    );
    if (result.rows[0].allowed !== shouldSee) {
      throw new Error("Outbound principal can query encrypted envelope table.");
    }
  }
  const guest = await client.query(
    `SELECT has_table_privilege($1,'public.valet_sessions','UPDATE') AS sender_mutate,
      has_table_privilege($2,'public.customers','UPDATE') AS webhook_mutate`,
    [sender,webhook],
  );
  if (guest.rows[0].sender_mutate || guest.rows[0].webhook_mutate) {
    throw new Error("Outbound principals can mutate Guest/custody.");
  }
  await client.query(`SET ROLE "${sender}"`);
  let denied = false;
  try {
    await client.query("SELECT ciphertext FROM outbound_message_envelopes");
  } catch (error) {
    denied = error.code === "42501";
  } finally {
    await client.query("RESET ROLE");
  }
  if (!denied) throw new Error("SQL sender arbitrary envelope SELECT was not denied.");
  console.log("PASS: API/sender/webhook effective privileges, PUBLIC guards, envelope/custody denial.");
  return { runtime, sender, webhook };
}
