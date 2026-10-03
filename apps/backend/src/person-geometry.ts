import {createHash} from 'node:crypto';
import type {PersonGeometry} from './person-geometry-validation.js';
export * from './person-geometry-validation.js';
/** Diagnostic identifier only; does not replace geometry comparison or prove a real person's identity. */
export function geometryIdentifier(anchor:PersonGeometry):string {
  return 'face-geometry-v1-sha256:'+createHash('sha256').update(JSON.stringify(['face-geometry-v1',anchor.x,anchor.y,anchor.width,anchor.height])).digest('hex');
}
