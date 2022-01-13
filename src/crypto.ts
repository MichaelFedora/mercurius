import * as sha from 'sha.js';

export function shaThis(input: string): string {
  // return await window.crypto.subtle.digest('SHA-256', data);
  return sha('sha256').update(input).digest('hex');
}
