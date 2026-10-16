import {validatePersonalLook} from '../local-personal-look-contract.mjs';
import {applyPersonalizedLook} from './astra-look-learning.mjs';
export function applySavedPersonalLook(pixels,document,{signal}={}){
  const d=validatePersonalLook(document);
  return applyPersonalizedLook(pixels,{version:d.engineVersion,domain:'decoded-srgb8',state:'ready',
    models:{[d.format]:{coefficients:d.coefficients}}},{format:d.format,strength:d.strength,signal});
}
