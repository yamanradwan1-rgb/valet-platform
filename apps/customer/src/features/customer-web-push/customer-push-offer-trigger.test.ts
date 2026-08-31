import { describe, expect, it, vi } from "vitest";

import {
  offerCustomerPushAfterRetrieval,
  shouldOfferCustomerPushForSession,
} from "./customer-push-offer-trigger";

describe("Customer push offer timing", () => {
  it("appears only after successful Request Vehicle and never asks permission itself", () => {
    const close = vi.fn();
    const offer = vi.fn();
    offerCustomerPushAfterRetrieval(false, close, offer);
    expect(close).not.toHaveBeenCalled();
    expect(offer).not.toHaveBeenCalled();
    offerCustomerPushAfterRetrieval(true, close, offer);
    expect(close).toHaveBeenCalledOnce();
    expect(offer).toHaveBeenCalledOnce();
  });

  it("preserves successful Request Vehicle completion when notification UX fails", () => {
    const close = vi.fn();
    expect(() =>
      offerCustomerPushAfterRetrieval(true, close, () => {
        throw new Error("push unavailable");
      }),
    ).not.toThrow();
    expect(close).toHaveBeenCalledOnce();
  });

  it("can restore the offer after opening an authorized Home Screen app for an existing request", () => {
    expect(shouldOfferCustomerPushForSession("REQUESTED")).toBe(true);
    expect(shouldOfferCustomerPushForSession("RETRIEVING")).toBe(true);
    expect(shouldOfferCustomerPushForSession("PARKED")).toBe(false);
    expect(shouldOfferCustomerPushForSession("READY")).toBe(false);
  });
});
