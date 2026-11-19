import { artworkMetal } from './settings.js';

export function createStudioUI({ select, replace, importCollection, restore, changeSetting, changeColor }) {
  const grid = document.querySelector('#badge-images');
  const elements = {
    selectedImage: document.querySelector('#selected-image'),
    selectedName: document.querySelector('#selected-name'),
    color: document.querySelector('#metal-color'),
    hex: document.querySelector('#metal-hex'),
    custom: document.querySelector('#custom-metal'),
    preserve: document.querySelector('#preserve-artwork'),
    roughness: document.querySelector('#roughness'),
    curved: document.querySelector('#curved-surface'),
    trim: document.querySelector('#metal-trim'),
    relief: document.querySelector('#relief-enabled'),
    reliefHeight: document.querySelector('#relief-height'),
    reliefControls: document.querySelector('#relief-controls'),
    glide: document.querySelector('#glide-duration'),
    rotation: document.querySelector('#rotation-sensitivity'),
  };
  const replaceButton = document.querySelector('#replace-image');
  const importButton = document.querySelector('#import-collection');
  const restoreButton = document.querySelector('#restore');
  let thumbnails = [];

  function showCollection(entries) {
    thumbnails = entries.map(({ image }) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 104;
      const scale = 80 / Math.max(image.canvas.width, image.canvas.height);
      const width = image.canvas.width * scale, height = image.canvas.height * scale;
      canvas.getContext('2d').drawImage(image.canvas, (104 - width) / 2, (104 - height) / 2, width, height);
      return canvas.toDataURL();
    });
    grid.replaceChildren(...entries.map(({ source }, index) => {
      const button = document.createElement('button');
      button.className = 'badge-image';
      button.type = 'button';
      button.setAttribute('aria-label', `選取 ${source.name}`);
      button.title = source.name;
      const img = document.createElement('img');
      img.src = thumbnails[index];
      img.alt = '';
      const name = document.createElement('span');
      name.textContent = source.name;
      button.append(img, name);
      button.addEventListener('click', () => select(index));
      return button;
    }));
    document.querySelector('#image-count').textContent = `${entries.length} 個圖案`;
  }

  function sync(entries, settings, selected) {
    const entry = entries[selected];
    if (!entry) return;
    for (const [index, tile] of Array.from(grid.children).entries()) {
      tile.setAttribute('aria-pressed', String(index === selected));
    }
    elements.selectedImage.src = thumbnails[selected];
    elements.selectedName.textContent = entry.source.name;
    elements.selectedName.title = entry.source.name;
    const color = artworkMetal(entry.source, selected);
    elements.color.value = color;
    elements.hex.textContent = color.toUpperCase();
    elements.color.disabled = settings.metalMode !== 'custom';
    elements.custom.hidden = settings.metalMode !== 'custom';
    document.querySelectorAll('[name="metal-mode"]').forEach(input => {
      input.checked = input.value === settings.metalMode;
    });
    elements.preserve.checked = settings.preserveArtwork;
    elements.roughness.value = Math.round(settings.roughness * 100);
    elements.curved.checked = settings.curvedSurface;
    elements.trim.checked = settings.metalTrim;
    elements.relief.checked = settings.reliefEnabled;
    elements.reliefHeight.value = Math.round(settings.reliefHeight * 1000);
    elements.reliefControls.hidden = !settings.reliefEnabled;
    elements.glide.value = settings.glideDuration;
    elements.rotation.value = settings.rotationSensitivity;
    document.querySelector('#roughness-value').textContent = `${Math.round((.45 - settings.roughness) / .33 * 100)}%`;
    document.querySelector('#relief-value').textContent = `${Math.round((settings.reliefHeight - .004) / .026 * 100)}%`;
    document.querySelector('#glide-value').textContent = settings.glideDuration === 0 ? '關閉' : `${settings.glideDuration.toFixed(1)} 秒`;
    document.querySelector('#rotation-value').textContent = `${settings.rotationSensitivity}° / 100 px`;
  }

  function setBusy(busy) {
    replaceButton.disabled = importButton.disabled = restoreButton.disabled = busy;
    grid.querySelectorAll('button').forEach(button => { button.disabled = busy; });
  }

  document.querySelectorAll('[name="metal-mode"]').forEach(input => {
    input.addEventListener('change', () => changeSetting({
      metalMode: input.value,
      ...(input.value !== 'custom' && { preserveArtwork: false }),
    }));
  });
  elements.color.addEventListener('input', () => changeColor(elements.color.value));
  document.querySelectorAll('[data-metal]').forEach(button => {
    button.addEventListener('click', () => changeColor(button.dataset.metal));
  });
  elements.preserve.addEventListener('change', () => changeSetting({ preserveArtwork: elements.preserve.checked }));
  elements.roughness.addEventListener('input', () => changeSetting({ roughness: Number(elements.roughness.value) / 100 }));
  elements.curved.addEventListener('change', () => changeSetting({ curvedSurface: elements.curved.checked }));
  elements.trim.addEventListener('change', () => changeSetting({ metalTrim: elements.trim.checked }));
  elements.relief.addEventListener('change', () => changeSetting({ reliefEnabled: elements.relief.checked }));
  elements.reliefHeight.addEventListener('input', () => changeSetting({ reliefHeight: Number(elements.reliefHeight.value) / 1000 }));
  elements.glide.addEventListener('input', () => changeSetting({ glideDuration: Number(elements.glide.value) }));
  elements.rotation.addEventListener('input', () => changeSetting({ rotationSensitivity: Number(elements.rotation.value) }));
  replaceButton.addEventListener('click', replace);
  importButton.addEventListener('click', importCollection);
  restoreButton.addEventListener('click', restore);

  return { showCollection, sync, setBusy };
}
