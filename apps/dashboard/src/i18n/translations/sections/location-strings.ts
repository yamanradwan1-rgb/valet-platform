/**
 * D2-005 — authorized-location bootstrap and switching surfaces.
 */

export interface LocationStrings {
  /** Accessible name of the top-bar location selector. */
  "location.selectorLabel": string;
  /** Bootstrap in flight (gate loader and defensive shell label). */
  "location.loadingLocations": string;
  /** Bootstrap failure title (distinct from zero authorized locations). */
  "location.loadFailedTitle": string;
  /** Bootstrap failure body with retry guidance; never shown as empty list. */
  "location.loadFailed": string;
}

export const locationEn: LocationStrings = {
  "location.selectorLabel": "Switch location",
  "location.loadingLocations": "Loading your locations…",
  "location.loadFailedTitle": "Locations could not be loaded",
  "location.loadFailed":
    "Your authorized locations could not be loaded. Check your connection and try again.",
};

export const locationAr: LocationStrings = {
  "location.selectorLabel": "تبديل الموقع",
  "location.loadingLocations": "جارٍ تحميل مواقعك…",
  "location.loadFailedTitle": "تعذر تحميل المواقع",
  "location.loadFailed":
    "تعذر تحميل المواقع المصرّح لك بها. تحقق من اتصالك وحاول مرة أخرى.",
};
