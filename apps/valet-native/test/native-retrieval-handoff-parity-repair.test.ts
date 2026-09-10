import { describe, expect, it } from "vitest";

import {
  getNativeHandoffCopy,
  presentHandoffFailure,
} from "../src/handoff/native-handoff-copy";
import { getNativeRetrievalCopy } from "../src/retrieval/native-retrieval-copy";
import { presentRetrievalFailure } from "../src/retrieval/native-retrieval-presentation";

describe("UI-PARITY-10 review copy and error presentation", () => {
  it("uses exact current Web retrieval submission strings", () => {
    expect(getNativeRetrievalCopy("en").startingRetrieval).toBe(
      "Starting Retrieval...",
    );
    expect(getNativeRetrievalCopy("ar").startingRetrieval).toBe(
      "جارٍ بدء الاسترجاع...",
    );
  });

  it("uses exact current Web Arabic Retrieval failure presentation", () => {
    const copy = getNativeRetrievalCopy("ar");
    expect(
      presentRetrievalFailure("Raw server text", "ar", copy.operationFailed),
    ).toBe("تعذر تنفيذ العملية. حدّث الصفحة وحاول مجدداً.");
    expect(
      presentRetrievalFailure(
        "Raw server text",
        "en",
        getNativeRetrievalCopy("en").operationFailed,
      ),
    ).toBe("Raw server text");
  });

  it("uses exact current Web handoff and retry strings", () => {
    const en = getNativeHandoffCopy("en");
    const ar = getNativeHandoffCopy("ar");
    expect(ar.awaiting).toBe("في انتظار إثبات الضيف");
    expect(ar.beginning).toBe("جارٍ بدء التسليم...");
    expect(
      presentHandoffFailure(en, {
        message: "Request failed.",
        retryAfter: 9,
      }),
    ).toBe("Request failed. Retry in 9s.");
    expect(
      presentHandoffFailure(ar, {
        message: "تعذر التحقق.",
        retryAfter: 9,
      }),
    ).toBe("تعذر التحقق. أعد المحاولة خلال 9s.");
  });
});
