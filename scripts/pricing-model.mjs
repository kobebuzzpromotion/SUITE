// Offline scenario calculator, NOT billing, tax advice, a product catalog or price defaults.
// Monetary inputs are non-negative safe integer currency minor units. No network or writes.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const COST_FIELDS = Object.freeze(['storage','api','database','backup','ai','retry','otherPaymentFees','otherVariable']);
const integer = (v, name) => {
  if (!Number.isSafeInteger(v) || v < 0) throw new TypeError(name + ': expected non-negative safe integer');
  return BigInt(v);
};
const rate = (v, name) => { const n = integer(v, name); if (n > 10000n) throw new RangeError(name); return n; };
const ceilDiv = (a,b) => (a+b-1n)/b;
const safe = n => { if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER)) throw new RangeError('result overflow'); return Number(n); };

export function evaluatePricing(input) {
  if (!input || input.users !== 1) throw new TypeError('This gate evaluates exactly USER=1');
  if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)) throw new TypeError('currency required');
  integer(input.currencyExponent, 'currencyExponent');
  if (input.currencyExponent > 4) throw new RangeError('currencyExponent');
  const missing = [];
  const get = (value, name, validate = integer) => {
    if (value === null || value === undefined) { missing.push(name); return null; }
    return validate(value, name);
  };
  const gross = get(input.grossMonthlyMinor, 'grossMonthlyMinor');
  const tax = get(input.taxBasisPoints, 'taxBasisPoints', rate);
  const fee = get(input.appleFeeBasisPoints, 'appleFeeBasisPoints', rate);
  if (!['tax-exclusive','tax-inclusive'].includes(input.appleFeeBasis)) throw new TypeError('Explicit appleFeeBasis required');
  const target = get(input.targetMonthlyProfitMinor, 'targetMonthlyProfitMinor');
  const costs = COST_FIELDS.map(key => get(input.costs?.[key], 'costs.' + key));
  // USER=1 also cannot silently depend on future users to cover shared/fixed overhead.
  const fixed = get(input.firstCustomerFixedAllocationMinor, 'firstCustomerFixedAllocationMinor');
  if (!['scenario','verified'].includes(input.evidence?.kind)) throw new TypeError('evidence.kind required');
  const keys = ['price','tax','appleFee',...COST_FIELDS,'firstCustomerFixedAllocation'];
  const missingEvidence = keys.filter(key => {
    const e = input.evidence?.items?.[key];
    return !e || typeof e.reference !== 'string' || !e.reference.trim() ||
      typeof e.reviewedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.reviewedOn) ||
      e.validForRelease !== true;
  });
  if (missing.length) return {status:'NOT_EVALUATED', pricingGate:'BLOCK', missing, missingEvidence,
    calculation:null, reason:'Unknown inputs are not zero cost. No price or provider defaults applied.'};
  // Conservative rounding: floor net revenue; ceil fees. Actual settlement reconciliation remains separate.
  const net = gross * 10000n / (10000n + tax);
  const feeValue = ceilDiv((input.appleFeeBasis === 'tax-exclusive' ? net : gross) * fee, 10000n);
  const variable = costs.reduce((a,b) => a+b, 0n);
  const afterVariable = net - feeValue - variable;
  const firstCustomer = afterVariable - fixed;
  const profitable = afterVariable > 0n && firstCustomer > 0n;
  const meetsTarget = firstCustomer >= target;
  const verified = input.evidence.kind === 'verified' && missingEvidence.length === 0;
  return {status:'CALCULATED', pricingGate: !profitable || !meetsTarget ? 'FAIL' : verified ? 'REVIEW_REQUIRED' : 'BLOCK',
    missing, missingEvidence, evidenceKind:input.evidence.kind,
    calculation:{currency:input.currency,currencyExponent:input.currencyExponent,users:1,
      grossMonthlyMinor:safe(gross),taxExclusiveMinor:safe(net),appleFeeMinor:safe(feeValue),
      variableCostMinor:safe(variable),profitAfterVariableMinor:safe(afterVariable),
      firstCustomerFixedAllocationMinor:safe(fixed),firstCustomerProfitMinor:safe(firstCustomer),
      targetMonthlyProfitMinor:safe(target),strictlyProfitable:profitable,targetMet:meetsTarget},
    reason:'Arithmetic only. References require human validation and actual billing/cost evidence; this tool never grants release approval.'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new TypeError('Usage: node scripts/pricing-model.mjs <scenario.json>');
    const result = evaluatePricing(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    console.log(JSON.stringify(result,null,2));
    process.exitCode = result.pricingGate === 'FAIL' ? 1 : 2;
  } catch (error) { console.error(JSON.stringify({status:'INVALID_INPUT',error:error.message})); process.exitCode = 1; }
}
