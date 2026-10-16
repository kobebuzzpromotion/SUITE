import {createHash, randomUUID} from 'node:crypto';

export const GENERATION_MAX_UNITS = 1_000_000_000_000;
export function generationToken(value:string):void {
  if(typeof value!=='string'||!value.length||value.length>256||value.trim()!==value||/[\x00-\x1f\x7f]/.test(value)) throw new Error('generation-invalid-token');
}
export function generationUnits(value:number):void {
  if(!Number.isSafeInteger(value)||value<0||value>GENERATION_MAX_UNITS) throw new Error('generation-invalid-units');
}
export function generationSHA(value:string):void {
  if(typeof value!=='string'||!/^[0-9a-f]{64}$/.test(value)) throw new Error('generation-invalid-sha');
}
/** Deterministic JSON, no undefined, nonfinite values or implicit coercion. */
export function generationCanonical(value:unknown):string {
  if(value===null||typeof value==='boolean'||typeof value==='string') return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value)) return JSON.stringify(value);
  if(Array.isArray(value)) return '['+value.map(generationCanonical).join(',')+']';
  if(typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)
    return '{'+Object.keys(value as object).sort().map(k=>JSON.stringify(k)+':'+generationCanonical((value as Record<string,unknown>)[k])).join(',')+'}';
  throw new Error('generation-invalid-json');
}
export interface GenerationRequest {
  provider:string; model:string; inputSHA256:string; payloadSHA256:string;
}
export interface GenerationPrice {
  provider:string; model:string; version:string;
  /** Explicit flat price for ONE supported request. Not a token/image-size estimate. */
  userCreditUnits:number;
  providerCurrency:string; providerDecimalPlaces:number; providerCostCeilingUnits:number;
}
export interface GenerationQuote extends GenerationRequest {
  id:string; accountID:string; pricingVersion:string; userCreditUnits:number;
  providerCurrency:string; providerDecimalPlaces:number; providerCostCeilingUnits:number;
  issuedAt:number; expiresAt:number; requestSHA256:string;
}
/** Admin-installed flat tariff only; no default provider/model/rate/exchange rate.
 * Host must admit exactly the payload class priced by this tariff before quoting.
 * This is the server's configured quote, not a live provider-price attestation. */
export class GenerationPricing {
  private readonly prices:ReadonlyArray<GenerationPrice>;
  constructor(prices:ReadonlyArray<GenerationPrice>,private readonly lifetimeMilliseconds:number) {
    if(!Array.isArray(prices)||prices.length>256||!Number.isSafeInteger(lifetimeMilliseconds)||lifetimeMilliseconds<1||lifetimeMilliseconds>86_400_000) throw new Error('generation-invalid-pricing');
    const seen=new Set<string>();
    this.prices=prices.map(p=>{
      [p.provider,p.model,p.version].forEach(generationToken); generationUnits(p.userCreditUnits); generationUnits(p.providerCostCeilingUnits);
      if(!/^[A-Z]{3}$/.test(p.providerCurrency)||!Number.isInteger(p.providerDecimalPlaces)||p.providerDecimalPlaces<0||p.providerDecimalPlaces>9) throw new Error('generation-invalid-currency');
      const key=generationCanonical([p.provider,p.model]); if(seen.has(key)) throw new Error('generation-duplicate-tariff'); seen.add(key);
      return Object.freeze({...p});
    });
  }
  quote(accountID:string,request:GenerationRequest,now:number):GenerationQuote {
    generationToken(accountID); generationToken(request.provider); generationToken(request.model);
    generationSHA(request.inputSHA256); generationSHA(request.payloadSHA256);
    if(!Number.isSafeInteger(now)||now<0||now>Number.MAX_SAFE_INTEGER-this.lifetimeMilliseconds) throw new Error('generation-invalid-clock');
    const p=this.prices.find(p=>p.provider===request.provider&&p.model===request.model);
    if(!p) throw new Error('generation-pricing-unconfigured');
    const fixed={provider:request.provider,model:request.model,inputSHA256:request.inputSHA256,payloadSHA256:request.payloadSHA256};
    return {...fixed,id:randomUUID(),accountID,pricingVersion:p.version,userCreditUnits:p.userCreditUnits,
      providerCurrency:p.providerCurrency,providerDecimalPlaces:p.providerDecimalPlaces,providerCostCeilingUnits:p.providerCostCeilingUnits,
      issuedAt:now,expiresAt:now+this.lifetimeMilliseconds,
      requestSHA256:createHash('sha256').update(generationCanonical(fixed)).digest('hex')};
  }
}
