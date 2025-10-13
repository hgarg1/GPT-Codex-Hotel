import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';

type DiningTable = {
  id: string;
  label: string;
  capacity: number;
  x: number;
  y: number;
  rotation?: number | null;
  zone?: string | null;
};

type HoldInfo = {
  holdId: string;
  expiresAt: number;
};

type SeatUpdateEvent = {
  date: string;
  time: string;
  tableIds: string[];
  status: 'held' | 'available';
  holdId?: string;
  expiresAt?: number;
  reason: 'hold.created' | 'hold.released' | 'hold.extended' | 'hold.expired';
};

type InitialAvailability = {
  availableTableIds: string[];
};

export interface SeatMapProps {
  tables: DiningTable[];
  date: string;
  time: string;
  initialAvailability: InitialAvailability;
  onSelect(tableIds: string[]): void;
}

type TableStatus = 'available' | 'selected' | 'held' | 'unavailable';

const TABLE_WIDTH = 36;
const TABLE_HEIGHT = 24;
const SOCKET_PATH = '/ws/dining';

function formatCountdown(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const minutes = Math.floor(clamped / 60);
  const remainingSeconds = clamped % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function SeatMap({ tables, date, time, initialAvailability, onSelect }: SeatMapProps): JSX.Element {
  const [selected, setSelected] = useState<string[]>([]);
  const [heldTables, setHeldTables] = useState<Map<string, HoldInfo>>(() => new Map());
  const [now, setNow] = useState(() => Date.now());
  const socketRef = useRef<Socket | null>(null);

  const [availableTables, setAvailableTables] = useState<Set<string>>(
    () => new Set(initialAvailability.availableTableIds),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const sortedTables = useMemo(() => {
    return [...tables].sort((a, b) => {
      if (a.y === b.y) {
        return a.x - b.x;
      }
      return a.y - b.y;
    });
  }, [tables]);

  const tableRefs = useRef<Record<string, SVGGElement | null>>({});

  const updateSelection = useCallback(
    (updater: (current: string[]) => string[] | null) => {
      setSelected((current) => {
        const next = updater(current);
        if (next === null) {
          return current;
        }
        if (next.length === current.length && next.every((value, index) => value === current[index])) {
          return current;
        }
        onSelect(next);
        return next;
      });
    },
    [onSelect],
  );

  const toggleTable = useCallback(
    (tableId: string) => {
      updateSelection((current) => {
        if (current.includes(tableId)) {
          return current.filter((id) => id !== tableId);
        }

        if (heldTables.has(tableId) || !availableTables.has(tableId)) {
          return null;
        }

        return [...current, tableId];
      });
    },
    [availableTables, heldTables, updateSelection],
  );

  const handleSeatUpdate = useCallback(
    (payload: SeatUpdateEvent) => {
      if (payload.date !== date || payload.time !== time) {
        return;
      }

      setHeldTables((current) => {
        const next = new Map(current);
        if (payload.status === 'available') {
          payload.tableIds.forEach((tableId) => {
            next.delete(tableId);
          });
        } else if (payload.status === 'held' && payload.holdId && payload.expiresAt) {
          payload.tableIds.forEach((tableId) => {
            next.set(tableId, { holdId: payload.holdId!, expiresAt: payload.expiresAt! });
          });
        }
        return next;
      });

      setAvailableTables((current) => {
        const next = new Set(current);
        if (payload.status === 'available') {
          payload.tableIds.forEach((id) => next.add(id));
        }
        if (payload.status === 'held') {
          payload.tableIds.forEach((id) => next.delete(id));
        }
        return next;
      });

      if (payload.status === 'held') {
        updateSelection((current) => {
          const filtered = current.filter((id) => !payload.tableIds.includes(id));
          return filtered;
        });
      }
    },
    [date, time, updateSelection],
  );

  useEffect(() => {
    const socket = io({ path: SOCKET_PATH, transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('seatUpdate', handleSeatUpdate);
    return () => {
      socket.off('seatUpdate', handleSeatUpdate);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [handleSeatUpdate]);

  const getStatus = useCallback(
    (tableId: string): TableStatus => {
      if (selected.includes(tableId)) {
        return 'selected';
      }
      if (heldTables.has(tableId)) {
        return 'held';
      }
      if (!availableTables.has(tableId)) {
        return 'unavailable';
      }
      return 'available';
    },
    [availableTables, heldTables, selected],
  );

  const focusNeighbor = useCallback(
    (currentId: string, direction: 'next' | 'prev') => {
      const currentIndex = sortedTables.findIndex((table) => table.id === currentId);
      if (currentIndex === -1) return;
      const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      const target = sortedTables[nextIndex];
      if (!target) return;
      const node = tableRefs.current[target.id];
      node?.focus();
    },
    [sortedTables],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<SVGGElement>, tableId: string) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleTable(tableId);
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        focusNeighbor(tableId, 'next');
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        focusNeighbor(tableId, 'prev');
      }
    },
    [focusNeighbor, toggleTable],
  );

  const bounds = useMemo(() => {
    const xs = tables.map((table) => table.x);
    const ys = tables.map((table) => table.y);
    const maxX = Math.max(...xs, 0) + TABLE_WIDTH + 20;
    const maxY = Math.max(...ys, 0) + TABLE_HEIGHT + 20;
    return {
      width: Math.max(maxX, 320),
      height: Math.max(maxY, 240),
    };
  }, [tables]);

  const renderTable = useCallback(
    (table: DiningTable) => {
      const status = getStatus(table.id);
      const hold = heldTables.get(table.id);
      const countdown = hold ? Math.round((hold.expiresAt - now) / 1000) : null;
      const rotation = table.rotation ?? 0;
      const transform = `translate(${table.x}, ${table.y}) rotate(${rotation}, ${TABLE_WIDTH / 2}, ${TABLE_HEIGHT / 2})`;
      const isInteractive = status === 'available' || status === 'selected';
      const zoneClass = table.zone ? `zone-${table.zone.toLowerCase().replace(/\s+/g, '-')}` : 'zone-default';

      let fill = '#0f766e';
      if (status === 'selected') fill = '#1d4ed8';
      if (status === 'held') fill = '#b45309';
      if (status === 'unavailable') fill = '#4b5563';

      const textColor = status === 'held' || status === 'unavailable' ? '#f9fafb' : '#0f172a';

      return (
        <g
          key={table.id}
          ref={(node) => {
            tableRefs.current[table.id] = node;
          }}
          role="button"
          tabIndex={0}
          aria-pressed={status === 'selected'}
          aria-disabled={!isInteractive}
          data-status={status}
          data-table-id={table.id}
          className={`seat ${zoneClass} status-${status}`}
          transform={transform}
          onClick={() => isInteractive && toggleTable(table.id)}
          onKeyDown={(event) => handleKeyDown(event, table.id)}
        >
          <rect width={TABLE_WIDTH} height={TABLE_HEIGHT} rx={6} ry={6} fill={fill} stroke="#0f172a" strokeWidth={1.5} />
          <text
            x={TABLE_WIDTH / 2}
            y={TABLE_HEIGHT / 2}
            dominantBaseline="middle"
            textAnchor="middle"
            fontSize={10}
            fill={textColor}
            pointerEvents="none"
          >
            {table.label}
          </text>
          <text x={TABLE_WIDTH / 2} y={TABLE_HEIGHT - 4} dominantBaseline="ideographic" textAnchor="middle" fontSize={8} fill={textColor} pointerEvents="none">
            {status === 'held' && countdown !== null ? `Hold ${formatCountdown(countdown)}` : `Seats ${table.capacity}`}
          </text>
        </g>
      );
    },
    [getStatus, handleKeyDown, heldTables, now, toggleTable],
  );

  return (
    <div className="seat-map" role="presentation">
      <svg width="100%" height="100%" viewBox={`0 0 ${bounds.width} ${bounds.height}`} aria-label="Dining room seat map">
        <rect x={0} y={0} width={bounds.width} height={bounds.height} fill="#f1f5f9" rx={12} />
        {tables.map(renderTable)}
      </svg>
    </div>
  );
}

export default SeatMap;

