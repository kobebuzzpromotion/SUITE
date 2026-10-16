// Original SUITE materials. IDs/counts do not reproduce another product's assets.
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
export const DELTA66_MAKEUP_VERSION='suite-delta66-makeup-1';
export const DELTA66_MAKEUP_STYLES=frozen({
  contour:[{id:'suite-contour-soft',color:[118,85,72],opacity:.22,spread:.75},
    {id:'suite-contour-defined',color:[98,71,64],opacity:.32,spread:.52},
    {id:'suite-contour-warm',color:[141,98,73],opacity:.25,spread:.9}],
  eyebrows:[{id:'suite-brow-natural',color:[71,50,40],opacity:.38,density:28,slant:.3},
    {id:'suite-brow-soft',color:[108,81,66],opacity:.24,density:20,slant:.15},
    {id:'suite-brow-defined',color:[43,34,32],opacity:.48,density:42,slant:.45}],
  lipstick:[{id:'suite-lip-rose',color:[160,59,78],opacity:.55,texture:'satin'},
    {id:'suite-lip-coral',color:[201,85,72],opacity:.5,texture:'gloss'},
    {id:'suite-lip-nude',color:[160,107,96],opacity:.4,texture:'matte'},
    {id:'suite-lip-plum',color:[112,42,77],opacity:.58,texture:'satin'}]
});
const component=(kind,styleID,amount)=>({kind,styleID,amount,linked:true});
export const DELTA66_MAKEUP_SUITES=frozen([
  {id:'suite-set-natural',audience:'general',name:'Natural',components:[component('eyebrows','suite-brow-natural',.45),component('lipstick','suite-lip-nude',.4),component('contour','suite-contour-soft',.35)]},
  {id:'suite-set-studio',audience:'general',name:'Studio',components:[component('eyebrows','suite-brow-defined',.55),component('lipstick','suite-lip-rose',.55),component('contour','suite-contour-defined',.5),component('eyeshadow','suite-eyeshadow-01',.35)]},
  {id:'suite-set-male-soft',audience:'male-explicit-selection',name:'Soft definition',components:[component('eyebrows','suite-brow-natural',.25),component('contour','suite-contour-soft',.18)]},
  {id:'suite-set-children-soft',audience:'children-explicit-selection',name:'Gentle warmth',components:[component('blush','suite-blush-02',.12)]}
]);
export function getDelta66MakeupStyle(kind,id){const style=DELTA66_MAKEUP_STYLES[kind]?.find(s=>s.id===id);
  if(!style)throw Error('DELTA66_MAKEUP_STYLE');return style;}
export function getDelta66MakeupSuite(id){const preset=DELTA66_MAKEUP_SUITES.find(s=>s.id===id);
  if(!preset)throw Error('DELTA66_MAKEUP_SUITE');return structuredClone(preset);}
