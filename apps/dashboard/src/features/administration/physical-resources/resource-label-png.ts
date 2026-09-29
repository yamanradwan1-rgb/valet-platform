import type { PhysicalResourceLabel } from "@valet/contracts";
import QRCode from "qrcode";

export const LABEL_CANVAS_WIDTH = 1200;
export const LABEL_CANVAS_HEIGHT = 1500;
export const LABEL_QR_SIZE = 960;

function safeFilenameCharacter(character: string) {
  const code = character.codePointAt(0) ?? 0;
  return code > 31 && !'<>:"/\\|?*'.includes(character);
}

export function resourceLabelFilename(label: PhysicalResourceLabel) {
  const kind = label.resourceType === "KEY_SLOT" ? "key-slot" : "parking-spot";
  const safeCode = [...label.code.normalize("NFKC")]
    .map((character) => (safeFilenameCharacter(character) ? character : "-"))
    .join("")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "resource";
  return `vaylet-${kind}-${safeCode}.png`;
}

export function resourceQrDataUrl(payload: string, width = 480) {
  return QRCode.toDataURL(payload, {
    color: { dark: "#07111F", light: "#FFFFFF" },
    errorCorrectionLevel: "M",
    margin: 4,
    width,
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("QR image could not be rendered."));
    image.src = url;
  });
}

export async function renderPhysicalResourceLabelPng(
  label: PhysicalResourceLabel,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_CANVAS_WIDTH;
  canvas.height = LABEL_CANVAS_HEIGHT;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Canvas is unavailable.");

  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#07111F";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "900 58px Arial, sans-serif";
  context.fillText("VAYLET", 600, 72);
  context.font = "800 38px Arial, sans-serif";
  context.fillText(
    label.resourceType === "KEY_SLOT" ? "KEY SLOT" : "PARKING SPOT",
    600,
    135,
  );
  context.direction = "ltr";
  context.font = "900 64px ui-monospace, monospace";
  context.fillText(label.code, 600, 215, 1080);

  const qrUrl = await resourceQrDataUrl(label.qrPayload, LABEL_QR_SIZE);
  const qrImage = await loadImage(qrUrl);
  context.imageSmoothingEnabled = false;
  context.drawImage(qrImage, 120, 280, LABEL_QR_SIZE, LABEL_QR_SIZE);

  context.fillStyle = "#07111F";
  context.direction = "inherit";
  context.font = "700 34px Arial, sans-serif";
  context.fillText(label.location.name, 600, 1305, 1060);
  context.direction = "ltr";
  context.font = "700 30px ui-monospace, monospace";
  context.fillText(label.location.code, 600, 1360, 1060);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error("PNG generation failed.")) : resolve(blob)),
      "image/png",
    );
  });
}

export function downloadPhysicalResourceLabel(
  blob: Blob,
  filename: string,
) {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
