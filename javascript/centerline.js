// Centerline midpoint labeling algorithm
// Builds a Voronoi-based skeleton via Delaunay triangulation,
// finds the longest spine path, and places the label at
// the arc-length midpoint.
// Requires: d3-delaunay (for d3.Delaunay), polylabel.js (for fallback)
(function (global) {
  "use strict";

  function clDist(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  function clPointInPolygon(pt, ring) {
    var x = pt[0], y = pt[1], inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) &&
          (x < (xj - xi) * (y - yi) / (yj - yi + 1e-30) + xi)) inside = !inside;
    }
    return inside;
  }

  function clSegIntersect(p1, p2, p3, p4) {
    function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2);
    var d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
           ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  function clSegmentCrossesPolygon(a, b, ring) {
    for (var i = 0; i < ring.length; i++) {
      if (clSegIntersect(a, b, ring[i], ring[(i + 1) % ring.length])) return true;
    }
    return false;
  }

  function clCircumcenter(p0, p1, p2) {
    var ax = p0[0], ay = p0[1], bx = p1[0], by = p1[1], cx = p2[0], cy = p2[1];
    var d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-12) return null;
    var a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    return [(a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d,
            (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d];
  }

  function clTriCentroid(p0, p1, p2) {
    return [(p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3];
  }

  function clDensifyBoundary(ring, spacing) {
    var pts = [];
    for (var i = 0; i < ring.length; i++) {
      var a = ring[i], b = ring[(i + 1) % ring.length];
      var len = clDist(a, b);
      var n = Math.max(1, Math.ceil(len / spacing));
      for (var k = 0; k < n; k++) {
        var t = k / n;
        pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return pts;
  }

  function clBuildSkeleton(ring, spacing) {
    var samplePts = clDensifyBoundary(ring, spacing);
    var delaunay = d3.Delaunay.from(samplePts);
    var triangles = delaunay.triangles, halfedges = delaunay.halfedges;
    var nTri = triangles.length / 3;

    var circums = new Array(nTri);
    var triInside = new Array(nTri);
    for (var t = 0; t < nTri; t++) {
      var p0 = samplePts[triangles[t * 3]];
      var p1 = samplePts[triangles[t * 3 + 1]];
      var p2 = samplePts[triangles[t * 3 + 2]];
      circums[t] = clCircumcenter(p0, p1, p2);
      triInside[t] = clPointInPolygon(clTriCentroid(p0, p1, p2), ring);
    }

    var edges = [];
    for (var e = 0; e < halfedges.length; e++) {
      var opp = halfedges[e];
      if (opp === -1 || e > opp) continue;
      var t1 = Math.floor(e / 3), t2 = Math.floor(opp / 3);
      if (!triInside[t1] || !triInside[t2]) continue;
      var c1 = circums[t1], c2 = circums[t2];
      if (!c1 || !c2) continue;
      if (!clPointInPolygon(c1, ring) || !clPointInPolygon(c2, ring)) continue;
      if (clSegmentCrossesPolygon(c1, c2, ring)) continue;
      edges.push([c1, c2]);
    }
    return edges;
  }

  function clBuildGraph(edges) {
    var nodes = {}, adj = {};
    function keyOf(p) { return p[0].toFixed(4) + "," + p[1].toFixed(4); }
    for (var i = 0; i < edges.length; i++) {
      var a = edges[i][0], b = edges[i][1];
      var ka = keyOf(a), kb = keyOf(b);
      if (ka === kb) continue;
      if (!nodes[ka]) { nodes[ka] = a; adj[ka] = []; }
      if (!nodes[kb]) { nodes[kb] = b; adj[kb] = []; }
      var w = clDist(a, b);
      adj[ka].push({ nb: kb, w: w });
      adj[kb].push({ nb: ka, w: w });
    }
    return { nodes: nodes, adj: adj };
  }

  function clComponents(graph) {
    var seen = {}, comps = [];
    var keys = Object.keys(graph.nodes);
    for (var ki = 0; ki < keys.length; ki++) {
      var k = keys[ki];
      if (seen[k]) continue;
      var stack = [k], comp = [];
      while (stack.length) {
        var cur = stack.pop();
        if (seen[cur]) continue;
        seen[cur] = true;
        comp.push(cur);
        var nbrs = graph.adj[cur] || [];
        for (var ni = 0; ni < nbrs.length; ni++) {
          if (!seen[nbrs[ni].nb]) stack.push(nbrs[ni].nb);
        }
      }
      comps.push(comp);
    }
    return comps;
  }

  function clDijkstraAll(graph, srcKey, restrict) {
    var dists = {}, parents = {};
    dists[srcKey] = 0;
    var pq = [[0, srcKey]];
    while (pq.length) {
      pq.sort(function (a, b) { return a[0] - b[0]; });
      var top = pq.shift();
      var d = top[0], k = top[1];
      if (d > dists[k]) continue;
      var nbrs = graph.adj[k] || [];
      for (var ni = 0; ni < nbrs.length; ni++) {
        var nb = nbrs[ni].nb, w = nbrs[ni].w;
        if (restrict && !restrict[nb]) continue;
        var nd = d + w;
        if (dists[nb] === undefined || nd < dists[nb]) {
          dists[nb] = nd;
          parents[nb] = k;
          pq.push([nd, nb]);
        }
      }
    }
    var far = srcKey, max = 0;
    var distKeys = Object.keys(dists);
    for (var di = 0; di < distKeys.length; di++) {
      if (dists[distKeys[di]] > max) { max = dists[distKeys[di]]; far = distKeys[di]; }
    }
    return { dists: dists, parents: parents, far: far, max: max };
  }

  function clLongestPath(graph) {
    var comps = clComponents(graph);
    if (!comps.length) return [];
    var bestComp = comps[0], bestSize = 0;
    for (var ci = 0; ci < comps.length; ci++) {
      var edgeCount = 0;
      for (var ki = 0; ki < comps[ci].length; ki++) {
        edgeCount += (graph.adj[comps[ci][ki]] || []).length;
      }
      if (edgeCount > bestSize) { bestSize = edgeCount; bestComp = comps[ci]; }
    }
    var restrict = {};
    for (var ri = 0; ri < bestComp.length; ri++) restrict[bestComp[ri]] = true;
    var first = clDijkstraAll(graph, bestComp[0], restrict);
    var second = clDijkstraAll(graph, first.far, restrict);
    var path = [];
    var cur = second.far;
    while (cur !== undefined) {
      path.push(graph.nodes[cur]);
      cur = second.parents[cur];
    }
    return path;
  }

  function clArcMidpoint(path) {
    if (path.length === 0) return null;
    if (path.length === 1) return path[0];
    var total = 0;
    for (var i = 1; i < path.length; i++) total += clDist(path[i - 1], path[i]);
    var half = total / 2, acc = 0;
    for (var i = 1; i < path.length; i++) {
      var seg = clDist(path[i - 1], path[i]);
      if (acc + seg >= half) {
        var t = (half - acc) / seg;
        return [path[i - 1][0] + t * (path[i][0] - path[i - 1][0]),
                path[i - 1][1] + t * (path[i][1] - path[i - 1][1])];
      }
      acc += seg;
    }
    return path[path.length - 1];
  }

  function clDistanceToPolygon(pt, ring) {
    var min = Infinity;
    for (var i = 0; i < ring.length; i++) {
      var a = ring[i], b = ring[(i + 1) % ring.length];
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var len2 = dx * dx + dy * dy;
      var t = len2 === 0 ? 0 : ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      var d = clDist(pt, [a[0] + t * dx, a[1] + t * dy]);
      if (d < min) min = d;
    }
    return min;
  }

  function clRingArea(ring) {
    var area = 0;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    }
    return Math.abs(area) / 2;
  }

  function centerlineMidpoint(ring) {
    var perim = 0;
    for (var i = 0; i < ring.length; i++) perim += clDist(ring[i], ring[(i + 1) % ring.length]);

    // Adaptive sampling: estimate polygon width from area/perimeter,
    // then ensure spacing is at most width/3 so the triangulation
    // can resolve the cross-section even for long narrow corridors.
    var area = clRingArea(ring);
    var estWidth = perim > 0 ? 2 * area / perim : 0;
    var maxSpacing = estWidth > 0 ? estWidth / 3 : perim / 200;
    var spacing = Math.min(maxSpacing, perim / 200);
    var nSamples = Math.min(3000, Math.max(200, Math.ceil(perim / spacing)));
    spacing = perim / nSamples;

    var edges = clBuildSkeleton(ring, spacing);
    var graph = clBuildGraph(edges);
    var path = clLongestPath(graph);
    var mid = clArcMidpoint(path);
    return mid;
  }

  // ─── Public API ────────────────────────────────────

  global.computeCenterlineLabelPoints = function (allRings) {
    var results = [];
    for (var i = 0; i < allRings.length; i++) {
      var ring = allRings[i][0];
      var mid = centerlineMidpoint(ring);
      if (mid) {
        var d = clDistanceToPolygon(mid, ring);
        var pt = [mid[0], mid[1]];
        pt.distance = d;
        results.push(pt);
      } else {
        results.push(global.polylabel(allRings[i]));
      }
    }
    return results;
  };

})(window);
