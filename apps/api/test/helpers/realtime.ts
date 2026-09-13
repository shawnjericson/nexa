import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { RealtimeHub } from '../../src/infrastructure/websocket/realtime-hub';
import { prisma } from './db';

/** The API on a real port with Socket.IO attached (in-process presence and fan-out). */
export async function startRealtimeServer() {
  const hub = new RealtimeHub();
  const app = createApp({ prisma, realtime: hub });
  const server = createServer(app);
  hub.attach(server, { corsOrigins: [] });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const sockets: Socket[] = [];

  return {
    app,
    /** Resolves once connected; rejects with the server's error (`err.data.code`). */
    async connect(token: string, organizationId?: string): Promise<Socket> {
      const socket = io(`http://127.0.0.1:${port}`, {
        auth: { token, ...(organizationId && { organization_id: organizationId }) },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
      });
      return socket;
    },
    async close() {
      for (const socket of sockets) socket.disconnect();
      await hub.close();
    },
  };
}

export type RealtimeServer = Awaited<ReturnType<typeof startRealtimeServer>>;

export function nextEvent<T = unknown>(
  socket: Socket,
  event: string,
  timeoutMs = 5_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const handler = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`No "${event}" event within ${timeoutMs}ms`));
    }, timeoutMs);
    socket.once(event, handler);
  });
}

/** Collects every payload of `event`, so tests can assert that something did NOT arrive. */
export function recordEvents<T = unknown>(socket: Socket, event: string): T[] {
  const seen: T[] = [];
  socket.on(event, (payload: T) => seen.push(payload));
  return seen;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
