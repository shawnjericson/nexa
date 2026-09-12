import type { Express } from 'express';
import request from 'supertest';

export const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface UserInput {
  username: string;
  email: string;
  password: string;
  display_name?: string;
}

let sequence = 0;

export function newUserInput(overrides: Partial<UserInput> = {}): UserInput {
  sequence += 1;
  const id = `${Date.now().toString(36)}${sequence}`;
  return {
    username: `user_${id}`,
    email: `user_${id}@nexa.test`,
    password: 'secret123',
    ...overrides,
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function registerUser(app: Express, overrides: Partial<UserInput> = {}) {
  const input = newUserInput(overrides);
  const res = await request(app).post('/api/v1/auth/register').send(input);
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { input, user: res.body.data as { id: string; email: string; username: string } };
}

export async function login(app: Express, email: string, password: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    accessToken: res.body.data.access_token as string,
    refreshToken: res.body.data.refresh_token as string,
  };
}

export async function registerAndLogin(app: Express, overrides: Partial<UserInput> = {}) {
  const { input, user } = await registerUser(app, overrides);
  const tokens = await login(app, input.email, input.password);
  return { input, user, ...tokens };
}
