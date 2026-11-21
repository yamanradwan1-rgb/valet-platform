import { beforeAll } from "vitest";

import { assertOwnedOptionCPg17 } from "./owned-target";

// First hook in every selected suite; no fixture may CREATE DATABASE before it.
beforeAll(() => assertOwnedOptionCPg17(), 25_000);
