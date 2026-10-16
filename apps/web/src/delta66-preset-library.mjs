/** Companion catalog metadata only: existing preset-facade owns recipes, names, versions,
 * save/delete/apply and authorization. Host persists this document with its real server CAS.
 * Never create another copy of a preset Recipe here. Curation is explicit, not an AI claim.
 */
const label=value=>{
  if(typeof value!=='string'||!value.trim()||value.length>255||/[\u0000-\u001f\u007f]/u.test(value))throw Error('PRESET_LIBRARY_LABEL_INVALID');
  return value.trim();
};
const refKey=ref=>{
  if(!ref||!['PERSONAL','WORKSPACE','AUTHOR_DRAFT','AUTHOR_PUBLISHED'].includes(ref.kind)||
      typeof ref.id!=='string'||!ref.id||!Number.isSafeInteger(ref.version)||ref.version<1)throw Error('PRESET_LIBRARY_REFERENCE_INVALID');
  return JSON.stringify([ref.kind,ref.id,ref.version]);
};
function validate(doc){
  if(!doc||doc.schemaVersion!==1||!Number.isSafeInteger(doc.version)||doc.version<0||doc.version>=Number.MAX_SAFE_INTEGER||
      !Array.isArray(doc.groups)||doc.groups.length>256||!Array.isArray(doc.entries)||doc.entries.length>10000)
    throw Error('PRESET_LIBRARY_INVALID');
  const ids=new Set(),entries=new Set();
  for(const group of doc.groups){
    if(!group||typeof group.id!=='string'||!group.id||ids.has(group.id))throw Error('PRESET_LIBRARY_GROUP_INVALID');
    label(group.name);ids.add(group.id);
  }
  for(const entry of doc.entries){
    const key=refKey(entry);if(entries.has(key)||!['default','adjusted'].includes(entry.category)||typeof entry.hot!=='boolean'||
        !Array.isArray(entry.groups)||entry.groups.length>64||new Set(entry.groups).size!==entry.groups.length||
        entry.groups.some(id=>!ids.has(id))||!Array.isArray(entry.tags)||entry.tags.length>32||
        !['any','print','sns'].includes(entry.outputIntent))throw Error('PRESET_LIBRARY_ENTRY_INVALID');
    entry.tags.forEach(label);entries.add(key);
  }
  return structuredClone(doc);
}

export function updatePresetLibrary(document,{baseVersion,operation}={}){
  const next=validate(document);
  if(baseVersion!==next.version)throw Error('PRESET_LIBRARY_VERSION_CONFLICT');
  if(!operation||typeof operation!=='object')throw Error('PRESET_LIBRARY_OPERATION_INVALID');
  const type=operation.type;
  if(type==='create-group'){
    if(typeof operation.id!=='string'||!operation.id||next.groups.some(g=>g.id===operation.id))throw Error('PRESET_LIBRARY_GROUP_EXISTS');
    next.groups.push({id:operation.id,name:label(operation.name)});
  }else if(type==='rename-group'){
    const group=next.groups.find(g=>g.id===operation.id);if(!group)throw Error('PRESET_LIBRARY_GROUP_MISSING');group.name=label(operation.name);
  }else if(type==='delete-group'){
    if(!next.groups.some(g=>g.id===operation.id))throw Error('PRESET_LIBRARY_GROUP_MISSING');
    next.groups=next.groups.filter(g=>g.id!==operation.id);
    for(const entry of next.entries)entry.groups=entry.groups.filter(id=>id!==operation.id);
  }else if(type==='set-entry'){
    const key=refKey(operation.entry),index=next.entries.findIndex(entry=>refKey(entry)===key);
    const copy=structuredClone(operation.entry);if(index<0)next.entries.push(copy);else next.entries[index]=copy;
  }else if(type==='remove-entry'){
    const key=refKey(operation.reference);next.entries=next.entries.filter(entry=>refKey(entry)!==key);
  }else throw Error('PRESET_LIBRARY_OPERATION_UNSUPPORTED');
  next.version++;return validate(next);
}

/** Intersect explicit curator tags with current facade inventory. No private-photo analysis,
 * automatic editing, popularity fabrication or print/SNS exclusion. Stable ties retain order.
 */
export function recommendPresetReferences(document,inventory,{tags=[],outputIntent='print',limit=12}={}){
  const doc=validate(document);
  if(!Array.isArray(inventory)||inventory.length>10000||!Array.isArray(tags)||tags.length>32||
      !['print','sns'].includes(outputIntent)||!Number.isSafeInteger(limit)||limit<1||limit>100)
    throw Error('PRESET_RECOMMENDATION_INPUT_INVALID');
  const available=new Set(inventory.map(refKey)),selected=new Set(tags.map(tag=>label(tag).toLocaleLowerCase()));
  return doc.entries.flatMap((entry,index)=>{
    if(!available.has(refKey(entry)))return [];
    const matched=entry.tags.filter(tag=>selected.has(tag.toLocaleLowerCase()));
    const score=matched.length*2+(entry.outputIntent===outputIntent?1:0);
    return [{kind:entry.kind,id:entry.id,version:entry.version,score,matchedTags:matched,
      outputIntent:entry.outputIntent,reason:'explicit-catalog-tags',index}];
  }).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit).map(({index,...item})=>item);
}

/** Converts ID-based companion groups into selectPresetCatalog's display metadata. */
export function presetCatalogMetadata(document){
  const doc=validate(document),groups=new Map(doc.groups.map(group=>[group.id,group.name]));
  return doc.entries.map(entry=>({...entry,groups:entry.groups.map(id=>groups.get(id))}));
}
