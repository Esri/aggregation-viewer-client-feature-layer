// polylabel v2 — bundled for browser use (no ES module imports)
// Source: https://github.com/mapbox/polylabel (ISC License)
// TinyQueue: https://github.com/mourner/tinyqueue (ISC License)
(function (global) {
  "use strict";

  // ─── TinyQueue (binary heap priority queue) ────────

  function TinyQueue(data, compare) {
    this.data = data || [];
    this.length = this.data.length;
    this.compare = compare || function (a, b) { return a < b ? -1 : a > b ? 1 : 0; };

    if (this.length > 0) {
      for (var i = (this.length >> 1) - 1; i >= 0; i--) this._down(i);
    }
  }

  TinyQueue.prototype.push = function (item) {
    this.data.push(item);
    this._up(this.length++);
  };

  TinyQueue.prototype.pop = function () {
    if (this.length === 0) return undefined;
    var top = this.data[0];
    var bottom = this.data.pop();
    if (--this.length > 0) {
      this.data[0] = bottom;
      this._down(0);
    }
    return top;
  };

  TinyQueue.prototype._up = function (pos) {
    var data = this.data, compare = this.compare;
    var item = data[pos];
    while (pos > 0) {
      var parent = (pos - 1) >> 1;
      var current = data[parent];
      if (compare(item, current) >= 0) break;
      data[pos] = current;
      pos = parent;
    }
    data[pos] = item;
  };

  TinyQueue.prototype._down = function (pos) {
    var data = this.data, compare = this.compare;
    var halfLength = this.length >> 1;
    var item = data[pos];
    while (pos < halfLength) {
      var bestChild = (pos << 1) + 1;
      var right = bestChild + 1;
      if (right < this.length && compare(data[right], data[bestChild]) < 0) {
        bestChild = right;
      }
      if (compare(data[bestChild], item) >= 0) break;
      data[pos] = data[bestChild];
      pos = bestChild;
    }
    data[pos] = item;
  };

  // ─── Polylabel ─────────────────────────────────────

  function polylabel(polygon, precision) {
    if (precision === undefined) precision = 1.0;

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var outerRing = polygon[0];
    for (var i = 0; i < outerRing.length; i++) {
      var x = outerRing[i][0], y = outerRing[i][1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    var width = maxX - minX;
    var height = maxY - minY;
    var cellSize = Math.max(precision, Math.min(width, height));

    if (cellSize === precision) {
      var result = [minX, minY];
      result.distance = 0;
      return result;
    }

    var cellQueue = new TinyQueue([], function (a, b) { return b.max - a.max; });

    var bestCell = getCentroidCell(polygon);
    var bboxCell = new Cell(minX + width / 2, minY + height / 2, 0, polygon);
    if (bboxCell.d > bestCell.d) bestCell = bboxCell;

    function potentiallyQueue(x, y, h) {
      var cell = new Cell(x, y, h, polygon);
      if (cell.max > bestCell.d + precision) cellQueue.push(cell);
      if (cell.d > bestCell.d) bestCell = cell;
    }

    var h = cellSize / 2;
    for (var x = minX; x < maxX; x += cellSize) {
      for (var y = minY; y < maxY; y += cellSize) {
        potentiallyQueue(x + h, y + h, h);
      }
    }

    while (cellQueue.length) {
      var cell = cellQueue.pop();
      if (cell.max - bestCell.d <= precision) break;

      h = cell.h / 2;
      potentiallyQueue(cell.x - h, cell.y - h, h);
      potentiallyQueue(cell.x + h, cell.y - h, h);
      potentiallyQueue(cell.x - h, cell.y + h, h);
      potentiallyQueue(cell.x + h, cell.y + h, h);
    }

    var result = [bestCell.x, bestCell.y];
    result.distance = bestCell.d;
    return result;
  }

  function Cell(x, y, h, polygon) {
    this.x = x;
    this.y = y;
    this.h = h;
    this.d = pointToPolygonDist(x, y, polygon);
    this.max = this.d + this.h * Math.SQRT2;
  }

  function pointToPolygonDist(x, y, polygon) {
    var inside = false;
    var minDistSq = Infinity;

    for (var k = 0; k < polygon.length; k++) {
      var ring = polygon[k];
      for (var i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
        var a = ring[i];
        var b = ring[j];
        if ((a[1] > y !== b[1] > y) &&
            (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) inside = !inside;
        minDistSq = Math.min(minDistSq, getSegDistSq(x, y, a, b));
      }
    }
    return minDistSq === 0 ? 0 : (inside ? 1 : -1) * Math.sqrt(minDistSq);
  }

  function getCentroidCell(polygon) {
    var area = 0, x = 0, y = 0;
    var points = polygon[0];
    for (var i = 0, len = points.length, j = len - 1; i < len; j = i++) {
      var a = points[i];
      var b = points[j];
      var f = a[0] * b[1] - b[0] * a[1];
      x += (a[0] + b[0]) * f;
      y += (a[1] + b[1]) * f;
      area += f * 3;
    }
    var centroid = new Cell(x / area, y / area, 0, polygon);
    if (area === 0 || centroid.d < 0) return new Cell(points[0][0], points[0][1], 0, polygon);
    return centroid;
  }

  function getSegDistSq(px, py, a, b) {
    var x = a[0], y = a[1];
    var dx = b[0] - x, dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      var t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = px - x;
    dy = py - y;
    return dx * dx + dy * dy;
  }

  // ─── Short-axis projection for concave polygons ─────

  function computeShortAxis(ring) {
    var n = ring.length;
    if (n > 1 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]) n--;
    if (n < 3) return null;

    var mx = 0, my = 0;
    for (var i = 0; i < n; i++) { mx += ring[i][0]; my += ring[i][1]; }
    mx /= n; my /= n;

    var cxx = 0, cxy = 0, cyy = 0;
    for (var i = 0; i < n; i++) {
      var dx = ring[i][0] - mx, dy = ring[i][1] - my;
      cxx += dx * dx;
      cxy += dx * dy;
      cyy += dy * dy;
    }

    var diff = cxx - cyy;
    var disc = Math.sqrt(diff * diff + 4 * cxy * cxy);
    var lambda = ((cxx + cyy) - disc) / 2;

    var vx, vy;
    if (Math.abs(cxy) > 1e-10) {
      vx = lambda - cyy;
      vy = cxy;
    } else {
      if (cxx <= cyy) { vx = 1; vy = 0; }
      else { vx = 0; vy = 1; }
    }

    var len = Math.sqrt(vx * vx + vy * vy);
    if (len < 1e-10) return null;
    return { dx: vx / len, dy: vy / len };
  }

  function linePolygonIntersections(cx, cy, dx, dy, polygon) {
    var ts = [];
    for (var r = 0; r < polygon.length; r++) {
      var ring = polygon[r];
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var ax = ring[j][0], ay = ring[j][1];
        var bx = ring[i][0], by = ring[i][1];
        var ex = bx - ax, ey = by - ay;

        var denom = dx * ey - dy * ex;
        if (Math.abs(denom) < 1e-12) continue;

        var s = ((ax - cx) * dy - (ay - cy) * dx) / denom;
        if (s < 0 || s > 1) continue;

        var t = ((ax - cx) * ey - (ay - cy) * ex) / denom;
        ts.push(t);
      }
    }
    ts.sort(function (a, b) { return a - b; });
    return ts;
  }

  function moveToInterior(polygon, cx, cy) {
    var axis = computeShortAxis(polygon[0]);
    if (!axis) return null;

    var ts = linePolygonIntersections(cx, cy, axis.dx, axis.dy, polygon);
    if (ts.length < 2) return null;

    var bestMidT = null, bestDist = Infinity;
    for (var k = 0; k < ts.length - 1; k += 2) {
      var midT = (ts[k] + ts[k + 1]) / 2;
      if (Math.abs(midT) < bestDist) {
        bestDist = Math.abs(midT);
        bestMidT = midT;
      }
    }
    if (bestMidT === null) return null;

    var lx = cx + bestMidT * axis.dx;
    var ly = cy + bestMidT * axis.dy;

    var d = pointToPolygonDist(lx, ly, polygon);
    if (d <= 0) return null;

    var pt = [lx, ly];
    pt.distance = d;
    return pt;
  }

  // ─── Public API ────────────────────────────────────

  function trueCentroid(polygon) {
    var area = 0, cx = 0, cy = 0;
    var points = polygon[0];
    for (var i = 0, len = points.length, j = len - 1; i < len; j = i++) {
      var a = points[i], b = points[j];
      var f = a[0] * b[1] - b[0] * a[1];
      cx += (a[0] + b[0]) * f;
      cy += (a[1] + b[1]) * f;
      area += f * 3;
    }
    if (Math.abs(area) < 1e-10) return null;
    return { x: cx / area, y: cy / area };
  }

  global.polylabel = polylabel;
  global.pointToPolygonDist = pointToPolygonDist;

  global.computeAlignedLabelPoints = function (allRings) {
    var results = [];
    for (var i = 0; i < allRings.length; i++) {
      var polygon = allRings[i];
      var c = trueCentroid(polygon);
      if (!c) { results.push(polylabel(polygon)); continue; }

      var d = pointToPolygonDist(c.x, c.y, polygon);
      if (d > 0) {
        var pt = [c.x, c.y];
        pt.distance = d;
        results.push(pt);
      } else {
        var moved = moveToInterior(polygon, c.x, c.y);
        if (moved) {
          results.push(moved);
        } else {
          results.push(polylabel(polygon));
        }
      }
    }
    return results;
  };

})(window);
