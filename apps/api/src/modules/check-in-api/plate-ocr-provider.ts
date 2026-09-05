import type { PlateOcrRequest, PlateOcrResponse } from "@valet/contracts";

export const PLATE_OCR_PROVIDER = Symbol("PLATE_OCR_PROVIDER");
export interface PlateOcrProvider {
  recognize(input: {
    readonly image: Uint8Array;
    readonly plateCountry: PlateOcrRequest["plateCountry"];
  }): Promise<PlateOcrResponse>;
}
