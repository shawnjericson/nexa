import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import { Server, type Socket } from 'socket.io';

export type SocketMiddleware = (socket: Socket, next: (err?: Error) => void) => void;
export type ConnectionHandler = (socket: Socket) => void;

/**
 * Keeps the Socket.IO lifecycle apart from the Express app. Modules register middlewares and
 * connection handlers while the app is composed; server.ts then attaches the hub to the HTTP
 * server. Until then (e.g. in HTTP-only tests) emitted events are simply dropped.
 */
export class RealtimeHub {
  private io: Server | null = null;
  private readonly middlewares: SocketMiddleware[] = [];
  private readonly handlers: ConnectionHandler[] = [];

  use(middleware: SocketMiddleware): void {
    this.middlewares.push(middleware);
  }

  onConnection(handler: ConnectionHandler): void {
    this.handlers.push(handler);
  }

  attach(server: HttpServer, options: { corsOrigins: string[]; redis?: Redis | null }): Server {
    const io = new Server(server, {
      cors: { origin: options.corsOrigins, credentials: true },
      serveClient: false,
    });
    // Fan events out across API instances (ADR-015). Channels share the ACL-permitted prefix.
    if (options.redis) {
      io.adapter(
        createAdapter(options.redis, options.redis.duplicate(), { key: 'nexa:socket.io' }),
      );
    }
    for (const middleware of this.middlewares) io.use(middleware);
    io.on('connection', (socket) => {
      for (const handler of this.handlers) handler(socket);
    });
    this.io = io;
    return io;
  }

  emit(rooms: string | string[], event: string, payload: unknown): void {
    if (!this.io || rooms.length === 0) return;
    this.io.to(rooms).emit(event, payload);
  }

  /** Disconnects every client and closes the underlying HTTP server as well. */
  async close(): Promise<void> {
    const io = this.io;
    this.io = null;
    if (io) await io.close();
  }
}
