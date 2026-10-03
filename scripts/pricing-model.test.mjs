import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COST_FIELDS,evaluatePricing} from './pricing-model.mjs';
const input = () => ({users:1,currency:'JPY',currencyExponent:0,grossMonthlyMinor:2200,taxBasisPoints:1000,
  appleFeeBasisPoints:2500,appleFeeBasis:'tax-exclusive',targetMonthlyProfitMinor:1000,
  firstCustomerFixedAllocationMinor:0,costs:Object.fromEntries(COST_FIELDS.map(k=>[k,0])),evidence:{kind:'scenario'}});

test('PR01 missing costs block instead of defaulting to zero',()=>{
  const x=input();delete x.costs.backup;const r=evaluatePricing(x);assert.equal(r.status,'NOT_EVALUATED');
  assert.equal(r.calculation,null);assert.equal(r.pricingGate,'BLOCK');assert.deepEqual(r.missing,['costs.backup']);
});
test('PR02 complete scenario calculates but cannot grant pricing release',()=>{
  const r=evaluatePricing(input());assert.equal(r.calculation.taxExclusiveMinor,2000);
  assert.equal(r.calculation.firstCustomerProfitMinor,1500);assert.equal(r.pricingGate,'BLOCK');
});
test('PR03 zero or negative profit is FAIL even before verified release',()=>{
  for(const cost of [1500,1501]){const x=input();x.costs.storage=cost;assert.equal(evaluatePricing(x).pricingGate,'FAIL');}
});
test('PR04 positive profit below specified target fails target independently',()=>{
  const x=input();x.costs.database=501;const r=evaluatePricing(x);assert.equal(r.calculation.strictlyProfitable,true);
  assert.equal(r.calculation.targetMet,false);assert.equal(r.pricingGate,'FAIL');
});
test('PR05 fee basis and conservative rounding are explicit',()=>{
  const x=input();x.appleFeeBasis='tax-inclusive';assert.equal(evaluatePricing(x).calculation.appleFeeMinor,550);
  x.grossMonthlyMinor=2201;assert.equal(evaluatePricing(x).calculation.appleFeeMinor,551);
  x.appleFeeBasis='unknown';assert.throws(()=>evaluatePricing(x),/Explicit/);
});
test('PR06 fixed first-customer overhead cannot be hidden by assumed growth',()=>{
  const x=input();x.firstCustomerFixedAllocationMinor=1600;const r=evaluatePricing(x);
  assert.equal(r.calculation.profitAfterVariableMinor,1500);assert.equal(r.calculation.firstCustomerProfitMinor,-100);
  assert.equal(r.pricingGate,'FAIL');x.users=100;assert.throws(()=>evaluatePricing(x),/USER=1/);
});
test('PR07 malformed unsafe negative and missing numeric inputs fail closed',()=>{
  for(const v of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1,'100']){
    const x=input();x.costs.api=v;assert.throws(()=>evaluatePricing(x));
  }
  const x=input();x.taxBasisPoints=null;assert.equal(evaluatePricing(x).pricingGate,'BLOCK');
});
test('PR08 supplied evidence is review input not automatic release approval',()=>{
  const x=input();x.evidence.kind='verified';assert.equal(evaluatePricing(x).pricingGate,'BLOCK');
  x.evidence.items=Object.fromEntries(['price','tax','appleFee',...COST_FIELDS,'firstCustomerFixedAllocation'].map(k=>
    [k,{reference:'unit-test only',reviewedOn:'2026-10-03',validForRelease:true}]));
  assert.equal(evaluatePricing(x).pricingGate,'REVIEW_REQUIRED');
});
test('PR09 user baseline retains unknown costs and cannot be marked profitable',()=>{
  const x=JSON.parse(readFileSync('docs/PRICING_SCENARIO.json','utf8'));const r=evaluatePricing(x);
  assert.equal(r.status,'NOT_EVALUATED');assert.equal(r.pricingGate,'BLOCK');assert.ok(r.missing.includes('costs.storage'));
});
