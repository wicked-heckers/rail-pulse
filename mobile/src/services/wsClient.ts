import { toWsOrigin } from '../config/apiConfig';
import { useRailStore } from '../stores/useRailStore';
import type { CorridorSnapshot } from '../types/corridor';

class MobileWebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private backoffMs = 1000;
  private readonly maxBackoffMs = 5000;
  private isIntentionalClose = false;
  private currentOrigin = '';

  public connect(backendOrigin: string): void {
    if (
      this.socket &&
      this.currentOrigin === backendOrigin &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (this.socket) {
      this.disconnect();
    }

    this.currentOrigin = backendOrigin;
    this.isIntentionalClose = false;
    const wsUrl = `${toWsOrigin(backendOrigin)}/ws/corridor`;

    useRailStore.getState().setWsStatus(false, 'Connecting...');

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.backoffMs = 1000;
        useRailStore.getState().setWsStatus(true, 'Live Sync');
        this.startPing();
      };

      this.socket.onmessage = (event) => {
        try {
          if (event.data === 'pong') return;
          const data = JSON.parse(String(event.data));
          if (data && Array.isArray(data.trains)) {
            useRailStore.getState().updateSnapshot(data as CorridorSnapshot);
          }
        } catch (err) {
          console.warn('WS parse error:', err);
        }
      };

      this.socket.onerror = () => {
        useRailStore.getState().setWsStatus(false, 'Offline / Fallback');
      };

      this.socket.onclose = () => {
        this.stopPing();
        useRailStore.getState().setWsStatus(false, 'Reconnecting...');
        if (!this.isIntentionalClose) {
          this.scheduleReconnect();
        }
      };
    } catch {
      useRailStore.getState().setWsStatus(false, 'Offline / Fallback');
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.isIntentionalClose = true;
    this.stopPing();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ ping: 1 }));
      }
    }, 15000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.backoffMs = Math.min(this.backoffMs * 1.5, this.maxBackoffMs);
      this.connect(this.currentOrigin);
    }, this.backoffMs);
  }
}

export const wsClient = new MobileWebSocketClient();
