import { io, type Socket } from 'socket.io-client';
import { API_BASE } from './api';

let socket: Socket | null = null;

/**
 * Singleton socket connected to the API origin (API_BASE — same origin as the
 * SPA in dev, where Vite proxies `/socket.io` to the backend with `ws: true`;
 * the backend origin directly when VITE_API_URL is set at build time). Auth
 * uses the same JWT cookie as the REST API — no token handling in the client.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE || undefined, {
      autoConnect: false,
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
    if (import.meta.env.DEV) {
      // Debug affordance for headless UI checks: window.__kanbanSocket
      const w = window as unknown as {
        __kanbanSocket?: Socket;
        __kanbanSocketEvents?: string[];
      };
      w.__kanbanSocket = socket;
      w.__kanbanSocketEvents = [];
      socket.onAny((event) => {
        const log = w.__kanbanSocketEvents!;
        log.push(String(event));
        if (log.length > 50) log.shift();
      });
    }
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
}
