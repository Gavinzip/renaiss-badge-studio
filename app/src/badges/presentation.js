export function attachPresentation(wall, { enter, leave }) {
  const trigger = document.querySelector('#enter-showcase');
  const back = document.querySelector('#leave-showcase');
  const chrome = wall.querySelectorAll('.studio-header, .studio-panel, .preview-toolbar, .preview-hints');
  let hideTimer;
  let presenting = false;
  let editorScroll = 0;

  function hideReturn() {
    wall.dataset.return = 'hidden';
  }

  function showReturn() {
    wall.dataset.return = 'visible';
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideReturn, 1600);
  }

  function sync() {
    const next = location.hash === '#showcase';
    if (next === presenting) return;
    presenting = next;
    clearTimeout(hideTimer);
    document.documentElement.dataset.mode = presenting ? 'showcase' : 'editor';
    wall.dataset.mode = presenting ? 'showcase' : 'editor';
    hideReturn();
    chrome.forEach(element => { element.inert = presenting; });
    back.tabIndex = presenting ? 0 : -1;
    if (presenting) {
      editorScroll = window.scrollY;
      document.activeElement?.blur();
      window.scrollTo(0, 0);
      enter();
    } else {
      leave();
      window.scrollTo(0, editorScroll);
      trigger.focus({ preventScroll: true });
    }
  }

  trigger.addEventListener('click', () => { location.hash = 'showcase'; });
  window.addEventListener('hashchange', sync);
  document.addEventListener('pointermove', event => {
    if (!presenting || event.pointerType === 'touch') return;
    if (event.clientX < 190 && event.clientY < 95) showReturn();
    else if (document.activeElement !== back) hideReturn();
  });
  document.addEventListener('pointerup', event => {
    if (presenting && event.pointerType === 'touch' && event.clientX < 190 && event.clientY < 95) showReturn();
  });
  document.addEventListener('keydown', event => {
    if (!presenting) return;
    if (event.key === 'Escape') location.hash = 'editor';
  });
  back.addEventListener('focus', showReturn);
  back.addEventListener('blur', hideReturn);
  back.tabIndex = -1;
  sync();
  return { isPresenting: () => presenting };
}
