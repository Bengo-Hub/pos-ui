export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return b64urlEncode(array);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await window.crypto.subtle.digest('SHA-256', data);
  return b64urlEncode(new Uint8Array(hash));
}

export function generateState(): string {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return b64urlEncode(array);
}

function b64urlEncode(array: Uint8Array): string {
  return btoa(String.fromCharCode.apply(null, Array.from(array)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function storeVerifier(verifier: string) {
  sessionStorage.setItem('pkce_verifier', verifier);
}

export function consumeVerifier(): string | null {
  const v = sessionStorage.getItem('pkce_verifier');
  sessionStorage.removeItem('pkce_verifier');
  return v;
}

export function storeState(state: string) {
  sessionStorage.setItem('pkce_state', state);
}

export function consumeState(): string | null {
  const s = sessionStorage.getItem('pkce_state');
  sessionStorage.removeItem('pkce_state');
  return s;
}
