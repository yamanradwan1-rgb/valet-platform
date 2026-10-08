const enabled = process.env.GUEST_T4_STAGING_READ_PROBE === "1";
if (!enabled) {
  console.error(
    "UNVERIFIED: set GUEST_T4_STAGING_READ_PROBE=1 plus both replica URLs and a Browser Session cookie to run the read-only staging probe.",
  );
  process.exitCode = 2;
} else {
  const replicaA = requiredUrl("GUEST_T4_REPLICA_A_URL");
  const replicaB = requiredUrl("GUEST_T4_REPLICA_B_URL");
  const browser = requiredSecret("GUEST_T4_BROWSER_SESSION");
  if (replicaA.href === replicaB.href) {
    throw new Error("Replica URLs must be distinct.");
  }

  const current = await Promise.all([
    readSession(replicaA, browser),
    readSession(replicaB, browser),
  ]);
  for (const result of current) {
    if (result.status !== 200) {
      throw new Error(
        `Current Browser Session returned HTTP ${result.status}.`,
      );
    }
  }
  const sessionIds = current.map((result) => result.body.valetSessionId);
  if (
    typeof sessionIds[0] !== "string" ||
    sessionIds[0] === "" ||
    sessionIds[0] !== sessionIds[1]
  ) {
    throw new Error(
      "Replicas did not return the same non-empty valetSessionId.",
    );
  }

  const stale = process.env.GUEST_T4_STALE_BROWSER_SESSION;
  if (stale !== undefined && stale !== "") {
    await requireInvalidOnBoth(stale, replicaA, replicaB, "stale");
  }
  const revoked = process.env.GUEST_T4_REVOKED_BROWSER_SESSION;
  if (revoked !== undefined && revoked !== "") {
    await requireInvalidOnBoth(revoked, replicaA, replicaB, "revoked");
  }

  console.log(
    JSON.stringify(
      {
        qualification: "partial-read-only",
        replicasChecked: 2,
        currentAuthorityConsistent: true,
        staleAuthorityChecked: Boolean(stale),
        revokedAuthorityChecked: Boolean(revoked),
        unverified: [
          "shared PostgreSQL topology and failover ownership",
          "proxy/load-balancer mutation retry policy",
          "all-replica T3 rollout and in-flight N-1 drain",
          "full 900-second drain before ACTIVE activation",
          "production pool/TLS/proxy deadline capacity",
        ],
      },
      null,
      2,
    ),
  );
}

function requiredUrl(name) {
  const value = process.env[name];
  if (value === undefined || value === "")
    throw new Error(`${name} is required.`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid origin.`);
  }
  if (
    url.protocol !== "https:" &&
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "localhost"
  ) {
    throw new Error(`${name} must use HTTPS outside localhost.`);
  }
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`${name} must be a clean origin without credentials.`);
  }
  return url;
}

function requiredSecret(name) {
  const value = process.env[name];
  if (value === undefined || value === "")
    throw new Error(`${name} is required.`);
  if (!/^vgb1\.[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error(`${name} does not have the Browser Session shape.`);
  }
  return value;
}

async function readSession(base, browser) {
  const url = new URL("/v1/guest/session", base);
  const response = await fetch(url, {
    headers: { cookie: `__Host-vaylet_guest_browser=${browser}` },
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });
  const text = await response.text();
  let body = {};
  if (text !== "") {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Replica returned non-JSON HTTP ${response.status}.`);
    }
  }
  return { body, status: response.status };
}

async function requireInvalidOnBoth(browser, replicaA, replicaB, label) {
  const results = await Promise.all([
    readSession(replicaA, browser),
    readSession(replicaB, browser),
  ]);
  for (const result of results) {
    if (result.status !== 401 || result.body.code !== "GUEST_ACCESS_INVALID") {
      throw new Error(
        `${label} Browser Session was not uniformly rejected by both replicas.`,
      );
    }
  }
}
