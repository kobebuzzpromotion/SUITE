// Original SUITE procedural designs. These IDs are not Evoto materials or IDs.
// The iPad subset is a SUITE choice, not asserted proprietary style correspondence.
const freeze = value => {
  if(value && typeof value==='object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const colors = [[185,72,90],[205,107,91],[163,66,102],[198,98,128],
  [158,90,71],[214,133,113],[152,76,109],[184,107,121],
  [127,79,83],[207,124,143],[165,100,91],[197,86,100],[112,76,115],[181,134,110]];
const counts={blush:12,contacts:11,eyelashes:17,eyeliner:9,eyeshadow:14,faceDecorations:6};
const ipad={blush:12,contacts:11,eyelashes:14,eyeliner:6,eyeshadow:8,faceDecorations:6};
export const MAKEUP_STYLE_VERSION='suite-procedural-makeup-1';
export const MAKEUP_STYLE_CATALOG=freeze(Object.fromEntries(Object.entries(counts).map(([kind,count])=>
  [kind,Array.from({length:count},(_,index)=>({
    id:`suite-${kind}-${String(index+1).padStart(2,'0')}`,kind,index,
    name:`SUITE ${kind} ${index+1}`,version:MAKEUP_STYLE_VERSION,
    color:kind==='contacts'?[[103,130,157],[110,136,96],[143,114,73],[99,105,119],
      [155,130,92],[113,99,130],[91,122,121],[157,112,90],[118,136,153],[149,136,112],[109,90,69]][index]:
      ['eyeliner','eyelashes'].includes(kind)?[[35,25,27],[52,36,30],[29,34,44]][index%3]:colors[index%colors.length],
    platforms:index<ipad[kind]?['desktop','ipad','mobile']:['desktop','mobile'],
    parameters:{spread:.7+(index%4)*.16,height:.6+(index%3)*.2,
      slant:((index%5)-2)*.1,density:8+index*2,length:.12+(index%6)*.025,
      wing:(index%5)*.065,frequency:12+index*3,ring:.08+(index%4)*.04,
      opacity:.24+(index%4)*.09}
  }))])));

export function getMakeupStyle(kind,id,platform='desktop'){
  if(!['desktop','ipad','mobile'].includes(platform))throw Error('MAKEUP_PLATFORM_INVALID');
  const style=MAKEUP_STYLE_CATALOG[kind]?.find(item=>item.id===id);
  if(!style || !style.platforms.includes(platform))throw Error('MAKEUP_STYLE_UNAVAILABLE');
  return style;
}
