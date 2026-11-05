import type { PlateOcrRequest, PlateOcrResponse } from "@valet/contracts";
import type { PlateRecognizerSnapshotProvider } from "../src/modules/check-in-api/plate-recognizer-snapshot.provider";

/** Local mocked-HTTP tests explicitly opt into the observed provider boundary. */
export async function recognizeWithTestPermit(
  provider: PlateRecognizerSnapshotProvider,
  input: {
    readonly image: Uint8Array;
    readonly plateCountry: PlateOcrRequest["plateCountry"];
  },
): Promise<PlateOcrResponse> {
  const observation = await provider.recognizeObserved(input, {
    permit: { consumeIfFresh: () => true },
    signal: new AbortController().signal,
  });
  return observation.response;
}
