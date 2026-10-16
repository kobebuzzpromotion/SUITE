/** Shared byte digest; importing it must not initialize a RAW or face runtime. */
export async function sha256(buffer) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))]
    .map(value=>value.toString(16).padStart(2,'0')).join('');
}
