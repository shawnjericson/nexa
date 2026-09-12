export type UserStatus = 'ACTIVE' | 'DEACTIVATED';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
  avatarUrl: string | null;
  bio: string | null;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
