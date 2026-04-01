(function () {
  var SVG_NS = "http://www.w3.org/2000/svg";

  // Get the actual video resolution for the viewBox coordinate space
  function getVideoSize() {
    var videoEl = document.getElementById("hlsVideo");
    return {
      width: (videoEl && videoEl.videoWidth) || 320,
      height: (videoEl && videoEl.videoHeight) || 180
    };
  }

  // Lazy-get the SVG element (panel may not be visible at load time)
  function getSvg() {
    return document.getElementById("videoOverlay");
  }

  // Make SVG overlay cover the entire video element and let
  // preserveAspectRatio handle alignment (matches browser video scaling).
  function syncOverlaySize() {
    var svg = getSvg();
    var videoEl = document.getElementById("hlsVideo");
    if (!svg || !videoEl) return;

    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.width = videoEl.clientWidth + "px";
    svg.style.height = videoEl.clientHeight + "px";
  }

  // ------------------------------------------------------------------
  // Read current Video Layer panel options
  // ------------------------------------------------------------------
  function getOptions() {
    return {
      objectType:      (document.getElementById("videoObjectType") || {}).value || "all",
      objectShape:     (document.getElementById("videoObjectShape") || {}).value || "bbox",
      geoConfidence:   (document.getElementById("videoGeoConfidence") || {}).value || "all",
      confidenceScore: parseFloat((document.getElementById("videoConfidenceScore") || {}).value) || 0,
      shapeEnabled:    (document.getElementById("videoShapeEnabled") || {}).checked !== false,
      strokeColor:     (document.getElementById("videoStrokeColor") || {}).value || "#FF0000",
      strokeWidth:     parseInt((document.getElementById("videoStrokeWidth") || {}).value, 10) || 2,
      fillColor:       (document.getElementById("videoFillColor") || {}).value || "#FF0000",
      fillOpacity:     parseFloat((document.getElementById("videoFillOpacity") || {}).value) || 0.2,
      labelEnabled:    (document.getElementById("videoLabelEnabled") || {}).checked !== false,
      labelFontSize:   parseInt((document.getElementById("videoLabelFontSize") || {}).value, 10) || 10,
      labelColor:      (document.getElementById("videoLabelColor") || {}).value || "#FFFFFF",
      labelBgColor:    (document.getElementById("videoLabelBgColor") || {}).value || "#000000",
      labelBgOpacity:  parseFloat((document.getElementById("videoLabelBgOpacity") || {}).value || "0")
    };
  }

  // ------------------------------------------------------------------
  // Filter a feature against the current Video Layer options
  // ------------------------------------------------------------------
  function passesFilter(attrs, opts) {
    // Object type filter
    if (opts.objectType !== "all" && attrs.object_class !== opts.objectType) {
      return false;
    }
    // Geo confidence filter
    if (opts.geoConfidence !== "all") {
      var gc = (attrs.geo_confidence || "").toLowerCase();
      if (gc !== opts.geoConfidence) return false;
    }
    // Confidence score filter
    if (attrs.confidence_score != null && attrs.confidence_score < opts.confidenceScore) {
      return false;
    }
    return true;
  }

  // ------------------------------------------------------------------
  // Draw shapes for a batch of features
  // ------------------------------------------------------------------
  function drawFeatures(features) {
    var svg = getSvg();
    if (!svg) {
      console.warn("videoOverlay: SVG element not found");
      return;
    }

    var opts = getOptions();

    // Sync SVG size to match the video's actual rendered frame
    syncOverlaySize();

    // Set the SVG viewBox to match the detection coordinate space
    var size = getVideoSize();
    //log the video size to help diagnose coordinate issues
    console.log("videoOverlay: video size for viewBox:", size.width, size.height);
    svg.setAttribute("viewBox", "0 0 " + size.width + " " + size.height);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    var fillRgba = hexToRgba(opts.fillColor, opts.fillOpacity);
    var drawn = 0;

    // Log first feature's bbox to help diagnose coordinate range
    if (features.length > 0) {
      var s = features[0].attributes || {};
      console.log("videoOverlay: first feature bbox:", s.bbox_x1, s.bbox_y1, s.bbox_x2, s.bbox_y2,
        "frame_image:", s.frame_image, features.length);
    }

    // Interpolated features use a distinct color (yellow by default)
    var interpStrokeColor = opts.interpStrokeColor || "#FFFF00";
    var interpFillRgba = hexToRgba(opts.interpFillColor || "#FFFF00", opts.fillOpacity);

    features.forEach(function (f) {
      var a = f.attributes || {};
      if (!passesFilter(a, opts)) return;

      var stroke = a._interpolated ? interpStrokeColor : opts.strokeColor;
      var fill = a._interpolated ? interpFillRgba : fillRgba;

      if (opts.objectShape === "segmentation" && a.geometry_json) {
        if (opts.shapeEnabled) {
          drawPolygon(svg, a.geometry_json, stroke, opts.strokeWidth, fill);
        }
        if (opts.labelEnabled && a.bbox_x1 != null && a.bbox_y1 != null) {
          var segLabel = (a.object_class || "?") + " (" + (a.confidence_score != null ? a.confidence_score.toFixed(2) : "?") + ")";
          drawLabel(svg, Math.min(a.bbox_x1, a.bbox_x2 || a.bbox_x1), Math.min(a.bbox_y1, a.bbox_y2 || a.bbox_y1), segLabel, opts);
        }
        drawn++;
      } else if (a.bbox_x1 != null && a.bbox_y1 != null && a.bbox_x2 != null && a.bbox_y2 != null) {
        if (opts.shapeEnabled) {
          drawBBox(svg, a.bbox_x1, a.bbox_y1, a.bbox_x2, a.bbox_y2, stroke, opts.strokeWidth, fill);
        }
        if (opts.labelEnabled) {
          var label = (a.object_class || "?") + " (" + (a.confidence_score != null ? a.confidence_score.toFixed(2) : "?") + ")";
          drawLabel(svg, Math.min(a.bbox_x1, a.bbox_x2), Math.min(a.bbox_y1, a.bbox_y2), label, opts);
        }
        drawn++;
      }
    });

    if (drawn === 0 && features.length > 0) {
      // Log first feature attributes to help debug coordinate issues
      var sampleAttrs = features[0].attributes || {};
      console.log("videoOverlay: 0 shapes drawn from " + features.length + " features. Sample attrs:",
        "bbox_x1=" + sampleAttrs.bbox_x1,
        "bbox_y1=" + sampleAttrs.bbox_y1,
        "bbox_x2=" + sampleAttrs.bbox_x2,
        "bbox_y2=" + sampleAttrs.bbox_y2,
        "object_class=" + sampleAttrs.object_class,
        "filter: objectType=" + opts.objectType,
        "geoConfidence=" + opts.geoConfidence,
        "confidenceScore=" + opts.confidenceScore);
    }
  }

  // ------------------------------------------------------------------
  // Draw a bounding box rectangle
  // ------------------------------------------------------------------
  function drawBBox(svg, x1, y1, x2, y2, strokeColor, strokeWidth, fillColor) {
    var rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", Math.min(x1, x2));
    rect.setAttribute("y", Math.min(y1, y2));
    rect.setAttribute("width", Math.abs(x2 - x1));
    rect.setAttribute("height", Math.abs(y2 - y1));
    rect.setAttribute("stroke", strokeColor);
    rect.setAttribute("stroke-width", strokeWidth);
    rect.setAttribute("fill", fillColor);
    svg.appendChild(rect);
  }

  // ------------------------------------------------------------------
  // Draw a label above the top-left corner of a bounding box
  // ------------------------------------------------------------------
  function drawLabel(svg, x, y, text, opts) {
    var fontSize = opts.labelFontSize;
    var padding = 2;
    // Estimate background width based on character count
    var bgWidth = text.length * fontSize * 0.6 + padding * 2;
    var bgHeight = fontSize + padding * 2;
    var bgY = y - bgHeight;

    // Background rectangle behind the text
    var bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("x", x);
    bg.setAttribute("y", bgY);
    bg.setAttribute("width", bgWidth);
    bg.setAttribute("height", bgHeight);
    bg.setAttribute("fill", hexToRgba(opts.labelBgColor, opts.labelBgOpacity));
    bg.setAttribute("rx", 1);
    svg.appendChild(bg);

    // Text element
    var label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", x + padding);
    label.setAttribute("y", bgY + fontSize + padding * 0.5);
    label.setAttribute("fill", opts.labelColor);
    label.setAttribute("font-size", fontSize);
    label.setAttribute("font-family", "Arial, sans-serif");
    label.textContent = text;
    svg.appendChild(label);
  }

  // ------------------------------------------------------------------
  // Draw a segmentation polygon from geometry_json
  // geometry_json is expected to be a JSON string with a "rings" array
  // (ArcGIS polygon format) or an array of [x,y] coordinate pairs.
  // ------------------------------------------------------------------
  function drawPolygon(svg, geometryJson, strokeColor, strokeWidth, fillColor) {
    var geom;
    try {
      geom = typeof geometryJson === "string" ? JSON.parse(geometryJson) : geometryJson;
    } catch (e) {
      return;
    }

    // Support ArcGIS polygon format { rings: [[[x,y], ...]] }
    var rings = geom.rings || [geom];
    rings.forEach(function (ring) {
      if (!Array.isArray(ring) || ring.length === 0) return;
      var points = ring.map(function (pt) {
        return pt[0] + "," + pt[1];
      }).join(" ");

      var polygon = document.createElementNS(SVG_NS, "polygon");
      polygon.setAttribute("points", points);
      polygon.setAttribute("stroke", strokeColor);
      polygon.setAttribute("stroke-width", strokeWidth);
      polygon.setAttribute("fill", fillColor);
      svg.appendChild(polygon);
    });
  }

  // ------------------------------------------------------------------
  // Clear all shapes from the overlay
  // ------------------------------------------------------------------
  function clearOverlay() {
    var svg = getSvg();
    if (svg) {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
    }
  }

  // ------------------------------------------------------------------
  // Utility: convert hex color + opacity to rgba string
  // ------------------------------------------------------------------
  function hexToRgba(hex, opacity) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + opacity + ")";
  }

  // ------------------------------------------------------------------
  // Expose to global scope for media-player.js
  // ------------------------------------------------------------------
  window.videoOverlay = {
    drawFeatures: drawFeatures,
    clearOverlay: clearOverlay
  };
})();
