import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {missingFeatureTypes} from '../apps/web/src/feature-catalog.mjs';

const source=new URL('../dist/web/runtime_assets/evoto-feature-inventory.json',import.meta.url);
const output=new URL('../SUITE_feature_types_2026-10-03.txt',import.meta.url);
const rows=JSON.parse(readFileSync(source,'utf8')).rows;
const {items,supplement}=missingFeatureTypes(rows);
const lines=[
  'SUITE｜Evoto / Adobe Lightroom 比較：不足している機能の種類',
  `機能候補 ${items.length} 種類（Evoto ${items.filter(item=>item.source==='Evoto').length}、Lightroom ${items.filter(item=>item.source==='Lightroom').length}）。元資料 ${rows.length} 行。`,
  '「一部のみ」「停止中」は完成済みではありません。採否判断は公開画面のチェック・保存・JSON/CSV出力で管理します。',
  ''
];
let category='';
for(const item of items){
  if(category!==item.category){category=item.category;lines.push(`【${category}】`);}
  lines.push(`${item.id}\t${item.source}\t${item.name}\t${item.status}`);
}
lines.push('',`機能数に含めない監査補足: ${supplement.length} 行（原資料はWeb試験版に保持）`);
writeFileSync(output,lines.join('\r\n')+'\r\n','utf8');
process.stdout.write(JSON.stringify({path:fileURLToPath(output),items:items.length,supplement:supplement.length,bytes:readFileSync(output).length}));
