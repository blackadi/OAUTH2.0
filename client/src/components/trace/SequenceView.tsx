import { useMemo } from 'react';
import type { TraceEntry } from '@/services/trace-store';
import { cn } from '@/utils/cn';

/**
 * The trace as a message flow between parties, rather than as a list.
 *
 * OAuth is a conversation between four of them, and a one-dimensional list of requests cannot show who
 * is talking to whom — which is why every tutorial in this repo draws a sequence diagram and why the
 * linear step-pill row was never really the right shape. What neither a tutorial diagram nor the
 * reference tools can do is what this does: **each arrow is a request that actually happened**, and
 * clicking it opens that request's captured headers and body.
 *
 * Rendered as inline SVG so the lifelines stay straight and the arrows can carry a status colour, with
 * a `<title>` per arrow so the whole thing is legible to a screen reader as well.
 */

/** Who is talking. Four lanes, in the order a reader scans them. */
const LANES = [
  { id: 'client', label: 'Client', hint: 'this dashboard' },
  { id: 'as', label: 'Authorization Server', hint: '/api/authorization, /api/token, /api/par…' },
  { id: 'rs', label: 'Resource Server', hint: '/api/userinfo, /api/gm' },
  { id: 'admin', label: 'Management API', hint: '/api/token/*, /api/client/*' },
] as const;

type LaneId = (typeof LANES)[number]['id'];

/**
 * Which party a request was addressed to.
 *
 * Ordered most specific first: `/api/token/list` is a management call and `/api/token` is the token
 * endpoint, so the management prefixes have to be tested before the bare one. Getting that backwards
 * would draw every admin call as a protocol message.
 */
function laneFor(entry: TraceEntry): LaneId {
  // A front-channel hop is a conversation with the authorization server by definition — the outbound
  // one goes to its authorization endpoint, and the inbound one is its redirect coming back. The
  // inbound URL is *our own* `/callback`, so path matching would file it under the default lane and
  // draw the authorization server's message as the client talking to itself.
  if (entry.navigation) return 'as';

  const path = (() => {
    try {
      return new URL(entry.url, window.location.origin).pathname;
    } catch {
      return entry.url;
    }
  })();

  if (/^\/api\/(token|client)\/|^\/api\/hsk\/|^\/api\/backchannel_logout\//.test(path))
    return 'admin';
  if (/^\/api\/(userinfo|gm)\b/.test(path)) return 'rs';
  if (/^\/api\/(health|metrics)\b/.test(path)) return 'admin';
  return 'as';
}

function statusStroke(entry: TraceEntry): string {
  // A front-channel hop has no status of its own — the browser received the answer, not this app — so it
  // gets the accent rather than a success or failure colour it has not earned.
  if (entry.navigation) return '#818cf8';
  if (entry.status === 0) return '#94a3b8';
  if (entry.status >= 500) return '#f87171';
  if (entry.status === 429) return '#fb923c';
  if (entry.status >= 400) return '#fbbf24';
  return '#34d399';
}

function shortLabel(entry: TraceEntry): string {
  const path = (() => {
    try {
      return new URL(entry.url, window.location.origin).pathname;
    } catch {
      return entry.url;
    }
  })();
  return `${entry.method} ${path.replace(/^\/api\//, '')}`;
}

interface SequenceViewProps {
  traces: TraceEntry[];
  /** Called with a trace id when an arrow is activated, so the timeline can open that row. */
  onSelect?: (id: string) => void;
  selectedId?: string;
}

const LANE_WIDTH = 190;
const ROW_HEIGHT = 44;
const TOP = 56;

function SequenceView({ traces, onSelect, selectedId }: SequenceViewProps) {
  // Oldest first: a conversation reads downwards in the order it happened, which is the opposite of the
  // timeline's newest-first list.
  const ordered = useMemo(() => [...traces].reverse(), [traces]);

  if (ordered.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-8">
        No requests yet. Run an operation and the exchange will be drawn here.
      </p>
    );
  }

  const width = LANE_WIDTH * LANES.length;
  const height = TOP + ordered.length * ROW_HEIGHT + 16;
  const laneX = (id: LaneId) => LANES.findIndex((l) => l.id === id) * LANE_WIDTH + LANE_WIDTH / 2;
  const clientX = laneX('client');

  return (
    /**
     * The label lives on the container and the SVG carries no `role`, deliberately.
     *
     * It used to be `<svg role="img" aria-label="…">` — and `role="img"` makes the entire subtree
     * **presentational**, so the `role="button" tabIndex={0}` arrows inside were keyboard-focusable and
     * simultaneously invisible to a screen reader: a user could tab onto an element that announced
     * nothing. Wrong ARIA is worse than none. `role="group"` on the wrapper keeps the description while
     * leaving the arrows and their `<title>`s in the accessibility tree, so each one announces itself.
     */
    <div
      className="overflow-auto p-3"
      role="group"
      aria-label={`Message flow of ${ordered.length} requests between the client, the authorization server, the resource server and the management API`}
    >
      <svg width={width} height={height} className="min-w-full">
        {/* lifelines */}
        {LANES.map((lane) => (
          <g key={lane.id}>
            <text
              x={laneX(lane.id)}
              y={18}
              textAnchor="middle"
              className="fill-foreground"
              style={{ fontSize: 11, fontWeight: 600 }}
            >
              {lane.label}
            </text>
            <text
              x={laneX(lane.id)}
              y={32}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 8.5 }}
            >
              {lane.hint}
            </text>
            <line
              x1={laneX(lane.id)}
              y1={40}
              x2={laneX(lane.id)}
              y2={height - 8}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          </g>
        ))}

        {/* one arrow per request, client → party */}
        {ordered.map((entry, index) => {
          const y = TOP + index * ROW_HEIGHT;
          const targetX = laneX(laneFor(entry));
          const stroke = statusStroke(entry);
          const isSelected = entry.id === selectedId;
          const rightwards = targetX > clientX;
          const arrowTip = rightwards ? targetX - 6 : targetX + 6;

          /**
           * A front-channel hop is one arrow, not a round trip.
           *
           * The back-channel rows draw a solid request out and a dashed response back, because this app
           * sent the request and read the response. A navigation has no such pair: the browser left, and
           * the answer arrived later as a *separate* inbound hop with its own row. Drawing a dashed
           * return under it would invent a response nobody received — and would hide the very thing
           * these two rows exist to show, which is that the front channel is two one-way trips through
           * the user's browser rather than one request/response.
           */
          const isNav = Boolean(entry.navigation);
          const inbound = entry.direction === 'inbound';
          // An inbound hop is drawn AS → client: tail at the party, head at the client.
          const navFrom = inbound ? targetX : clientX;
          const navTo = inbound ? clientX : targetX;
          const navTip = inbound ? navTo + 6 : navTo - 6;

          return (
            <g
              key={entry.id}
              onClick={() => onSelect?.(entry.id)}
              className={cn(onSelect && 'cursor-pointer')}
              tabIndex={onSelect ? 0 : -1}
              role={onSelect ? 'button' : undefined}
              onKeyDown={(e) => {
                if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelect(entry.id);
                }
              }}
            >
              <title>
                {isNav
                  ? `${shortLabel(entry)} — front-channel ${inbound ? 'redirect back to the client' : 'navigation to the authorization server'}, no status observed by this app`
                  : `${shortLabel(entry)} → ${entry.status === 0 ? 'network error' : entry.status}, ${Math.round(entry.durationMs)} ms`}
              </title>

              {/* a wide transparent band, so the whole row is clickable rather than just the 1px line */}
              <rect
                x={0}
                y={y - ROW_HEIGHT / 2 + 4}
                width={width}
                height={ROW_HEIGHT - 6}
                className={cn(
                  isSelected ? 'fill-tint-accent' : 'fill-transparent hover:fill-muted/40',
                )}
              />

              {isNav ? (
                <>
                  <line
                    x1={navFrom}
                    y1={y}
                    x2={navTip}
                    y2={y}
                    stroke={stroke}
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                  />
                  <polygon
                    points={
                      inbound
                        ? `${navTip},${y} ${navTip + 5},${y - 3.5} ${navTip + 5},${y + 3.5}`
                        : `${navTip},${y} ${navTip - 5},${y - 3.5} ${navTip - 5},${y + 3.5}`
                    }
                    fill={stroke}
                  />
                  <text
                    x={(clientX + targetX) / 2}
                    y={y - 6}
                    textAnchor="middle"
                    className="fill-foreground-muted"
                    style={{ fontSize: 9.5, fontFamily: 'var(--font-mono, monospace)' }}
                  >
                    {shortLabel(entry)}
                  </text>
                  <text
                    x={(clientX + targetX) / 2}
                    y={y + 11}
                    textAnchor="middle"
                    fill={stroke}
                    style={{ fontSize: 9, fontFamily: 'var(--font-mono, monospace)' }}
                  >
                    front channel · browser redirect
                  </text>
                </>
              ) : (
                <>
                  {/* request */}
                  <line
                    x1={clientX}
                    y1={y}
                    x2={arrowTip}
                    y2={y}
                    stroke={stroke}
                    strokeWidth={1.5}
                  />
                  <polygon
                    points={
                      rightwards
                        ? `${arrowTip},${y} ${arrowTip - 5},${y - 3.5} ${arrowTip - 5},${y + 3.5}`
                        : `${arrowTip},${y} ${arrowTip + 5},${y - 3.5} ${arrowTip + 5},${y + 3.5}`
                    }
                    fill={stroke}
                  />
                  <text
                    x={(clientX + targetX) / 2}
                    y={y - 6}
                    textAnchor="middle"
                    className="fill-foreground-muted"
                    style={{ fontSize: 9.5, fontFamily: 'var(--font-mono, monospace)' }}
                  >
                    {shortLabel(entry)}
                  </text>

                  {/* response, drawn back to the client so the round trip is visible */}
                  <line
                    x1={targetX}
                    y1={y + 13}
                    x2={clientX + 6}
                    y2={y + 13}
                    stroke={stroke}
                    strokeWidth={1}
                    strokeDasharray="4 2"
                    opacity={0.75}
                  />
                  <text
                    x={(clientX + targetX) / 2}
                    y={y + 24}
                    textAnchor="middle"
                    fill={stroke}
                    style={{ fontSize: 9, fontFamily: 'var(--font-mono, monospace)' }}
                  >
                    {entry.status === 0 ? 'network error' : entry.status} ·{' '}
                    {Math.round(entry.durationMs)} ms
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export { SequenceView, laneFor };
