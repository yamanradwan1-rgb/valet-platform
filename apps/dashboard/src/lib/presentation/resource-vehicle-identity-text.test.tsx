import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResourceVehicleIdentity } from "./resource-vehicle-identity-text";

describe("resource identity bidi rendering", () => {
  it("isolates normalized plates LTR in Arabic", () => {
    expect(
      renderToStaticMarkup(
        <ResourceVehicleIdentity
          locale="ar"
          vehicle={{
            plateNumberNormalized: "12345",
            temporaryDescriptor: null,
          }}
        />,
      ),
    ).toBe('<bdi dir="ltr">12345</bdi>');
  });

  it("automatically isolates mixed-language descriptors", () => {
    expect(
      renderToStaticMarkup(
        <ResourceVehicleIdentity
          locale="ar"
          vehicle={{
            plateNumberNormalized: null,
            temporaryDescriptor: "سيارة Blue",
          }}
        />,
      ),
    ).toBe('<bdi dir="auto">سيارة Blue</bdi>');
  });
});
