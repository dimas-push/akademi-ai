import crypto from 'crypto';

// Derive a fixed token from the dashboard password.
// Cookie stores this hash, not the raw password.
export const deriveToken = (pass) =>
  crypto.createHash('sha256').update(pass + ':akademi-auth-v1').digest('hex');
