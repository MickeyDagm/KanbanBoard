import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Singleton socket connected to the same origin as the SPA (Vite proxies
 * `/socket.io` to the backend with `ws: true`). Auth uses the same JWT cookie
 * as the REST API — no token handling in the client.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({
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
