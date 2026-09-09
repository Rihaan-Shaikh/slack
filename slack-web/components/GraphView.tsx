import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as d3 from "d3";
import { Maximize2, ZoomIn, ZoomOut, RotateCcw, ChevronDown, ChevronUp, MapPin, Clock, DollarSign } from "lucide-react";
import { GraphEdge, GraphNode, NodeImpact, SuggestedDependency } from "@/lib/types";
import { useZoom } from "@/hooks/useZoom";
import { useRippleAnimation } from "@/hooks/useRippleAnimation";
import { useD3Graph, getEdgeStyle } from "@/hooks/useD3Graph";

interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  onSelectNode: (node: GraphNode) => void;
  suggestedDependencies: SuggestedDependency[];
  disruptedBookingId?: string | null;
  ripplePath?: string[];
  perNodeImpact?: NodeImpact[];
  onFitToScreenRef?: (fn: () => void) => void;
  isReverseRippling?: boolean;
  reverseStepIndex?: number;
  pulsingNodeId?: string | null;
  showAtRiskOnly?: boolean;
}

interface D3Node extends d3.SimulationNodeDatum {
  id: string;
  type: "flight" | "hotel" | "transfer" | "activity";
  title: string;
  start_time: string;
  end_time: string;
  location?: string | null;
  vendor?: string | null;
  cost?: number | null;
  cancellation_policy?: string | null;
  metadata: Record<string, string | number | boolean | undefined>;
  trackIndex: number;
  timeX: number;
}

interface D3Link {
  id: string;
  from: string;
  to: string;
  source: string | D3Node;
  target: string | D3Node;
  min_buffer_minutes: number;
  actual_gap_minutes: number;
  slack_minutes: number;
  status: "safe" | "tight" | "violated";
}

const NODE_RADIUS = 30;

const TYPE_COLORS: Record<string, { fill: string; stroke: string; label: string; text: string }> = {
  flight: { fill: "#EBF3F9", stroke: "#2B5B84", label: "Flight", text: "#1E3E5B" },
  hotel: { fill: "#FBF1E8", stroke: "#885434", label: "Hotel", text: "#633B22" },
  transfer: { fill: "#EDF7F2", stroke: "#2D6A4F", label: "Transfer", text: "#1E4734" },
  activity: { fill: "#F7EEF6", stroke: "#6D3A6D", label: "Activity", text: "#4D284D" },
};

// Strict & Defensive Edge Style Resolver (guarantees safe slack >30m never renders as violated)
export function getEdgeStyle(status: "safe" | "tight" | "violated", slackMinutes?: number) {
  // Defensive validation: if slackMinutes is known, let mathematical truth govern style
  const effectiveStatus: "safe" | "tight" | "violated" =
    slackMinutes !== undefined
      ? slackMinutes < 0
        ? "violated"
        : slackMinutes <= 30
        ? "tight"
        : "safe"
      : status;

  if (effectiveStatus === "violated") {
    return {
      status: "violated" as const,
      stroke: "#B91C1C",
      strokeWidth: 3.5,
      strokeDasharray: "7,4",
      badgeBg: "#FEE2E2",
      badgeBorder: "#B91C1C",
      badgeText: "#991B1B",
    };
  }
  if (effectiveStatus === "tight") {
    return {
      status: "tight" as const,
      stroke: "#C05621",
      strokeWidth: 2.5,
      strokeDasharray: "none",
      badgeBg: "#FEF3C7",
      badgeBorder: "var(--accent)",
      badgeText: "#92400E",
    };
  }
  return {
    status: "safe" as const,
    stroke: "#64748B",
    strokeWidth: 1.75,
    strokeDasharray: "none",
    badgeBg: "#F1F5F9",
    badgeBorder: "#CBD5E1",
    badgeText: "#334155",
  };
}


export const TYPE_COLORS: Record<string, { fill: string; stroke: string; label: string; text: string }> = {
  flight: { fill: "#EBF3F9", stroke: "#2B5B84", label: "Flight", text: "#1E3E5B" },
  hotel: { fill: "#FBF1E8", stroke: "#885434", label: "Hotel", text: "#633B22" },
  transfer: { fill: "#EDF7F2", stroke: "#2D6A4F", label: "Transfer", text: "#1E4734" },
  activity: { fill: "#F7EEF6", stroke: "#6D3A6D", label: "Activity", text: "#4D284D" },
};

export const GraphView: React.FC<GraphViewProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  suggestedDependencies,
  disruptedBookingId,
  ripplePath = [],
  perNodeImpact = [],
  onFitToScreenRef,
  isReverseRippling = false,
  reverseStepIndex = -1,
  pulsingNodeId = null,
  showAtRiskOnly = false,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const gRootRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number }>({
    width: 1200,
    height: 620,
  });

  const [activeDayIndex, setActiveDayIndex] = useState<number | null>(null);
  const [isLegendCollapsed, setIsLegendCollapsed] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<{
    node: any;
    screenX: number;
    screenY: number;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerDimensions({ width: Math.round(width), height: Math.round(height) });
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { revealedRippleIndex } = useRippleAnimation(disruptedBookingId, ripplePath);

  const impactMap = useMemo(() => {
    const map = new Map<string, NodeImpact>();
    perNodeImpact.forEach((i) => map.set(i.booking_id, i));
    return map;
  }, [perNodeImpact]);

  const effectiveEdges = useMemo(() => {
    if (!showAtRiskOnly) return edges;
    return edges.filter((e) => e.status === "tight" || e.status === "violated" || e.slack_minutes <= 30);
  }, [edges, showAtRiskOnly]);

  const atRiskTargetNodeIds = useMemo(() => {
    const ids = new Set<string>();
    edges.forEach((e) => {
      if ((e.status === "tight" || e.status === "violated" || e.slack_minutes <= 30) && !disruptedBookingId) {
        ids.add(e.to);
      }
    });
    return ids;
  }, [edges, disruptedBookingId]);

  const dayBuckets = useMemo(() => {
    if (nodes.length === 0) return [];
    const sorted = [...nodes].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    const dayMap = new Map<string, { label: string; dateStr: string; startTimestamp: number; fullDate: string }>();

    sorted.forEach((n) => {
      const d = new Date(n.start_time);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!dayMap.has(key)) {
        const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        const fullDate = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        dayMap.set(key, { label, dateStr: key, startTimestamp: midnight.getTime(), fullDate });
      }
    });
    return Array.from(dayMap.values()).map((val, idx) => ({ ...val, dayNum: idx + 1 }));
  }, [nodes]);

  const suggestedNodeIds = useMemo(() => {
    const set = new Set<string>();
    suggestedDependencies.forEach((s) => {
      set.add(s.from);
      set.add(s.to);
    });
    return set;
  }, [suggestedDependencies]);

  const {
    fitToContent,
    handleZoomIn,
    handleZoomOut,
    handleJumpToDay,
    handleResetView
  } = useZoom(svgRef as any, zoomBehaviorRef, gRootRef, containerDimensions, nodes, nodePositionsRef, setActiveDayIndex);

  useEffect(() => {
    if (onFitToScreenRef) {
      onFitToScreenRef(fitToContent);
    }
  }, [onFitToScreenRef, fitToContent]);

  useD3Graph({
    svgRef, containerRef, zoomBehaviorRef, gRootRef, nodePositionsRef,
    containerDimensions, nodes, effectiveEdges, selectedNodeId, onSelectNode,
    suggestedDependencies, disruptedBookingId, ripplePath, revealedRippleIndex,
    impactMap, suggestedNodeIds, dayBuckets, fitToContent, pulsingNodeId,
    atRiskTargetNodeIds, isReverseRippling, reverseStepIndex, setHoveredNode
  });

  // Staggered timer to reveal ripple nodes sequentially in BFS order
  useEffect(() => {
    if (disruptedBookingId && ripplePath.length > 0) {
      setRevealedRippleIndex(0);
      let step = 0;
      const interval = setInterval(() => {
        step += 1;
        if (step < ripplePath.length) {
          setRevealedRippleIndex(step);
        } else {
          clearInterval(interval);
        }
      }, 280);

      return () => clearInterval(interval);
    } else {
      setRevealedRippleIndex(-1);
    }
  }, [disruptedBookingId, ripplePath]);

  // Index per_node_impact by booking_id
  const impactMap = useMemo(() => {
    const map = new Map<string, NodeImpact>();
    perNodeImpact.forEach((i) => map.set(i.booking_id, i));
    return map;
  }, [perNodeImpact]);

  // Phase 4: Filter edges if showAtRiskOnly is enabled
  const effectiveEdges = useMemo(() => {
    if (!showAtRiskOnly) return edges;
    return edges.filter(
      (e) => e.status === "tight" || e.status === "violated" || e.slack_minutes <= 30
    );
  }, [edges, showAtRiskOnly]);

  // Phase 4: Identify at-risk target nodes for persistent amber beacon marker
  const atRiskTargetNodeIds = useMemo(() => {
    const ids = new Set<string>();
    edges.forEach((e) => {
      if ((e.status === "tight" || e.status === "violated" || e.slack_minutes <= 30) && !disruptedBookingId) {
        ids.add(e.to);
      }
    });
    return ids;
  }, [edges, disruptedBookingId]);

  // Compute distinct days for Day-Jump navigation & gridlines
  const dayBuckets = useMemo(() => {
    if (nodes.length === 0) return [];
    const sorted = [...nodes].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    const dayMap = new Map<
      string,
      { label: string; dateStr: string; startTimestamp: number; fullDate: string }
    >();

    sorted.forEach((n) => {
      const d = new Date(n.start_time);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;

      if (!dayMap.has(key)) {
        // Midnight of this calendar day
        const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        const label = d.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        const fullDate = d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        dayMap.set(key, {
          label,
          dateStr: key,
          startTimestamp: midnight.getTime(),
          fullDate,
        });
      }
    });

    return Array.from(dayMap.values()).map((val, idx) => ({
      ...val,
      dayNum: idx + 1,
    }));
  }, [nodes]);

  // Set of node IDs involved in pending suggestions
  const suggestedNodeIds = useMemo(() => {
    const set = new Set<string>();
    suggestedDependencies.forEach((s) => {
      set.add(s.from);
      set.add(s.to);
    });
    return set;
  }, [suggestedDependencies]);

  // Affine Fit-to-Screen function: calculates exact zoom transform to center graph in viewport
  const fitToContent = useCallback(() => {
    if (!svgRef.current || !gRootRef.current || !zoomBehaviorRef.current) return;
    const gRoot = gRootRef.current;
    const bbox = (gRoot.node() as SVGGElement | null)?.getBBox();

    if (bbox && bbox.width > 0 && bbox.height > 0) {
      const { width: W, height: H } = containerDimensions;
      const padX = 70;
      const padY = 60;

      const scaleX = (W - 2 * padX) / bbox.width;
      const scaleY = (H - 2 * padY) / bbox.height;
      const scale = Math.max(0.18, Math.min(scaleX, scaleY, 1.15));

      const tx = (W - bbox.width * scale) / 2 - bbox.x * scale;
      const ty = (H - bbox.height * scale) / 2 - bbox.y * scale;

      const targetTransform = d3.zoomIdentity.translate(tx, ty).scale(scale);

      d3.select(svgRef.current)
        .transition()
        .duration(500)
        .ease(d3.easeCubicOut)
        .call(zoomBehaviorRef.current.transform, targetTransform);
    }
  }, [containerDimensions]);

  // Expose fitToContent to parent if requested
  useEffect(() => {
    if (onFitToScreenRef) {
      onFitToScreenRef(fitToContent);
    }
  }, [onFitToScreenRef, fitToContent]);

  // Primary D3 Render Effect
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || nodes.length === 0) return;

    const { width: viewportW, height: viewportH } = containerDimensions;

    // Chronologically sorted nodes
    const sortedByTime = [...nodes].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    // Compute actual time bounds
    const firstTimeMs = new Date(sortedByTime[0].start_time).getTime();
    const lastTimeMs = Math.max(
      new Date(sortedByTime[sortedByTime.length - 1].end_time).getTime(),
      firstTimeMs + 6 * 3600000
    );

    // Find midnight of Day 1 to anchor Day 1 divider
    const firstDate = new Date(firstTimeMs);
    const day1Midnight = new Date(
      firstDate.getFullYear(),
      firstDate.getMonth(),
      firstDate.getDate(),
      0,
      0,
      0,
      0
    ).getTime();

    // Give domain padding: starts slightly before day 1 or 1.5h before first booking
    const domainMin = Math.min(day1Midnight, firstTimeMs - 2 * 3600000);
    const domainMax = lastTimeMs + 2.5 * 3600000;

    // Allocate horizontal canvas coordinate range
    // Ensures at least 180px per node without wasting empty canvas space
    const minSpacingNeeded = Math.max(viewportW - 100, nodes.length * 190 + 260);
    const canvasContentWidth = Math.max(viewportW, minSpacingNeeded);

    // Left margin starts safely at 140px, guaranteeing Day 1 is never cut off
    const timeScale = d3
      .scaleLinear()
      .domain([domainMin, domainMax])
      .range([140, canvasContentWidth - 140]);

    // Setup SVG Canvas
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");

    // Arrowhead markers with refX=8.5: tip lands cleanly at circle perimeter
    (["safe", "tight", "violated"] as const).forEach((statusKey) => {
      const style = getEdgeStyle(statusKey);
      defs
        .append("marker")
        .attr("id", `arrow-${statusKey}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 8.5)
        .attr("refY", 0)
        .attr("markerWidth", 7.5)
        .attr("markerHeight", 7.5)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M 0,-3.8 L 8.5,0 L 0,3.8 Z")
        .attr("fill", style.stroke);
    });

    const gRoot = svg.append("g").attr("class", "graph-root");
    gRootRef.current = gRoot;

    // Layer groups strictly in z-order:
    // 1. Timeline Grid & Day Divider Gridlines
    const gridGroup = gRoot.append("g").attr("class", "timeline-grid-layer");
    // 2. Connecting Edges
    const linksGroup = gRoot.append("g").attr("class", "edges-layer");
    // 3. Leader Lines for displaced badges
    const leaderLinesGroup = gRoot.append("g").attr("class", "leader-lines-layer");
    // 4. Slack Badges
    const edgeLabelsGroup = gRoot.append("g").attr("class", "edge-labels-layer");
    // 5. Nodes
    const nodesGroup = gRoot.append("g").attr("class", "nodes-layer");

    // d3-zoom with affine matrix transform on gRoot
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 3.5])
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        gRoot.attr("transform", event.transform.toString());
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // Center baseline Y
    const centerY = Math.max(260, Math.round(viewportH / 2) - 10);

    // Time-Anchored Deterministic Coordinate Placement:
    // X is strictly anchored to timeScale(start_time).
    // Close or overlapping consecutive nodes alternate between Upper Track and Lower Track.
    const simNodes: D3Node[] = [];
    const minNodeGap = NODE_RADIUS * 2 + 35; // 95px minimum horizontal distance on same track

    sortedByTime.forEach((n, idx) => {
      const startTimeMs = new Date(n.start_time).getTime();
      const idealX = Math.round(timeScale(startTimeMs));

      // Decide vertical track: alternate Upper (-65px) and Lower (+65px)
      let trackIndex = idx % 2;
      let targetY = trackIndex === 1 ? centerY + 65 : centerY - 65;

      // Check if previous node on the same track is too close
      const prevSameTrack = simNodes.slice().reverse().find(sn => sn.trackIndex === trackIndex);
      if (prevSameTrack) {
        const gap = idealX - prevSameTrack.x!;
        if (gap < minNodeGap) {
          // Switch track
          trackIndex = 1 - trackIndex;
          targetY = trackIndex === 1 ? centerY + 65 : centerY - 65;
        }
      }

      // Preserve previously dragged coordinates if exists, else start at deterministic time position
      const cached = nodePositionsRef.current.get(n.id);
      const initialX = cached?.x ?? idealX;
      const initialY = cached?.y ?? targetY;

      simNodes.push({
        ...n,
        metadata: n.metadata as Record<string, string | number | boolean | undefined>,
        trackIndex,
        timeX: idealX,
        x: initialX,
        y: initialY,
      });
    });

    // Enforce strict left-to-right chronological order along X
    for (let i = 1; i < simNodes.length; i++) {
      const prev = simNodes[i - 1];
      const curr = simNodes[i];
      // Keep a minimum safe horizontal distance even between different tracks to prevent exact vertical overlap
      if (curr.x! < prev.x! + 45) {
        curr.x = prev.x! + 45;
      }
    }

    const nodeMap = new Map<string, D3Node>(simNodes.map((n) => [n.id, n]));

    // Update node positions cache
    simNodes.forEach((n) => {
      nodePositionsRef.current.set(n.id, { x: n.x!, y: n.y! });
    });

    // Day Divider Gridlines aligned strictly to the time scale (Requirement 15 & 4)
    dayBuckets.forEach((bucket) => {
      // Calculate day boundary on timeScale
      const rawX = timeScale(bucket.startTimestamp);
      // For Day 1, clamp to at least 110px so the label and line never hit or hide off-canvas
      const dividerX = Math.max(110, Math.round(rawX));

      // Vertical dashed gridline
      gridGroup
        .append("line")
        .attr("x1", dividerX)
        .attr("y1", 30)
        .attr("x2", dividerX)
        .attr("y2", centerY + 240)
        .attr("stroke", "var(--border)")
        .attr("stroke-width", 1.25)
        .attr("stroke-dasharray", "4,4");

      // Day Badge Background Pill
      const badgeG = gridGroup
        .append("g")
        .attr("transform", `translate(${dividerX + 10}, 32)`);

      badgeG
        .append("rect")
        .attr("rx", 4)
        .attr("ry", 4)
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", 108)
        .attr("height", 24)
        .attr("fill", "var(--card)")
        .attr("stroke", "var(--border-strong)")
        .attr("stroke-width", 1);

      badgeG
        .append("text")
        .attr("x", 8)
        .attr("y", 16)
        .attr("font-size", "11px")
        .attr("font-family", "var(--font-body), system-ui, sans-serif")
        .attr("font-weight", "700")
        .attr("fill", "var(--foreground)")
        .text(`Day ${bucket.dayNum}`);

      badgeG
        .append("text")
        .attr("x", 48)
        .attr("y", 16)
        .attr("font-size", "10px")
        .attr("font-family", "var(--font-body), system-ui, sans-serif")
        .attr("font-weight", "500")
        .attr("fill", "#8E887D")
        .text(bucket.fullDate);
    });

    // Prepare link data using effectiveEdges (supports at-risk filtering)
    const simLinks: D3Link[] = effectiveEdges.map((e) => ({
      ...e,
      source: e.from,
      target: e.to,
    }));

    const getSource = (link: D3Link): D3Node | undefined => {
      const id = typeof link.source === "object" ? link.source.id : (link.source as string) || link.from;
      return nodeMap.get(id);
    };

    const getTarget = (link: D3Link): D3Node | undefined => {
      const id = typeof link.target === "object" ? link.target.id : (link.target as string) || link.to;
      return nodeMap.get(id);
    };

    // Mathematical Edge Routing with Intermediate Node Clearance (Requirements 1 & 9)
    const computeEdgeGeometry = (link: D3Link) => {
      const src = getSource(link);
      const tgt = getTarget(link);
      if (!src || !tgt || src.x == null || src.y == null || tgt.x == null || tgt.y == null) {
        return null;
      }

      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) return null;

      const ux = dx / dist;
      const uy = dy / dist;
      const nx = -uy;
      const ny = ux;

      const mid = { x: (src.x + tgt.x) / 2, y: (src.y + tgt.y) / 2 };

      // Base natural curvature
      let h = -Math.max(28, Math.min(65, dist * 0.18));
      if (Math.abs(dy) > 20) {
        h = (dy > 0 ? 1 : -1) * Math.max(24, Math.min(55, Math.abs(dy) * 0.35));
      }

      // Check all intermediate nodes for obstacle clearance
      let maxDeflectionNeeded = 0;
      for (const other of simNodes) {
        if (other.id === src.id || other.id === tgt.id) continue;
        if (other.x == null || other.y == null) continue;

        const tox = other.x - src.x;
        const toy = other.y - src.y;
        const proj = tox * ux + toy * uy;

        // Is other node between src and tgt horizontally?
        if (proj > NODE_RADIUS && proj < dist - NODE_RADIUS) {
          const t = Math.max(0.1, Math.min(0.9, proj / dist));
          const curveHeightRatio = Math.max(0.2, 2 * t * (1 - t)); // quadratic Bézier deviation ratio
          const perpDist = tox * nx + toy * ny; // positive on normal side, negative on opposite
          const requiredClearance = NODE_RADIUS + 34;

          // If the default curve at this t would get closer than requiredClearance
          const projectedCurvePerp = h * curveHeightRatio;
          const separation = Math.abs(projectedCurvePerp - perpDist);

          if (separation < requiredClearance) {
            // Arc away from the intermediate node
            const sign = perpDist >= 0 ? -1 : 1;
            const neededH = sign * ((requiredClearance + Math.abs(perpDist)) / curveHeightRatio + 15);
            if (Math.abs(neededH) > Math.abs(maxDeflectionNeeded)) {
              maxDeflectionNeeded = neededH;
            }
          }
        }
      }

      if (maxDeflectionNeeded !== 0) {
        h = maxDeflectionNeeded;
      }

      // Control Point
      const pc = { x: mid.x + nx * h, y: mid.y + ny * h };

      // Exact Perimeter Snapping:
      // Start point p0 lies on the perimeter of source circle facing pc
      const phi = Math.atan2(pc.y - src.y, pc.x - src.x);
      const p0 = {
        x: src.x + Math.cos(phi) * NODE_RADIUS,
        y: src.y + Math.sin(phi) * NODE_RADIUS,
      };

      // End point p2 lies on the perimeter of target circle facing pc
      // Offset by 6px so the arrowhead tip (refX=8.5) sits flush with the outer circle border
      const theta = Math.atan2(pc.y - tgt.y, pc.x - tgt.x);
      const p2 = {
        x: tgt.x + Math.cos(theta) * (NODE_RADIUS + 6),
        y: tgt.y + Math.sin(theta) * (NODE_RADIUS + 6),
      };

      // Exact midpoint on quadratic Bézier B(0.5)
      const anchor = {
        x: 0.25 * p0.x + 0.5 * pc.x + 0.25 * p2.x,
        y: 0.25 * p0.y + 0.5 * pc.y + 0.25 * p2.y,
      };

      const pathData = `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} Q ${pc.x.toFixed(1)} ${pc.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
      return { pathData, anchor, p0, p2, pc, normal: { x: nx, y: ny } };
    };

    // Helper to resolve edge style, with reverse ripple awareness
    const resolveLinkStyle = (d: D3Link) => {
      if (isReverseRippling && reverseStepIndex >= 0) {
        const reversedPath = [...ripplePath].reverse();
        const fromId = typeof d.from === "string" ? d.from : (d.from as any).id;
        const toId = typeof d.to === "string" ? d.to : (d.to as any).id;
        const fromRev = reversedPath.indexOf(fromId);
        const toRev = reversedPath.indexOf(toId);
        if ((fromRev !== -1 && fromRev <= reverseStepIndex) || (toRev !== -1 && toRev <= reverseStepIndex)) {
          return getEdgeStyle("safe", 45);
        }
      }
      return getEdgeStyle(d.status, d.slack_minutes);
    };

    // Render Edges
    const linkElements = linksGroup
      .selectAll<SVGPathElement, D3Link>("path.edge")
      .data(simLinks, (d) => d.id)
      .enter()
      .append("path")
      .attr("class", (d) => `edge edge-${resolveLinkStyle(d).status}`)
      .attr("data-edge-id", (d) => d.id)
      .attr("stroke", (d) => resolveLinkStyle(d).stroke)
      .attr("stroke-width", (d) => resolveLinkStyle(d).strokeWidth)
      .attr("stroke-dasharray", (d) => resolveLinkStyle(d).strokeDasharray)
      .attr("fill", "none")
      .attr("marker-end", (d) => `url(#arrow-${resolveLinkStyle(d).status})`)
      .attr("d", (d) => computeEdgeGeometry(d)?.pathData || "");

    // Collision-Free Slack Badge Placement Pass (Requirement 8)
    interface BadgeItem {
      link: D3Link;
      anchor: { x: number; y: number };
      x: number;
      y: number;
      width: number;
      height: number;
      normal: { x: number; y: number };
      hasLeaderLine: boolean;
      text: string;
    }

    const badgeItems: BadgeItem[] = [];

    simLinks.forEach((link) => {
      const geom = computeEdgeGeometry(link);
      if (!geom) return;

      const isTight = link.status === "tight" || (link.slack_minutes >= 0 && link.slack_minutes <= 30);
      const isViolated = link.status === "violated" || link.slack_minutes < 0;
      const sign = link.slack_minutes > 0 ? "+" : "";
      const prefix = isViolated ? "✕ " : isTight ? "⚠ " : "";
      const text = `${prefix}${sign}${link.slack_minutes}m slack`;
      // Generous dynamic badge width ensuring no text truncation (Requirement 8)
      const width = Math.max(94, Math.round(text.length * 8 + 26));
      const height = 24;

      badgeItems.push({
        link,
        anchor: geom.anchor,
        x: geom.anchor.x,
        y: geom.anchor.y,
        width,
        height,
        normal: geom.normal,
        hasLeaderLine: false,
        text,
      });
    });

    // Multi-pass iterative relaxation for badge collisions
    for (let pass = 0; pass < 5; pass++) {
      // Step A: Push badges away from all node circles & labels
      badgeItems.forEach((b) => {
        simNodes.forEach((node) => {
          if (node.x == null || node.y == null) return;
          
          // Better bounding box collision for node AND its label
          // Node center is node.y, label goes down to node.y + NODE_RADIUS + 35
          // We can roughly check if badge center is within a safe ellipse or rectangle
          const dx = Math.abs(b.x - node.x);
          
          // Center of the node+label block is roughly node.y + 15
          const dy = Math.abs(b.y - (node.y + 15));
          
          const reqX = b.width / 2 + NODE_RADIUS + 15; // 15px padding
          const reqY = b.height / 2 + NODE_RADIUS + 25; // to cover the label
          
          if (dx < reqX && dy < reqY) {
            // It's overlapping the node or label box. Push it along the normal or just outwards.
            const pushY = reqY - dy + 4;
            const pushX = reqX - dx + 4;
            // Push it mostly vertically if it's above/below, or horizontally if beside
            if (dy > dx) {
              b.y += (b.y > node.y + 15 ? 1 : -1) * pushY;
            } else {
              b.x += (b.x > node.x ? 1 : -1) * pushX;
            }
          }
        });
      });

      // Step B: Resolve badge-to-badge overlap
      badgeItems.sort((a, b) => a.x - b.x);
      for (let i = 0; i < badgeItems.length; i++) {
        for (let j = i + 1; j < badgeItems.length; j++) {
          const bi = badgeItems[i];
          const bj = badgeItems[j];
          const dx = Math.abs(bi.x - bj.x);
          const dy = Math.abs(bi.y - bj.y);
          const reqX = (bi.width + bj.width) / 2 + 12;
          const reqY = (bi.height + bj.height) / 2 + 8;

          if (dx < reqX && dy < reqY) {
            const shiftY = (reqY - dy) / 2 + 6;
            bi.y -= shiftY;
            bj.y += shiftY;
          }
        }
      }
    }

    // Leader lines for badges displaced from edge anchor
    badgeItems.forEach((b) => {
      const distFromAnchor = Math.hypot(b.x - b.anchor.x, b.y - b.anchor.y);
      if (distFromAnchor > 12) {
        b.hasLeaderLine = true;
        const style = getEdgeStyle(b.link.status, b.link.slack_minutes);
        leaderLinesGroup
          .append("line")
          .attr("x1", b.anchor.x)
          .attr("y1", b.anchor.y)
          .attr("x2", b.x)
          .attr("y2", b.y)
          .attr("stroke", style.badgeBorder)
          .attr("stroke-width", 1.2)
          .attr("stroke-dasharray", "3,3");
      }
    });

    // Render Slack Badges
    const edgeLabelGroups = edgeLabelsGroup
      .selectAll<SVGGElement, BadgeItem>("g.edge-label-group")
      .data(badgeItems, (d) => d.link.id)
      .enter()
      .append("g")
      .attr("class", "edge-label-group")
      .attr("data-edge-id", (d) => d.link.id)
      .attr("transform", (d) => `translate(${d.x}, ${d.y})`);

    edgeLabelGroups
      .append("rect")
      .attr("rx", 12)
      .attr("ry", 12)
      .attr("x", (d) => -d.width / 2)
      .attr("y", -12)
      .attr("width", (d) => d.width)
      .attr("height", (d) => d.height)
      .attr("fill", (d) => resolveLinkStyle(d.link).badgeBg)
      .attr("stroke", (d) => resolveLinkStyle(d.link).badgeBorder)
      .attr("stroke-width", (d) => (d.link.slack_minutes < 0 ? 1.75 : 1.25));

    edgeLabelGroups
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("y", 0)
      .attr("font-size", "10px")
      .attr("font-family", "var(--font-body), system-ui, sans-serif")
      .attr("font-weight", "700")
      .attr("fill", (d) => resolveLinkStyle(d.link).badgeText)
      .text((d) => d.text);

    // Render Nodes
    const nodeElements = nodesGroup
      .selectAll<SVGGElement, D3Node>("g.node")
      .data(simNodes, (d) => d.id)
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("data-node-id", (d) => d.id)
      .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
      .style("cursor", "pointer")
      .on("click", (_event, d) => {
        const originalNode = nodes.find((n) => n.id === d.id);
        if (originalNode) {
          onSelectNode(originalNode);
        }
      })
      .on("mouseenter", (event, d) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setHoveredNode({
            node: d,
            screenX: event.clientX - rect.left,
            screenY: event.clientY - rect.top,
          });
        }
      })
      .on("mouseleave", () => {
        setHoveredNode(null);
      });

    // Native title fallback for accessibility
    nodeElements.append("title").text((d) => `${d.title} • ${d.start_time.split("T")[1]?.substring(0, 5)}`);

    // 1. Disruption Origin Pulse Ring
    nodeElements
      .filter((d) => {
        if (d.id !== disruptedBookingId) return false;
        if (isReverseRippling && reverseStepIndex >= 0 && ripplePath.length > 0) {
          return reverseStepIndex < ripplePath.length - 1;
        }
        return true;
      })
      .append("circle")
      .attr("class", "origin-disruption-ring")
      .attr("r", NODE_RADIUS + 7)
      .attr("stroke", "#B91C1C")
      .attr("stroke-width", 3.5)
      .attr("fill", "none");

    // 2. Downstream BFS Ripple Rings
    nodeElements
      .filter((d) => {
        if (isReverseRippling && reverseStepIndex >= 0) {
          const revIdx = [...ripplePath].reverse().indexOf(d.id);
          return revIdx > reverseStepIndex;
        }
        const idx = ripplePath.indexOf(d.id);
        return idx !== -1 && idx <= revealedRippleIndex;
      })
      .append("circle")
      .attr("class", (d) => {
        const impact = impactMap.get(d.id);
        if (impact?.severity === "missed") return "missed-ripple-ring";
        if (impact?.severity === "at_risk") return "at-risk-ripple-ring";
        return "";
      })
      .attr("r", NODE_RADIUS + 5)
      .attr("stroke", (d) => {
        const impact = impactMap.get(d.id);
        if (impact?.severity === "missed") return "#B91C1C";
        if (impact?.severity === "at_risk") return "#C05621";
        return "none";
      })
      .attr("stroke-width", 3)
      .attr("fill", "none");

    // 2b. Phase 3 Reverse Ripple Settling Ring (Emerald ring settling node back to safe)
    if (isReverseRippling && reverseStepIndex >= 0) {
      const reversedPath = [...ripplePath].reverse();
      const currentRestoredId = reversedPath[reverseStepIndex];
      nodeElements
        .filter((d) => d.id === currentRestoredId)
        .append("circle")
        .attr("class", "restore-ripple-ring")
        .attr("r", NODE_RADIUS + 6)
        .attr("stroke", "#059669")
        .attr("stroke-width", 3.5)
        .attr("fill", "none");
    }

    // 2c. Phase 4 Persistent Amber Beacon Ring on at-risk thin connection nodes (Pre-disruption caught)
    nodeElements
      .filter((d) => atRiskTargetNodeIds.has(d.id) && d.id !== disruptedBookingId)
      .append("circle")
      .attr("class", "amber-beacon-ring")
      .attr("r", NODE_RADIUS + 6)
      .attr("stroke", "var(--accent)")
      .attr("stroke-width", 3)
      .attr("fill", "none");

    // 2d. Phase 4 Silent Realtime Node Pulse (when mutated remotely via broadcast)
    nodeElements
      .filter((d) => d.id === pulsingNodeId)
      .append("circle")
      .attr("class", "realtime-node-pulse")
      .attr("r", NODE_RADIUS + 6)
      .attr("stroke", "#059669")
      .attr("stroke-width", 3.5)
      .attr("fill", "none");

    // 3. Auto-Suggestion Amber Pulse Ring
    nodeElements
      .filter((d) => suggestedNodeIds.has(d.id) && d.id !== disruptedBookingId)
      .append("circle")
      .attr("class", "node-pulse-ring")
      .attr("r", NODE_RADIUS + 6)
      .attr("stroke", "var(--accent)")
      .attr("stroke-width", 2.5)
      .attr("fill", "none");

    // Main Node Circle
    nodeElements
      .append("circle")
      .attr("r", NODE_RADIUS)
      .attr("fill", (d) => TYPE_COLORS[d.type]?.fill || "var(--background)")
      .attr("stroke", (d) => {
        if (d.id === selectedNodeId) return "var(--foreground)";
        return TYPE_COLORS[d.type]?.stroke || "var(--foreground)";
      })
      .attr("stroke-width", (d) => (d.id === selectedNodeId ? 3.5 : 2));

    // Type Badge inside circle
    nodeElements
      .append("text")
      .attr("text-anchor", "middle")
      .attr("y", -5)
      .attr("font-size", "9px")
      .attr("font-family", "var(--font-body), system-ui, sans-serif")
      .attr("font-weight", "700")
      .attr("text-transform", "uppercase")
      .attr("fill", (d) => TYPE_COLORS[d.type]?.stroke || "var(--foreground)")
      .text((d) => TYPE_COLORS[d.type]?.label || d.type);

    // Time text inside circle
    nodeElements
      .append("text")
      .attr("text-anchor", "middle")
      .attr("y", 9)
      .attr("font-size", "10.5px")
      .attr("font-family", "var(--font-body), system-ui, sans-serif")
      .attr("font-weight", "600")
      .attr("fill", "#4A453C")
      .text((d) => {
        if (d.start_time.includes("T")) {
          return d.start_time.split("T")[1].substring(0, 5);
        }
        return "";
      });

    // Node Title below circle with truncation and hover affordance (Requirement 7)
    nodeElements
      .append("text")
      .attr("text-anchor", "middle")
      .attr("y", NODE_RADIUS + 16)
      .attr("font-size", "11px")
      .attr("font-family", "var(--font-heading), Georgia, serif")
      .attr("font-weight", "600")
      .attr("fill", "var(--foreground)")
      .text((d) => {
        return d.title.length > 22 ? d.title.substring(0, 20) + "..." : d.title;
      });

    // Node Location below title
    nodeElements
      .append("text")
      .attr("text-anchor", "middle")
      .attr("y", NODE_RADIUS + 29)
      .attr("font-size", "9.5px")
      .attr("font-family", "var(--font-body), system-ui, sans-serif")
      .attr("fill", "#8E887D")
      .text((d) => {
        if (!d.location) return "";
        return d.location.length > 22 ? d.location.substring(0, 20) + "..." : d.location;
      });

    // Node Drag Behavior: allow manual fine-tuning while updating edges
    const drag = d3
      .drag<SVGGElement, D3Node>()
      .on("start", (event, d) => {
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
        d.x = event.x;
        d.y = event.y;

        d3.select(event.sourceEvent.target.closest("g.node")).attr(
          "transform",
          `translate(${d.x}, ${d.y})`
        );

        linkElements.attr("d", (l) => computeEdgeGeometry(l)?.pathData || "");
      })
      .on("end", (event, d) => {
        if (d.x != null && d.y != null) {
          nodePositionsRef.current.set(d.id, { x: d.x, y: d.y });
        }
        d.fx = null;
        d.fy = null;
      });

    nodeElements.call(drag);

    // Initial centering fit
    fitToContent();
  }, [
    nodes,
    effectiveEdges,
    selectedNodeId,
    onSelectNode,
    suggestedDependencies,
    disruptedBookingId,
    ripplePath,
    revealedRippleIndex,
    impactMap,
    suggestedNodeIds,
    containerDimensions,
    dayBuckets,
    fitToContent,
    pulsingNodeId,
    atRiskTargetNodeIds,
  ]);

  // Zoom Controls: Zoom In / Out / Reset
  const handleZoomIn = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 1.25);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 0.8);
  };

  // Day-Jump navigation handler: centers view on selected day cluster
  const handleJumpToDay = (timestamp: number, dayIdx: number) => {
    setActiveDayIndex(dayIdx);
    if (!svgRef.current || !zoomBehaviorRef.current) return;

    const dayDateStr = new Date(timestamp).toISOString().slice(0, 10);
    const dayNodes = nodes.filter((n) => n.start_time.startsWith(dayDateStr));
    if (dayNodes.length === 0) return;

    const dayPositions = dayNodes
      .map((n) => nodePositionsRef.current.get(n.id)?.x)
      .filter((x): x is number => x != null);
    if (dayPositions.length === 0) return;

    const avgX = dayPositions.reduce((a, b) => a + b, 0) / dayPositions.length;
    const { width: W, height: H } = containerDimensions;
    const centerY = Math.max(260, Math.round(H / 2) - 10);

    const scale = 1.1;
    const tx = W / 2 - avgX * scale;
    const ty = H / 2 - centerY * scale;

    const targetTransform = d3.zoomIdentity.translate(tx, ty).scale(scale);

    d3.select(svgRef.current)
      .transition()
      .duration(550)
      .ease(d3.easeCubicOut)
      .call(zoomBehaviorRef.current.transform, targetTransform);
  };

  const handleResetView = () => {
    setActiveDayIndex(null);
    fitToContent();
  };

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-[var(--background)] touch-none select-none">
      {/* Top Controls Bar: Day Jumps & Camera Controls */}
      <div className="absolute top-3 left-5 right-5 z-10 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Day-Jump Navigation */}
        <div className="pointer-events-auto flex items-center gap-1.5 border border-[var(--border-strong)] bg-[var(--card)] px-2.5 py-1.5 text-xs">
          <span className="text-[11px] font-semibold text-[#8E887D] mr-1">Timeline:</span>
          <button
            onClick={handleResetView}
            className={`px-2 py-0.5 text-[11px] font-medium transition-colors ${
              activeDayIndex === null
                ? "bg-[var(--foreground)] text-[var(--background)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            All Days
          </button>
          {dayBuckets.map((d, idx) => (
            <button
              key={d.dateStr}
              onClick={() => handleJumpToDay(d.startTimestamp, idx)}
              className={`px-2 py-0.5 text-[11px] font-medium transition-colors ${
                activeDayIndex === idx
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Day {d.dayNum} ({d.fullDate})
            </button>
          ))}
        </div>

        {/* Zoom & Fit Control Cluster */}
        <div className="pointer-events-auto flex items-center gap-1 border border-[var(--border-strong)] bg-[var(--card)] p-1 text-xs">
          <button
            onClick={handleZoomIn}
            className="p-1.5 text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            title="Zoom in (+)"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1.5 text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            title="Zoom out (-)"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <div className="h-4 w-px bg-[var(--border)] mx-0.5" />
          <button
            onClick={fitToContent}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            title="Fit whole graph to screen"
          >
            <Maximize2 className="h-3 w-3" />
            <span>Fit</span>
          </button>
          <button
            onClick={handleResetView}
            className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            title="Reset view"
            aria-label="Reset view"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Responsive SVG Canvas */}
      <svg
        ref={svgRef}
        className="h-full w-full select-none cursor-grab active:cursor-grabbing"
        style={{ minHeight: "560px" }}
      />

      {/* Interactive Instant Hover Tooltip for untruncated label affordance (Requirement 7) */}
      {hoveredNode && (
        <div
          className="pointer-events-none absolute z-30 border border-[var(--foreground)] bg-[var(--card)] p-3 text-xs shadow-none max-w-xs"
          style={{
            left: `${Math.min(containerDimensions.width - 240, hoveredNode.screenX + 16)}px`,
            top: `${Math.max(20, hoveredNode.screenY - 70)}px`,
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="inline-block border px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider"
              style={{
                backgroundColor: TYPE_COLORS[hoveredNode.node.type]?.fill,
                borderColor: TYPE_COLORS[hoveredNode.node.type]?.stroke,
                color: TYPE_COLORS[hoveredNode.node.type]?.text,
              }}
            >
              {TYPE_COLORS[hoveredNode.node.type]?.label}
            </span>
            {hoveredNode.node.vendor && (
              <span className="text-[11px] text-[#8E887D]">by {hoveredNode.node.vendor}</span>
            )}
          </div>
          <div className="font-serif-heading text-sm font-bold text-[var(--foreground)]">
            {hoveredNode.node.title}
          </div>
          <div className="mt-1.5 space-y-1 text-[var(--muted-foreground)] text-[11px]">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-[#8E887D]" />
              <span>
                {hoveredNode.node.start_time.split("T")[1]?.substring(0, 5)} -{" "}
                {hoveredNode.node.end_time.split("T")[1]?.substring(0, 5)}
              </span>
            </div>
            {hoveredNode.node.location && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-[#8E887D]" />
                <span className="truncate">{hoveredNode.node.location}</span>
              </div>
            )}
            {hoveredNode.node.cost != null && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-[#8E887D]" />
                <span>${hoveredNode.node.cost.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unclipped, Collapsible Legend Panel in Bottom-Left (Requirement 5) */}
      <div className="absolute bottom-4 left-5 z-20 border border-[var(--border-strong)] bg-[var(--card)] text-xs max-w-sm">
        <div
          onClick={() => setIsLegendCollapsed(!isLegendCollapsed)}
          className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer select-none hover:bg-[var(--background)] transition-colors"
        >
          <div className="font-serif-heading font-semibold text-[var(--foreground)]">
            Itinerary Graph Legend
          </div>
          <button className="text-[#8E887D] hover:text-[var(--foreground)]" aria-label="Toggle legend">
            {isLegendCollapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {!isLegendCollapsed && (
          <div className="p-3 pt-1 border-t border-[var(--border)] flex flex-col gap-2 text-[var(--muted-foreground)]">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full border border-[#2B5B84] bg-[#EBF3F9]" />
                <span>Flight</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full border border-[#885434] bg-[#FBF1E8]" />
                <span>Hotel</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full border border-[#2D6A4F] bg-[#EDF7F2]" />
                <span>Transfer</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full border border-[#6D3A6D] bg-[#F7EEF6]" />
                <span>Activity</span>
              </div>
            </div>
            <div className="border-t border-[var(--border)] pt-2 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-block h-1 w-5 bg-[#64748B]" />
                <span className="text-[#334155] font-medium">Safe (&gt;30m slack)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-5 bg-[#C05621]" />
                <span className="text-[#92400E] font-medium">Tight (0-30m buffer)</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-1.5 w-5 border-b-2 border-dashed border-[#B91C1C]"
                  style={{ height: "0px" }}
                />
                <span className="text-[#991B1B] font-bold">Violated (&lt;0m, missed)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
