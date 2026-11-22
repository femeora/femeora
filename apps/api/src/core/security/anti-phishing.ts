/**
 * Anti-Phishing & Anti-Scam Security Validator
 * Dev Brief 5.4.1 & 13.2:
 * Strict enforcement:
 * 1. Max 280 characters.
 * 2. No external URLs or hyperlinks.
 * 3. No raw Ethereum addresses (0x...) or contract addresses in captions.
 * 4. Disallow known malicious or phishing phrases.
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

const PHISHING_PATTERNS = [
  /free\s*airdrop/i,
  /claim\s*reward/i,
  /seed\s*phrase/i,
  /private\s*key/i,
  /connect\s*wallet\s*to\s*claim/i,
];

export function validateCalloutCaption(caption: string): ValidationResult {
  if (!caption || caption.trim().length === 0) {
    return { isValid: true };
  }

  if (caption.length > 280) {
    return {
      isValid: false,
      error: 'Caption exceeds maximum length of 280 characters',
    };
  }

  // Reject URLs/Links
  if (/https?:\/\/[^\s]+/i.test(caption) || /www\.[^\s]+/i.test(caption)) {
    return {
      isValid: false,
      error: 'Security alert: External URLs and links are prohibited in callout captions.',
    };
  }

  // Reject Ethereum addresses
  if (/0x[a-fA-F0-9]{40}/.test(caption)) {
    return {
      isValid: false,
      error: 'Security alert: Direct wallet or contract addresses are prohibited in captions.',
    };
  }

  // Check scam phrases
  for (const pattern of PHISHING_PATTERNS) {
    if (pattern.test(caption)) {
      return {
        isValid: false,
        error: 'Security alert: Caption contains prohibited or high-risk phishing keywords.',
      };
    }
  }

  return { isValid: true };
}
