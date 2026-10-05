/**
 * Client-side photo prep for flower uploads: decode → downscale → WebP.
 *
 * Phone photos are routinely 4–12 MB; shipping them base64 through a server
 * function is slow and trips the bucket's 5 MB limit. Re-encoding in the
 * browser keeps uploads ~200–500 KB and normalises odd formats/orientations.
 */

const MAX_EDGE = 1600;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export type PreparedImage = { base64: string; mimeType: string };

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the photo."));
    reader.readAsDataURL(blob);
  });
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("That file isn't an image.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Photo is over 25 MB — pick a smaller one.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "This browser can't read that photo format (HEIC?). Export it as JPEG or PNG and try again.",
    );
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the photo.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Safari < 17 silently returns PNG for unsupported WebP — fall back to JPEG.
  let blob = await canvasToBlob(canvas, "image/webp", 0.85);
  if (!blob || blob.type !== "image/webp") {
    blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
  }
  if (!blob) throw new Error("Could not process the photo.");
  return { base64: await blobToBase64(blob), mimeType: blob.type };
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
