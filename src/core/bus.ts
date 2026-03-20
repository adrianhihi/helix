import type { SseEvent, SseEventType } from './types.js';

export type EventListener = (event: SseEvent) => void;

const MAX_HISTORY = 500;

class EventBus {
  private listeners: Set<EventListener> = new Set();
  private history: SseEvent[] = [];

  emit(type: SseEventType, agentId: string, data: Record<string, unknown>): void {
    const event: SseEvent = {
      type,
      agentId,
      timestamp: Date.now(),
      data,
    };
    this.history.push(event);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener errors should not break the bus
      }
    }
  }

  subscribe(fn: EventListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getHistory(): SseEvent[] {
    return [...this.history];
  }

  clear(): void {
    this.history = [];
  }
}

// Singleton bus shared across the process
export const bus = new EventBus();
