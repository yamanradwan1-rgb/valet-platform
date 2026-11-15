import { beforeAll } from "vitest";

import { assertOwnedOptionCAfterPg17 } from "../issue416-option-c-t5/owned-target";

beforeAll(() => assertOwnedOptionCAfterPg17(), 25_000);
