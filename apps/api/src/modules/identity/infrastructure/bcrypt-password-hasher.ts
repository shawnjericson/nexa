import { compare, hash } from 'bcryptjs';
import type { PasswordHasher } from '../domain/ports';

export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly rounds: number) {}

  hash(password: string): Promise<string> {
    return hash(password, this.rounds);
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    return compare(password, passwordHash);
  }
}
