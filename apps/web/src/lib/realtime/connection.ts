import { io, type Socket } from 'socket.io-client';
import { API_URL } from '@/lib/api/client';
import { currentAccessToken, refreshAccessToken } from '@/lib/auth/session';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

/** Errors the server's handshake answers with (`err.data.code`) that a fresh token can fix. */
const TOKEN_ERRORS = new Set(['TOKEN_EXPIRED', 'INVALID_TOKEN', 'UNAUTHORIZED']);
const MAX_TOKEN_RETRIES = 3;

/**
 * One Socket.IO connection for one organization (ADR-015). The handshake asks for the current
 * access token each time it (re)connects, so a long-lived tab never presents an expired token.
 */
export function connectRealtime(
  organizationId: string,
  onStatus: (status: ConnectionStatus) => void,
): Socket {
  const socket = io(API_URL, {
    transports: ['websocket'],
    autoConnect: false,
    reconnectionDelayMax: 10_000,
    auth: (callback) => {
      const token = currentAccessToken();
      (token ? Promise.resolve(token) : refreshAccessToken()).then(
        (fresh) => callback({ token: fresh ?? '', organization_id: organizationId }),
        () => callback({ token: '', organization_id: organizationId }),
      );
    },
  });

  let tokenRetries = 0;
  socket.on('connect', () => {
    tokenRetries = 0;
    onStatus('connected');
  });
  socket.on('disconnect', (reason) => {
    onStatus(reason === 'io client disconnect' ? 'offline' : 'reconnecting');
  });
  socket.io.on('reconnect_attempt', () => onStatus('reconnecting'));
  socket.on('connect_error', (error: Error & { data?: { code?: string } }) => {
    // Transport problems retry by themselves; a refused handshake does not.
    if (socket.active) {
      onStatus('reconnecting');
      return;
    }
    const code = error.data?.code ?? '';
    if (TOKEN_ERRORS.has(code) && tokenRetries < MAX_TOKEN_RETRIES) {
      tokenRetries += 1;
      onStatus('reconnecting');
      refreshAccessToken().then(
        (token) => (token ? socket.connect() : onStatus('offline')),
        () => setTimeout(() => socket.connect(), 5_000),
      );
      return;
    }
    onStatus('offline');
  });

  onStatus('connecting');
  socket.connect();
  return socket;
}
