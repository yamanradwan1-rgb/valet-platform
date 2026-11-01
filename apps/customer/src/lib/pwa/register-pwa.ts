let loadListenerAttached = false;
let registrationAttempt: Promise<ServiceWorkerRegistration> | null = null;

function startRegistration(): void {
  loadListenerAttached = false;
  if (registrationAttempt) return;

  try {
    const script =
      process.env.NODE_ENV === "development"
        ? "/sw.js?development=1"
        : "/sw.js";
    registrationAttempt = Promise.resolve(
      navigator.serviceWorker.register(script),
    );
    void registrationAttempt.catch(() => {
      // A later initialization may retry after a transient registration failure.
      registrationAttempt = null;
    });
  } catch {
    // Registration is optional; synchronous browser failures are retryable too.
    registrationAttempt = null;
  }
}

export function registerServiceWorker(): void {
  if (
    (process.env.NODE_ENV !== "production" &&
      process.env.NODE_ENV !== "development") ||
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    window.isSecureContext !== true ||
    typeof navigator === "undefined" ||
    typeof navigator.serviceWorker?.register !== "function"
  )
    return;

  if (registrationAttempt) return;
  if (document.readyState === "complete") {
    if (loadListenerAttached) {
      window.removeEventListener("load", startRegistration);
      loadListenerAttached = false;
    }
    startRegistration();
  } else if (!loadListenerAttached) {
    loadListenerAttached = true;
    window.addEventListener("load", startRegistration, { once: true });
  }
}
