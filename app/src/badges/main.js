import { decodeArtwork, importArtwork, maximumImages, originalCollection } from './images.js';
import { createBadgeScene } from './scene.js';
import { readStudio, saveStudio } from './storage.js';
import { normalizeSettings, serializeCollection, validColor } from './settings.js';
import { createStudioUI } from './studio-ui.js';
import { attachPresentation } from './presentation.js';

const wall = document.querySelector('.badge-wall');
const stage = document.querySelector('#badge-stage');
const status = document.querySelector('#badge-status');
const saveStatus = document.querySelector('#save-status');
const retry = document.querySelector('#retry-save');
const importInput = document.querySelector('#import-files');
const replaceInput = document.querySelector('#replace-file');

let scene, entries = [], settings;
let selected = 0, busy = true, dragging = 0;
let revision = 0, savedRevision = 0, saving = false, saveTimer;

async function decodeCollection(sources) {
  return Promise.all(sources.map(async item => {
    const source = item.builtin
      ? { ...originalCollection.find(design => design.builtin === item.builtin), metalColor: item.metalColor }
      : { ...item };
    return { source, image: await decodeArtwork(source) };
  }));
}

function select(index) {
  if (busy || presentation.isPresenting()) return;
  selected = index;
  ui.sync(entries, settings, selected);
}

function saveChanged() {
  revision++;
  saveStatus.textContent = '儲存中…';
  saveStatus.dataset.state = 'saving';
  retry.hidden = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 180);
}

async function persist() {
  if (saving) return;
  saving = true;
  try {
    while (savedRevision < revision) {
      const current = revision;
      await saveStudio(serializeCollection(entries), { ...settings });
      savedRevision = current;
    }
    saveStatus.textContent = '已儲存於本機';
    saveStatus.dataset.state = 'saved';
    retry.hidden = true;
  } catch (error) {
    console.error(error);
    saveStatus.textContent = '儲存失敗';
    saveStatus.dataset.state = 'error';
    retry.hidden = false;
    status.textContent = '瀏覽器無法儲存設定，請確認儲存空間後按「重新儲存」。';
  } finally {
    saving = false;
  }
}

function updateSettings(patch) {
  if (!scene || !entries.length) return;
  settings = normalizeSettings({ ...settings, ...patch });
  scene.updateAppearance(settings, entries.map(({ source }) => source));
  ui.sync(entries, settings, selected);
  saveChanged();
}

function updateColor(color) {
  if (!validColor(color) || !entries[selected]) return;
  entries[selected].source = { ...entries[selected].source, metalColor: color };
  updateSettings({ metalMode: 'custom' });
}

function setBusy(value) {
  busy = value;
  ui.setBusy(value);
  document.querySelector('#enter-showcase').disabled = value;
}

async function updateCollection(build, message) {
  if (!scene || busy) return;
  const focus = document.activeElement;
  setBusy(true);
  status.textContent = '正在處理圖片…';
  try {
    const next = await build();
    const prepared = scene.prepareCollection(next);
    prepared.commit(false);
    entries = next;
    selected = Math.min(selected, entries.length - 1);
    ui.showCollection(entries);
    ui.sync(entries, settings, selected);
    saveChanged();
    status.textContent = message;
  } catch (error) {
    console.error(error);
    status.textContent = error.message;
  } finally {
    setBusy(false);
    if (focus?.isConnected) focus.focus({ preventScroll: true });
  }
}

function importFiles(files) {
  if (!files.length || busy || presentation.isPresenting()) return;
  updateCollection(async () => {
    if (files.length > maximumImages) throw new Error(`每組最多 ${maximumImages} 張圖片。`);
    const next = [];
    for (const file of files) next.push(await importArtwork(file));
    selected = 0;
    return next;
  }, `已匯入 ${files.length} 張圖片。`);
}

const ui = createStudioUI({
  select,
  replace: () => replaceInput.click(),
  importCollection: () => importInput.click(),
  restore: () => updateCollection(() => decodeCollection(originalCollection), '已恢復 Renaiss 圖案。'),
  changeSetting: updateSettings,
  changeColor: updateColor,
});
const presentation = attachPresentation(wall, {
  enter: () => { scene?.stop(); status.textContent = ''; },
  leave: () => scene?.stop(),
});

document.querySelector('#replay').addEventListener('click', () => scene.replay());
document.querySelector('#turn-wall').addEventListener('click', () => scene.turnWall());
document.querySelector('#flip-wall').addEventListener('click', () => scene.flipWall());
retry.addEventListener('click', persist);
importInput.addEventListener('change', () => {
  const files = Array.from(importInput.files);
  importInput.value = '';
  importFiles(files);
});
replaceInput.addEventListener('change', () => {
  const file = replaceInput.files[0];
  replaceInput.value = '';
  if (!file) return;
  const index = selected;
  updateCollection(async () => {
    const next = entries.slice();
    const imported = await importArtwork(file);
    imported.source.metalColor = entries[index].source.metalColor;
    next[index] = imported;
    return next;
  }, `已替換「${file.name}」。`);
});

wall.addEventListener('dragenter', event => {
  if (!event.dataTransfer.types.includes('Files') || busy || presentation.isPresenting()) return;
  event.preventDefault();
  dragging++;
  wall.dataset.drop = 'true';
});
wall.addEventListener('dragover', event => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = busy || presentation.isPresenting() ? 'none' : 'copy';
});
wall.addEventListener('dragleave', () => {
  if (dragging && --dragging === 0) wall.dataset.drop = 'false';
});
wall.addEventListener('drop', event => {
  if (!event.dataTransfer.files.length) return;
  event.preventDefault();
  dragging = 0;
  wall.dataset.drop = 'false';
  importFiles(Array.from(event.dataTransfer.files));
});

async function start() {
  try {
    const stored = await readStudio();
    settings = normalizeSettings(stored.settings);
    entries = await decodeCollection(stored.collection ?? originalCollection);
    scene = createBadgeScene(stage, {
      settings, select, graphicsError: message => { status.textContent = message; },
    });
    scene.prepareCollection(entries).commit(false);
    ui.showCollection(entries);
    ui.sync(entries, settings, selected);
    status.textContent = '';
    saveStatus.textContent = '已儲存於本機';
    saveStatus.dataset.state = 'saved';
    for (const id of ['replay', 'turn-wall', 'flip-wall']) document.getElementById(id).disabled = false;
    setBusy(false);
  } catch (error) {
    console.error(error);
    scene?.dispose();
    scene = undefined;
    entries = [];
    status.textContent = error.message;
    saveStatus.textContent = '載入失敗';
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && revision > savedRevision) { clearTimeout(saveTimer); persist(); }
});
window.addEventListener('pagehide', event => { if (!event.persisted) scene?.dispose(); });
start();
