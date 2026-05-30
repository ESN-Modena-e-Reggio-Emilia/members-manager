const MAX_DIMENSION = 800; // px - enough for retina at 128px display size
const MAX_SIZE_BYTES = 512 * 1024; // 512 KB

const toJpegBlob = (
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas is empty'))),
      'image/jpeg',
      quality,
    ),
  );

export const getCroppedImg = async (
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
): Promise<Blob> => {
  const image = new Image();
  image.src = imageSrc;
  await new Promise((resolve) => (image.onload = resolve));

  // Scale down to MAX_DIMENSION if larger
  const scale = Math.min(
    1,
    MAX_DIMENSION / Math.max(pixelCrop.width, pixelCrop.height),
  );
  const outW = Math.round(pixelCrop.width * scale);
  const outH = Math.round(pixelCrop.height * scale);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');

  canvas.width = outW;
  canvas.height = outH;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outW,
    outH,
  );

  // Iteratively reduce quality until under MAX_SIZE_BYTES
  let quality = 0.92;
  let blob = await toJpegBlob(canvas, quality);
  while (blob.size > MAX_SIZE_BYTES && quality > 0.1) {
    quality = Math.round((quality - 0.05) * 100) / 100;
    blob = await toJpegBlob(canvas, quality);
  }

  return blob;
};
