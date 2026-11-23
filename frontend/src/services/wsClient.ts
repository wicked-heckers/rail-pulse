import { useRailStore } from '../stores/useRailStore';
import type { CorridorSnapshot } from '../types/corridor';

type TrainCoordsCallback = (trains: CorridorSnapshot['trains']) => void;

class WebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectTimeout: number | null = null;
  private pingInterval: number | null = null;
  private backoffMs = 1000;
  private readonly maxBackoffMs = 5000;
  private coordListeners: Set<TrainCoordsCallback> = new Set();
  private isIntentionalClose = false;

  public connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isIntentionalClose = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws/corridor`;

    useRailStore.getState().setWsStatus(false, 'Connecting...');

    try {
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        this.backoffMs = 1000;
        useRailStore.getState().setWsStatus(true, 'Live Radar 60 FPS');
        this.startPing();
      };

      this.socket.onmessage = (event) => {
        try {
          if (event.data === 'pong') return;
          const data = JSON.parse(event.data);

          // Full snapshot payload from app/core/state_store.py
          if (data && Array.isArray(data.trains)) {
            const snapshot = data as CorridorSnapshot;
            useRailStore.getState().updateSnapshot(snapshot);

            // Notify raw coordinate listeners for 60 FPS GPU lerping
            for (const cb of this.coordListeners) {
              cb(snapshot.trains);
            }
          }
        } catch (err) {
          console.warn('Error parsing corridor WS message:', err);
        }
      };

      this.socket.onerror = (err) => {
        console.warn('Corridor WS error:', err);
        useRailStore.getState().setWsStatus(false, 'Connection error');
      };

      this.socket.onclose = () => {
        this.stopPing();
        useRailStore.getState().setWsStatus(false, 'Disconnected');
        if (!this.isIntentionalClose) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.warn('Failed to initialize WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  public subscribeCoords(cb: TrainCoordsCallback): () => void {
    this.coordListeners.add(cb);
    return () => {
      this.coordListeners.delete(cb);
    };
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
    useRailStore.getState().setWsStatus(false, 'Disconnected');
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    useRailStore.getState().setWsStatus(false, `Reconnecting in ${Math.round(this.backoffMs / 1000)}s...`);
    this.reconnectTimeout = window.setTimeout(() => {
      this.backoffMs = Math.min(this.backoffMs * 1.5, this.maxBackoffMs);
      this.connect();
    }, this.backoffMs);
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = window.setInterval(() => {
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
}

export const wsClient = new WebSocketClient();
