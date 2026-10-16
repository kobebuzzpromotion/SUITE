// Reuse the existing synthetic non-RAW product Editor/Worker fixture. This
// probe drives the *new* side controls, while the original probe continues to
// cover tone Recipe, Undo/Redo, Save/Reload and actual Worker Final pixels.
import './histogram-clipping-editor-browser-fixture.mjs';

const byID = id => document.getElementById(id);
const expect = (condition, label) => {
  if (!condition) throw Error(`HISTOGRAM_SIDES_BROWSER_ASSERTION: ${label}`);
};
const pixel = async (url, x) => {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', {willReadFrequently: true});
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return [...context.getImageData(x, 3, 1, 1).data];
};
const selected = () => ({
  shadow: byID('clipping-shadow-toggle').getAttribute('aria-pressed'),
  highlight: byID('clipping-highlight-toggle').getAttribute('aria-pressed'),
  all: byID('clipping-toggle').getAttribute('aria-pressed'),
  overlay: byID('clipping-overlay').hidden ? null : byID('clipping-overlay').src,
});
const run = async () => {
  const shadow = byID('clipping-shadow-toggle');
  const highlight = byID('clipping-highlight-toggle');
  const all = byID('clipping-toggle');
  expect(shadow && highlight && all && shadow.tagName === 'BUTTON' && highlight.tagName === 'BUTTON',
    'two native keyboard-accessible side buttons');
  expect(!shadow.disabled && !highlight.disabled, 'both controls available for loaded After');
  for (const button of [shadow, highlight]) {
    button.focus();
    expect(document.activeElement === button && button.getBoundingClientRect().height >= 44 &&
      button.getBoundingClientRect().width >= 44, 'focusable side target at least 44px');
  }
  const baseline = selected();
  expect(baseline.overlay === null && baseline.shadow === 'false' && baseline.highlight === 'false',
    'both warnings initially off');
  shadow.click();
  const onlyShadow = selected();
  expect(onlyShadow.shadow === 'true' && onlyShadow.highlight === 'false' && onlyShadow.all === 'mixed' &&
    onlyShadow.overlay, 'left side only');
  const shadowBlack = await pixel(onlyShadow.overlay, 3);
  const shadowWhite = await pixel(onlyShadow.overlay, 75);
  expect(shadowBlack[2] > shadowBlack[0] && shadowBlack[3] > 0 && shadowWhite[3] === 0,
    'blue black warning only');
  highlight.click();
  const both = selected();
  expect(both.shadow === 'true' && both.highlight === 'true' && both.all === 'true' &&
    both.overlay !== onlyShadow.overlay, 'both sides combined');
  shadow.click();
  const onlyHighlight = selected();
  expect(onlyHighlight.shadow === 'false' && onlyHighlight.highlight === 'true' &&
    onlyHighlight.all === 'mixed' && onlyHighlight.overlay !== both.overlay,
    'right side only');
  const highlightBlack = await pixel(onlyHighlight.overlay, 3);
  const highlightWhite = await pixel(onlyHighlight.overlay, 75);
  expect(highlightBlack[3] === 0 && highlightWhite[0] > highlightWhite[2] && highlightWhite[3] > 0,
    'red white warning only');
  byID('clipping-toggle').click();
  expect(selected().all === 'true', 'combined button enables missing side');
  window.dispatchEvent(new KeyboardEvent('keydown', {key: 'j', bubbles: true}));
  expect(selected().overlay === null && selected().all === 'false', 'J disables both sides');
  shadow.click();
  byID('[data-view="before"]').click();
  expect(byID('clipping-overlay').hidden && shadow.disabled && highlight.disabled,
    'Before hides warnings and disables edits');
  byID('[data-view="after"]').click();
  expect(!byID('clipping-overlay').hidden && !shadow.disabled && !highlight.disabled,
    'After restores selected side');
  byID('probe-sides-verdict').textContent = JSON.stringify({result: 'HISTOGRAM-SIDES-BROWSER-PASS',
    boundary: 'synthetic non-RAW product Editor + actual Worker overlay',
    shadowBlack, shadowWhite, highlightBlack, highlightWhite,
    note: 'Native physical keyboard input and device display require separate manual run.'});
};
byID('probe-sides-run').addEventListener('click', () => {
  void run().catch(error => {
    byID('probe-sides-verdict').textContent = JSON.stringify({result: 'HISTOGRAM-SIDES-BROWSER-FAIL',
      error: error.message, stack: error.stack, selected: selected()});
  });
});
