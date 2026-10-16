/**
 * Map a pointer in the After image element's CSS box to the displayed image.
 * Assumes object-fit: contain and centered object-position. naturalWidth/Height
 * must be the browser-decoded, orientation-applied image dimensions; no EXIF
 * transform is applied a second time. This does not sample pixels or edit UI.
 */
function rectangle(value) {
  if (!value || typeof value !== 'object' ||
      ![value.left, value.top, value.width, value.height].every(Number.isFinite) ||
      value.width <= 0 || value.height <= 0) throw Error('PREVIEW_RECT_INVALID');
  return {left: value.left, top: value.top, width: value.width, height: value.height};
}

function contains(rect, x, y) {
  return x >= rect.left && x <= rect.left + rect.width &&
    y >= rect.top && y <= rect.top + rect.height;
}

export function mapPreviewClick({afterRect, beforeRect, naturalWidth, naturalHeight,
  clientX, clientY, view = 'after'} = {}) {
  if (view !== 'after' && view !== 'split') throw Error('PREVIEW_AFTER_REQUIRED');
  const after = rectangle(afterRect);
  if (!Number.isSafeInteger(naturalWidth) || !Number.isSafeInteger(naturalHeight) ||
      naturalWidth < 1 || naturalHeight < 1) throw Error('PREVIEW_IMAGE_NOT_READY');
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY))
    throw Error('PREVIEW_POINTER_INVALID');
  if (view === 'split') {
    const before = rectangle(beforeRect);
    if (contains(before, clientX, clientY)) throw Error('PREVIEW_BEFORE_REGION');
  }
  if (!contains(after, clientX, clientY)) throw Error('PREVIEW_OUTSIDE_AFTER');
  const scale = Math.min(after.width / naturalWidth, after.height / naturalHeight);
  const width = naturalWidth * scale, height = naturalHeight * scale;
  const left = after.left + (after.width - width) / 2;
  const top = after.top + (after.height - height) / 2;
  if (clientX < left || clientX > left + width || clientY < top || clientY > top + height)
    throw Error('PREVIEW_CONTAIN_LETTERBOX');
  return Object.freeze({x: Math.max(0, Math.min(1, (clientX - left) / width)),
    y: Math.max(0, Math.min(1, (clientY - top) / height))});
}
