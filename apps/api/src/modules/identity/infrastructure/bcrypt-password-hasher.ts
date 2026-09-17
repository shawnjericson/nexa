import { hash, verify } from '@node-rs/bcrypt';
import type { PasswordHasher } from '../domain/ports';

/**
 * bcrypt in native code, on libuv's thread pool. At cost 12 a hash is a quarter of a second of
 * CPU; bcryptjs spent it on the event loop, so every sign-in held up every other request on the
 * server. The hashes are the same format ($2b$), and the ones bcryptjs wrote verify unchanged.
 */
export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly rounds: number) {}

  hash(password: string): Promise<string> {
    return hash(password, this.rounds);
  }

  /** False, never an error, for anything that isn't a bcrypt hash (NO_PASSWORD included). */
  async verify(password: string, passwordHash: string): Promise<boolean> {
    try {
      return await verify(password, passwordHash);
    } catch {
      return false;
    }
  }
}
