export const gold = '#e5b66f';
export const silver = '#cbd3df';
export const copper = '#e6ac6e';

const originalMetals = [copper, '#cdaec0', '#e7c574', '#bdcde7', '#d9b56a', '#dc9a76', '#bcc7d7'];
export const defaultSettings = {
  metalMode: 'custom',
  preserveArtwork: true,
  roughness: .2,
  curvedSurface: true,
  reliefEnabled: false,
  reliefHeight: .008,
  glideDuration: 2.2,
  rotationSensitivity: 60,
};

const colorPattern = /^#[0-9a-f]{6}$/i;
export const validColor = value => typeof value === 'string' && colorPattern.test(value);

export function normalizeSettings(stored = {}) {
  function number(key, min, max) {
    return Number.isFinite(stored[key]) ? Math.max(min, Math.min(max, stored[key])) : defaultSettings[key];
  }
  return {
    metalMode: ['gold', 'silver', 'custom'].includes(stored.metalMode) ? stored.metalMode : 'custom',
    preserveArtwork: typeof stored.preserveArtwork === 'boolean' ? stored.preserveArtwork : true,
    roughness: number('roughness', .12, .45),
    curvedSurface: typeof stored.curvedSurface === 'boolean' ? stored.curvedSurface : true,
    reliefEnabled: typeof stored.reliefEnabled === 'boolean' ? stored.reliefEnabled : false,
    reliefHeight: number('reliefHeight', .004, .03),
    glideDuration: number('glideDuration', 0, 3.5),
    rotationSensitivity: number('rotationSensitivity', 15, 120),
  };
}

export function artworkMetal(source, index) {
  return validColor(source.metalColor) ? source.metalColor : originalMetals[index % originalMetals.length];
}

export function displayMetal(settings, source, index) {
  if (settings.metalMode === 'gold') return gold;
  if (settings.metalMode === 'silver') return silver;
  return artworkMetal(source, index);
}

export function serializeCollection(entries) {
  return entries.map(({ source }) => source.builtin
    ? { builtin: source.builtin, metalColor: source.metalColor }
    : source);
}
