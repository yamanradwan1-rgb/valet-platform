import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/** Test-only ephemeral CA/leaf; no insecure TLS switch and no checked-in key. */
export function createIssue429TlsFixture(repositoryRoot, opensslPath = "openssl") {
  const root = resolve(repositoryRoot, "tmp");
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "issue429-qa-tls-"));
  const certificatePath = join(directory, "mock-ca.pem");
  const privateKeyPath = join(directory, "mock-key.pem");
  try {
    execFileSync(opensslPath, [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256",
      "-days", "1", "-subj", "/CN=issue429-local-test-ca",
      "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost",
      "-addext", "basicConstraints=critical,CA:TRUE",
      "-keyout", privateKeyPath, "-out", certificatePath,
    ], { timeout: 20_000, windowsHide: true, stdio: "ignore" });
    return {
      certificatePath,
      certificate: readFileSync(certificatePath, "utf8"),
      privateKey: readFileSync(privateKeyPath, "utf8"),
      close() {
        const actual = realpathSync(directory);
        if (!actual.startsWith(realpathSync(root) + sep) ||
            !actual.startsWith(realpathSync(root) + sep + "issue429-qa-tls-")) {
          throw new Error("Unsafe scoped TLS fixture cleanup target.");
        }
        rmSync(actual, { recursive: true, force: false });
      },
    };
  } catch (error) {
    // The path was minted under the owned prefix in this invocation.
    if (directory.startsWith(root + sep + "issue429-qa-tls-")) {
      rmSync(directory, { recursive: true, force: true });
    }
    throw new Error(`Synthetic TLS certificate generation unavailable: ${error.code ?? "OPENSSL_ERROR"}`);
  }
}
