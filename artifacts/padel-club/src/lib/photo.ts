/**
 * A photo picked by the desk, made ready for the site before it is sent: no wider or
 * taller than 1600 px, re-encoded as WebP (JPEG where the browser cannot write WebP).
 * A phone photo of several megabytes becomes a few hundred kilobytes, and what the
 * camera wrote into the file (place, device) is left behind.
 */
const MAX_SIDE = 1600;

/** Thrown when the browser cannot read the file as a picture. */
export class UnreadablePhotoError extends Error {
  constructor() {
    super("The file is not a picture this browser can read");
    this.name = "UnreadablePhotoError";
  }
}

function load(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new UnreadablePhotoError());
    };
    img.src = url;
  });
}

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

export async function preparePhoto(file: Blob): Promise<Blob> {
  const img = await load(file);
  const { naturalWidth: w, naturalHeight: h } = img;
  if (!w || !h) throw new UnreadablePhotoError();
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new UnreadablePhotoError();
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const webp = await encode(canvas, "image/webp", 0.82);
  // A browser that cannot write WebP answers with a PNG instead
  if (webp?.type === "image/webp") return webp;
  // JPEG has no transparency: what was see-through becomes white, not black
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const jpeg = await encode(canvas, "image/jpeg", 0.85);
  if (!jpeg) throw new UnreadablePhotoError();
  return jpeg;
}
