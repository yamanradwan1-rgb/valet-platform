import type { Page, Request, Route } from "@playwright/test";

type Mode = "success" | "failure";

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export async function installDelayedRealResponse(
  page: Page,
  matches: (request: Request) => boolean,
) {
  let armed:
    | {
        readonly mode: Mode;
        readonly started: Deferred;
        readonly released: Deferred;
      }
    | undefined;

  await page.route("**/v1/staff/**", async (route: Route) => {
    const current = armed;
    if (!current || !matches(route.request())) {
      await route.continue();
      return;
    }
    armed = undefined;
    const response = await route.fetch();
    current.started.resolve();
    await current.released.promise;
    if (current.mode === "failure") {
      await route.abort("connectionfailed");
      return;
    }
    await route.fulfill({ response });
  });

  return {
    arm(mode: Mode) {
      if (armed) throw new Error("A delayed real response is already armed.");
      const started = deferred();
      const released = deferred();
      armed = { mode, started, released };
      return {
        started: started.promise,
        release: released.resolve,
      };
    },
  };
}
