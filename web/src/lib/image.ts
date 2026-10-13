/** Client-side image prep: keeps uploads small so a phone on campus wifi can post a duel. */
import { sha256 } from "@noble/hashes/sha256";
import { toHex } from "viem";

const MAX_EDGE = 1600;
const QUALITY = 0.85;

export interface Prepared {
  file: File;
  /** Preview URL for the drop zone. */
  preview: string;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("That file is not a readable image."));
      image.src = url;
    });
  } finally {
    // The element keeps its decoded copy, so the blob URL can go.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Scales the longest edge down to 1600px and re-encodes as JPEG. */
export async function compress(file: File): Promise<Prepared> {
  const bitmap = await loadBitmap(file);
  const width = "width" in bitmap ? bitmap.width : 0;
  const height = "height" in bitmap ? bitmap.height : 0;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot process images. Try another one.");
  context.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("Could not compress that image. Try a different file.");

  const name = file.name.replace(/\.[^.]+$/, "") || "artwork";
  return {
    file: new File([blob], `${name}.jpg`, { type: "image/jpeg" }),
    preview: canvas.toDataURL("image/jpeg", 0.7),
  };
}

/** sha256 of the file bytes, matching what the server and the contract store. */
export async function hashFile(file: File): Promise<`0x${string}`> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return toHex(sha256(bytes));
}
