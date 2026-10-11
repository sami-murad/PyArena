import { io, type Socket } from "socket.io-client";

import { appConfig } from "@/config/appConfig";

let socket: Socket | null = null;

/**
 * One shared Socket.IO connection. The session cookie authenticates it, so it
 * is only opened after sign-in, and reset on sign-out.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(appConfig.socketUrl || undefined, {
      path: "/socket.io",
      withCredentials: true,
      autoConnect: false,
      transports: ["websocket", "polling"],
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

export function resetSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
