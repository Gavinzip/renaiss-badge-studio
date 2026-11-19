import protocol from './artwork/protocol.webp';
import lab from './artwork/lab.webp';
import cli from './artwork/cli.webp';
import sdk from './artwork/sdk.webp';
import skill from './artwork/skill.webp';
import shop from './artwork/shop.webp';
import vault from './artwork/vault.webp';

export const originalCollection = [
  { builtin: 'protocol', name: 'Renaiss Protocol', url: protocol },
  { builtin: 'lab', name: 'Renaiss Lab', url: lab },
  { builtin: 'cli', name: 'Renaiss CLI', url: cli },
  { builtin: 'sdk', name: 'Renaiss SDK', url: sdk },
  { builtin: 'skill', name: 'Renaiss Skill', url: skill },
  { builtin: 'shop', name: 'Shop OS', url: shop },
  { builtin: 'vault', name: 'Vault OS', url: vault },
];

export const maximumImages = 24;
const maximumBytes = 12 * 1024 * 1024;
const texturesSize = 512;
const imageTypes = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml',
};

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export async function decodeArtwork({ url, blob }) {
  const temporaryUrl = blob && URL.createObjectURL(blob);
  const image = new Image();
  image.src = url ?? temporaryUrl;
  try {
    await image.decode();
    if (!(image.naturalWidth && image.naturalHeight)) throw new Error('圖片沒有有效尺寸。');
    const ratio = Math.min(1, texturesSize / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = createCanvas(
      Math.max(1, Math.round(image.naturalWidth * ratio)),
      Math.max(1, Math.round(image.naturalHeight * ratio)),
    );
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return trimArtwork(canvas, context);
  } finally {
    if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
  }
}

function trimArtwork(canvas, context) {
  const { width, height } = canvas;
  const { data } = context.getImageData(0, 0, width, height);
  let left = width, right = -1, top = height, bottom = -1, openPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 112) {
        openPixels++;
        continue;
      }
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw new Error('圖片是全透明的。');
  if (!openPixels) return { canvas, transparent: false };
  const cropped = createCanvas(right - left + 1, bottom - top + 1);
  cropped.getContext('2d').drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  const transparent = 1 - (width * height - openPixels) / (cropped.width * cropped.height) > .009;
  return { canvas: cropped, transparent };
}

export async function importArtwork(file) {
  const type = imageTypes[file.name.split('.').at(-1).toLowerCase()];
  if (!type || file.size === 0) throw new Error(`「${file.name}」不是支援的圖片。`);
  if (file.size > maximumBytes) throw new Error(`「${file.name}」超過 12 MB。`);
  const name = file.name.replace(/\.[^.]+$/, '');
  try {
    const image = await decodeArtwork({ blob: file.slice(0, file.size, type) });
    // Store a bounded, inert PNG. The original stays with the user.
    const blob = await new Promise((resolve, reject) => image.canvas.toBlob(
      result => result ? resolve(result) : reject(new Error('圖片無法編碼。')), 'image/png',
    ));
    return { source: { name, blob }, image };
  } catch (error) {
    throw new Error(`無法讀取「${file.name}」，請確認圖片能正常開啟。`, { cause: error });
  }
}
