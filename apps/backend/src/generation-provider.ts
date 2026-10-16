import {createHash} from 'node:crypto';

// Official contract: https://developers.openai.com/api/reference/resources/images/methods/edit
// No retries: a transport failure after dispatch has an unknown billable outcome.
export class GenerationProviderFailure extends Error {
  constructor(readonly outcome: 'not-submitted' | 'unknown', readonly requestID: string | null = null) {
    super(outcome === 'unknown' ? 'GENERATION_OUTCOME_UNKNOWN' : 'GENERATION_NOT_SUBMITTED');
  }
}
export interface GenerationPayload {
  model: string; prompt: string; size: string; quality: string; n: 1; output_format: 'png';
}
export interface GenerationProviderPolicy {
  model: string; sizes: readonly string[]; qualities: readonly string[];
}
export interface GenerationProviderResult {
  png: Buffer; sha256: string; providerRequestID: string | null; usage: unknown;
}
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pngSignature = Buffer.from([137,80,78,71,13,10,26,10]);

export function validateGenerationPayload(value: unknown, policy: GenerationProviderPolicy): GenerationPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_GENERATION_PAYLOAD');
  const p = value as Record<string, unknown>;
  if (Object.keys(p).sort().join(',') !== 'model,n,output_format,prompt,quality,size' ||
      p.model !== policy.model || typeof p.prompt !== 'string' || !p.prompt.trim() || p.prompt.length > 32000 ||
      typeof p.size !== 'string' || !policy.sizes.includes(p.size) ||
      typeof p.quality !== 'string' || !policy.qualities.includes(p.quality) ||
      p.n !== 1 || p.output_format !== 'png') throw new Error('INVALID_GENERATION_PAYLOAD');
  return {model: p.model as string, prompt: p.prompt, size: p.size, quality: p.quality, n: 1, output_format: 'png'};
}

/** Call before reserving/dispatching. Policy/key are server-owned, never request URLs. */
export function prepareGenerationEdit(input: Buffer, payloadBytes: Buffer,
  expected: {inputSHA256: string; payloadSHA256: string}, policy: GenerationProviderPolicy,
  apiKey: string | undefined): {send(signal?: AbortSignal): Promise<GenerationProviderResult>} {
  if (!apiKey || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw new GenerationProviderFailure('not-submitted');
  // Small explicitly approved PNG only. No original lookup, URL fetch or gallery.
  // Hash covers its exact bytes, including any PNG metadata; the caller must
  // supply its reviewed proxy rather than an unreviewed original container.
  if (input.length < 33 || input.length > 14 * 1024 * 1024 || !input.subarray(0,8).equals(pngSignature) ||
      payloadBytes.length === 0 || payloadBytes.length > 4 * 1024 * 1024 ||
      digest(input) !== expected.inputSHA256 || digest(payloadBytes) !== expected.payloadSHA256) {
    throw new Error('INVALID_GENERATION_INPUT');
  }
  const p = validateGenerationPayload(JSON.parse(payloadBytes.toString('utf8')), policy);
  const body = JSON.stringify({...p, images: [{image_url: `data:image/png;base64,${input.toString('base64')}`}],
    moderation: 'auto', stream: false});
  let dispatched = false;
  return {async send(signal) {
    if (dispatched || signal?.aborted) throw new GenerationProviderFailure('not-submitted');
    dispatched = true;
    let requestID: string | null = null;
    try {
      const response = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST', redirect: 'error', headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
        body, signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000),
      });
      const headerID = response.headers.get('x-request-id');
      if (headerID && /^[a-zA-Z0-9_-]{1,256}$/.test(headerID)) requestID = headerID;
      // HTTP errors are deliberately NOT proof of zero provider cost.
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new GenerationProviderFailure('unknown', requestID); }
      const reader = response.body.getReader(); const chunks: Buffer[] = []; let length = 0;
      try {
        while (true) {
          const item = await reader.read(); if (item.done) break;
          length += item.value.byteLength;
          if (length > 48 * 1024 * 1024) throw new GenerationProviderFailure('unknown', requestID);
          chunks.push(Buffer.from(item.value));
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      if (!Array.isArray(result.data) || result.data.length !== 1) throw new GenerationProviderFailure('unknown', requestID);
      const encoded: unknown = result.data[0]?.b64_json;
      if (typeof encoded !== 'string' || !encoded.length || encoded.length > 44 * 1024 * 1024 ||
          encoded.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(encoded)) {
        throw new GenerationProviderFailure('unknown', requestID);
      }
      const png = Buffer.from(encoded, 'base64');
      if (png.toString('base64') !== encoded || png.length < 33 || png.length > 32 * 1024 * 1024 || !png.subarray(0,8).equals(pngSignature)) {
        throw new GenerationProviderFailure('unknown', requestID);
      }
      return {png, sha256: digest(png), providerRequestID: requestID, usage: result.usage ?? null};
    } catch (error) {
      if (error instanceof GenerationProviderFailure) throw error;
      throw new GenerationProviderFailure('unknown', requestID);
    }
  }};
}
