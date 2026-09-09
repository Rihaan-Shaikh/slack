import * as d3 from "d3";
import { useCallback } from "react";

export function useZoom(
  svgRef: React.RefObject<SVGSVGElement>,
  zoomBehaviorRef: React.MutableRefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>,
  gRootRef: React.MutableRefObject<d3.Selection<SVGGElement, unknown, null, undefined> | null>,
  containerDimensions: { width: number; height: number },
  nodes: any[],
  nodePositionsRef: React.MutableRefObject<Map<string, { x: number; y: number }>>,
  setActiveDayIndex: (idx: number | null) => void
) {
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
  }, [containerDimensions, svgRef, gRootRef, zoomBehaviorRef]);

  const handleZoomIn = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 1.25);
  }, [svgRef, zoomBehaviorRef]);

  const handleZoomOut = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 0.8);
  }, [svgRef, zoomBehaviorRef]);

  const handleJumpToDay = useCallback((timestamp: number, dayIdx: number) => {
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
  }, [nodes, nodePositionsRef, containerDimensions, setActiveDayIndex, svgRef, zoomBehaviorRef]);

  const handleResetView = useCallback(() => {
    setActiveDayIndex(null);
    fitToContent();
  }, [setActiveDayIndex, fitToContent]);

  return {
    fitToContent,
    handleZoomIn,
    handleZoomOut,
    handleJumpToDay,
    handleResetView
  };
}
