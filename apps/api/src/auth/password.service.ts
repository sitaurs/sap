import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Argon2id password hashing (TECH_SPEC section: "Password memakai Argon2id").
 * No explicit cost parameters are mandated by the contract, so the library's
 * OWASP-aligned defaults are used. Encoded hashes are self-describing, so a
 * future cost bump verifies old hashes transparently.
 */
@Injectable()
export class PasswordService {
  async hash(plain: string): Promise<string> {
    return hash(plain, { algorithm: Algorithm.Argon2id });
  }

  /** Constant-time verification. Returns false on any malformed/legacy hash. */
  async verify(encodedHash: string | null | undefined, plain: string): Promise<boolean> {
    if (!encodedHash) return false;
    try {
      return await verify(encodedHash, plain);
    } catch {
      return false;
    }
  }
}
