/**
 * Employee camera/QR capture copy (VUI-012 / DEC-067). Split from the
 * alphabetical base dictionary so each locale's authored file stays within
 * the repository structure limits (docs/17). Every state is truthful: a
 * failure never implies success and always leaves manual entry available.
 */
export const nativeEmployeeEnglishScannerDictionary = {
  scannerCameraBusy:
    "The camera is being used by another application. Close it and try again.",
  scannerCameraError: "The camera could not be started. Please try again.",
  scannerCameraPermissionDenied:
    "Camera access was denied. Allow camera permission in your browser settings, or enter the code manually.",
  scannerCameraUnavailable:
    "The camera is not available in this browser or requires a secure connection.",
  scannerCloseScanner: "Close scanner",
  scannerManualAlwaysAvailable:
    "You can enter the code manually at any time below.",
  scannerNoCameraFound: "No camera was found on this device.",
  scannerScanningHint: "Point the camera at the QR code",
  scannerStartingCamera: "Starting camera...",
  scannerStartScan: "Scan QR code",
  scannerUnreadableQr: "This QR code could not be read as a valid code.",
  scannerWrongTypeHandoff: "This QR code is not a guest handoff QR code.",
  scannerWrongTypeKeySlot: "This QR code is not a key slot code.",
  scannerWrongTypeParkingSpot: "This QR code is not a parking spot code.",
} as const;
