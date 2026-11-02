import net from "node:net";
import type { AddressInfo } from "node:net";
import { StaffMfaTestFixture } from "./staff-mfa-test-fixture";

// A real PostgreSQL wire proxy: no proof logging, no synthetic COMMIT exception.
export class MfaDisableFailureFixture extends StaffMfaTestFixture {
  private proxy: net.Server | undefined;
  private readonly sockets = new Set<net.Socket>();
  drop: "before-commit" | "commit-response" | "rollback-response" | null = null;
  committed: (() => Promise<void>) | undefined;
  readonly faults: unknown[] = [];

  override async start() {
    const target = new URL(
      process.env.TEST_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL!,
    );
    this.proxy = net.createServer((front) => {
      const back = net.connect(Number(target.port || 5432), target.hostname);
      front.setNoDelay(true);
      back.setNoDelay(true);
      this.sockets.add(front);
      this.sockets.add(back);
      let pending = Buffer.alloc(0),
        startup = true,
        audit = false,
        suppress = false;
      const destroy = () => {
        front.destroy();
        back.destroy();
      };
      front.on("error", destroy);
      back.on("error", destroy);
      front.on("close", () => {
        this.sockets.delete(front);
        back.destroy();
      });
      back.on("close", () => {
        this.sockets.delete(back);
        front.destroy();
      });
      front.on("data", (data) => {
        pending = Buffer.concat([pending, data]);
        while (pending.length >= (startup ? 4 : 5)) {
          const size = startup
            ? pending.readUInt32BE(0)
            : 1 + pending.readUInt32BE(1);
          if (pending.length < size) return;
          const frame = pending.subarray(0, size);
          pending = pending.subarray(size);
          if (startup) {
            startup = false;
            back.write(frame);
            continue;
          }
          // Inspect only SQL Parse/Query text, never parameter/proof Bind messages.
          let sql = "";
          if (frame[0] === 81)
            sql = frame.subarray(5, frame.length - 1).toString();
          if (frame[0] === 80) {
            const start = frame.indexOf(0, 5) + 1;
            sql = frame.subarray(start, frame.indexOf(0, start)).toString();
          }
          if (sql === "BEGIN") audit = false;
          audit ||= sql.includes(
            "append_runtime_account_security_audit_event(",
          );
          if (
            this.drop === "before-commit" &&
            sql.includes("SET state='RETIRED'")
          ) {
            this.drop = null;
            back.write(frame);
            destroy();
            return;
          }
          if (this.drop === "commit-response" && audit && sql === "COMMIT") {
            this.drop = null;
            suppress = true;
            back.write(frame);
            void this.committed?.().then(destroy, (error) => {
              this.faults.push(error);
              destroy();
            });
            return;
          }
          if (this.drop === "rollback-response" && sql === "ROLLBACK") {
            this.drop = null;
            suppress = true;
            back.write(frame);
            destroy();
            return;
          }
          if (sql === "COMMIT" || sql === "ROLLBACK") audit = false;
          back.write(frame);
        }
      });
      back.on("data", (data) => {
        if (!suppress) front.write(data);
      });
    });
    await new Promise<void>((resolve) =>
      this.proxy!.listen(0, "127.0.0.1", resolve),
    );
    await super.start();
  }
  protected override applicationDatabaseUrl(url: string) {
    const result = new URL(url);
    result.hostname = "127.0.0.1";
    result.port = String((this.proxy!.address() as AddressInfo).port);
    return result.toString();
  }
  override async stop() {
    try {
      await super.stop();
    } finally {
      for (const socket of this.sockets) socket.destroy();
      await new Promise<void>((resolve) => this.proxy?.close(() => resolve()));
    }
  }
}
