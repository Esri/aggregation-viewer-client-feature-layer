(function () {
  const HLS_VIEWER_BASE_URL = "https://geooptic-hls-viewer.velocitydevclusters.com";

  const treeRoot = document.getElementById('tree-root');
  const video = document.getElementById('hlsVideo');
  const fileNameDisplay = document.getElementById('video-file-name');
  const filePathDisplay = document.getElementById('video-file-path');
  const statusBadge = document.getElementById('video-status-badge');

  const mediaStorePanel = document.getElementById('media-store-panel');
  const videoPlayerPanel = document.getElementById('video-player-panel');
  const featuresPanel = document.getElementById('features-panel');
  const videoLayerPanel = document.getElementById('video-layer-panel');

  // CloudFront URL — fetched from the server's /api/config endpoint at startup.
  // When set, video files are loaded directly via CloudFront (no signing needed).
  // When empty, the backend /api/playlist and /api/sign endpoints are used instead.
  let cloudfrontUrl = '';

  let hls = null;

  // Segment metadata: maps segment name (e.g. "segment00000") to [timestamp, segment, duration]
  let segmentTriplets = {};
  // Feature layer URL resolved for the current hour-level folder
  let currentFeatureLayerUrl = null;

  // Allow app.js to update the feature layer URL (e.g. when auto-selecting from dropdown)
  window.setMediaPlayerFeatureLayerUrl = function (url) {
    console.log("Media player feature layer URL set to:", url);
    currentFeatureLayerUrl = url;
  };

  // LRU cache for queried features: up to 10 segments
  const FEATURE_CACHE_MAX = 10;
  let featureCacheKeys = [];   // ordered from oldest to newest
  let featureCache = {};       // segment name → features array

  // Resolve feature layer URL from a prefix like media-store/video-hls/<camera-id>/<date>/<hour>/
  // Uses the dynamic lookup provided by app.js (window.resolveFeatureLayerUrl)
  // function getFeatureLayerUrl(prefix) {
  //   var match = prefix.match(/^media-store\/video-hls\/([^/]+)\/([^/]+)\//);
  //   if (!match) return null;
  //   if (!window.resolveFeatureLayerUrl) return null;
  //   return window.resolveFeatureLayerUrl(match[1], match[2]);
  // }

  // Parse an HLS playlist response into a list of [timestamp, segment, duration] triplets.
  // Skips the first 4 lines (header), then processes every 3 lines as one triplet.
  function parsePlaylist(text) {
    const lines = text.split('\n').filter(l => l.trim() !== '');
    const triplets = [];
    for (let i = 4; i + 2 < lines.length; i += 3) {
      const timestampLine = lines[i];     // #EXT-X-PROGRAM-DATE-TIME:...
      const durationLine  = lines[i + 1]; // #EXTINF:6.000000,
      const urlLine       = lines[i + 2]; // https://...segmentNNNNN.ts?...

      const timestamp = timestampLine.replace('#EXT-X-PROGRAM-DATE-TIME:', '');
      const duration  = durationLine.replace('#EXTINF:', '').replace(',', '');
      const segmentMatch = urlLine.match(/\/(segment\d+)\.ts/);
      const segment = segmentMatch ? segmentMatch[1] : urlLine;

      triplets.push([timestamp, segment, duration]);
    }
    return triplets;
  }

  // Video-to-feature sync parameters
  var videoSegmentLength = 6;   // seconds per .ts segment
  var videoPlaySpeed = 1;       // video playback speed multiplier (e.g. 2 = 2x faster)
  var metadataRollDelay = 1;    // seconds to wait before starting metadata rolling (gives video time to load)
  // ------------------------------------------------------------------
  // Panel toggle helpers
  // ------------------------------------------------------------------
  function updatePanelPositions() {
    if (!videoPlayerPanel || !videoLayerPanel) return;
    var gap = 10;
    // Video Player sits to the right of Video Layer
    var vlRight = videoLayerPanel.offsetLeft + videoLayerPanel.offsetWidth;
    videoPlayerPanel.style.left = (vlRight + gap) + 'px';

    // Features panel sits to the right of Video Player
    if (featuresPanel) {
      var vpRight = videoPlayerPanel.offsetLeft + videoPlayerPanel.offsetWidth;
      featuresPanel.style.left = (vpRight + gap) + 'px';
    }
  }

  function setupPanelToggle(toggleId, panelId, onToggle) {
    const toggle = document.getElementById(toggleId);
    const panel = document.getElementById(panelId);
    if (toggle && panel) {
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        const isHidden = panel.classList.toggle('section-hidden');
        const icon = toggle.querySelector('i');
        if (icon) {
          icon.className = isHidden ? 'fa fa-chevron-down' : 'fa fa-chevron-up';
        }
        if (onToggle) onToggle();
      });
    }
  }

  setupPanelToggle('mediaStoreToggle', 'media-store-panel', updatePanelPositions);
  setupPanelToggle('videoPlayerToggle', 'video-player-panel', updatePanelPositions);
  setupPanelToggle('featuresToggle', 'features-panel');

  // Set initial positions based on collapsed states
  setTimeout(updatePanelPositions, 0);

  // Timer ID for the rolling feature display so we can cancel on new segment
  var featureRollTimer = null;


  // ------------------------------------------------------------------
  // selectFeaturesForSegment — sync video segment to feature display
  // Extracts segment number from key (e.g. "segment00011.ts" → 11),
  // then progressively rolls through features in sync with the video.
  // ------------------------------------------------------------------
  // State for the rolling display so pause/resume can continue where it left off
  var rollState = null;  // { start, end, currentIndex, baseIntervalMs }

  function selectFeaturesForSegment(key) {
    // Cancel any previous rolling display
    stopFeatureRoll();

    var segMatch = key.match(/(segment\d+)\.ts$/);
    if (!segMatch) return;

    var segName = segMatch[1];
    var triplet = segmentTriplets[segName];

    // Extract segment path for hls_segment query:
    // key = "media-store/video-hls/CalTrans-Camera-199/2026-03-30/16/segment00032.ts"
    // segmentPath = "CalTrans-Camera-199/2026-03-30/16/segment00032.ts"
    var pathMatch = key.match(/media-store\/video-hls\/(.+\.ts)$/);
    var segmentPath = pathMatch ? pathMatch[1] : null;

    var duration = triplet ? triplet[2] : videoSegmentLength;

    console.log("Segment " + segName + ": segmentPath=" + segmentPath);

    // Clear table and video overlay for this segment
    if (window.clearFeaturesTable) window.clearFeaturesTable();
    if (window.videoOverlay) window.videoOverlay.clearOverlay();

    if (!currentFeatureLayerUrl) {
      console.warn("No feature layer URL available");
      return;
    }

    if (!segmentPath || !window.queryFeaturesForSegment) {
      console.warn("No segment path or queryFeaturesForSegment not available");
      return;
    }

    // Sync the input URL and dropdown to match the metadata feature layer
    if (window.setInputFeatureLayer) {
      window.setInputFeatureLayer(currentFeatureLayerUrl);
    }

    // Check cache first
    if (featureCache[segName]) {
      console.log("Cache hit for segment " + segName + ": " + featureCache[segName].length + " features");
      startFeatureRoll(featureCache[segName], duration);
      return;
    }

    // Query features by hls_segment field
    window.queryFeaturesForSegment(currentFeatureLayerUrl, segmentPath)
      .then(function (features) {
        if (!features || features.length === 0) {
          console.log("No features found for segment " + segName);
          return;
        }
        console.log("Fetched " + features.length + " features for segment " + segName);

        // Cache the result; evict oldest if at capacity
        if (featureCacheKeys.length >= FEATURE_CACHE_MAX) {
          var evicted = featureCacheKeys.shift();
          delete featureCache[evicted];
        }
        featureCache[segName] = features;
        featureCacheKeys.push(segName);

        startFeatureRoll(features, duration);
      })
      .catch(function (err) {
        console.error("Failed to query features for segment:", err);
      });
  }

  // Fixed tick interval (ms) for rolling; batch size adjusts to fit the duration
  var rollTickMs = 100;

  function startFeatureRoll(features, duration) {
    var durationSec = parseFloat(duration) || videoSegmentLength;
    // Subtract the roll delay so rolling finishes in sync with the video
    var availableMs = Math.max(rollTickMs, (durationSec - metadataRollDelay) * 1000);
    var totalTicks = Math.floor(availableMs / rollTickMs);
    var batchSize = Math.max(1, Math.ceil(features.length / totalTicks));

    rollState = {
      features: features,
      currentIndex: 0,
      end: features.length,
      batchSize: batchSize
    };

    // Group features by frame for shape drawing
    var frameGroups = groupFeaturesByFrame(features);

    // Delay the start of both rolling and shape drawing
    featureRollTimer = setTimeout(function () {
      if (!rollState) return;
      appendBatch();
      scheduleNextFeature();
    }, metadataRollDelay * 1000);

    // Start shape drawing loop synced to video.currentTime
    startShapeDrawLoop(frameGroups);
  }

  // ------------------------------------------------------------------
  // Group features by frame_image into ordered frames.
  // Each group has: { timestamp (epoch ms), offsetSec (hls_segment_offset_sec), features }
  // Features are expected to arrive ordered by frame_image from the query.
  // ------------------------------------------------------------------
  function groupFeaturesByFrame(features) {
    var map = {};
    var order = [];
    features.forEach(function (f) {
      var a = f.attributes || {};
      var key = a.frame_image || a.timestamp || "";
      if (!map[key]) {
        map[key] = { features: [], timestamp: a.timestamp, offsetSec: a.hls_segment_offset_sec };
        order.push(key);
      }
      map[key].features.push(f);
    });
    return order.map(function (k) {
      return map[k];
    });
  }

  // ------------------------------------------------------------------
  // Shape drawing loop — uses requestAnimationFrame to sync bounding
  // boxes with the video's actual currentTime.
  // Matches video.currentTime + syncOffset against each frame group's
  // hls_segment_offset_sec to find the closest detection frame.
  // ------------------------------------------------------------------
  var shapeDrawState = null; // { frameGroups, lastDrawnFrame, rafId }

  function startShapeDrawLoop(frameGroups) {
    stopShapeDraw();
    if (!frameGroups || frameGroups.length === 0) return;

    shapeDrawState = {
      frameGroups: frameGroups,
      lastDrawnFrame: -1,
      rafId: null
    };

    shapeDrawState.rafId = requestAnimationFrame(shapeDrawTick);
  }

  function shapeDrawTick() {
    if (!shapeDrawState) return;

    var groups = shapeDrawState.frameGroups;
    var currentTime = video ? video.currentTime : 0;

    // Find the frame group with the closest hls_segment_offset_sec to video.currentTime
    var bestIdx = -1;
    var bestDist = Infinity;
    for (var i = 0; i < groups.length; i++) {
      var dist = Math.abs(groups[i].offsetSec - currentTime);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    // Only redraw when the matched frame changes
    if (bestIdx >= 0 && bestIdx !== shapeDrawState.lastDrawnFrame) {
      shapeDrawState.lastDrawnFrame = bestIdx;
      if (window.videoOverlay) {
        window.videoOverlay.clearOverlay();
        window.videoOverlay.drawFeatures(groups[bestIdx].features);
      }
    }

    shapeDrawState.rafId = requestAnimationFrame(shapeDrawTick);
  }

  function stopShapeDraw() {
    if (shapeDrawState && shapeDrawState.rafId) {
      cancelAnimationFrame(shapeDrawState.rafId);
    }
    shapeDrawState = null;
  }

  // ------------------------------------------------------------------
  // Metadata rolling (table rows only, no shape drawing)
  // ------------------------------------------------------------------
  function appendBatch() {
    if (!rollState) return;
    var start = rollState.currentIndex;
    var end = Math.min(start + rollState.batchSize, rollState.end);
    var batch = rollState.features.slice(start, end);
    rollState.currentIndex = end;
    if (batch.length > 0) {
      window.appendFeatureRow(batch);
    }
  }

  function scheduleNextFeature() {
    if (!rollState || rollState.currentIndex >= rollState.end) {
      featureRollTimer = null;
      return;
    }
    var adjustedMs = rollTickMs / videoPlaySpeed;

    featureRollTimer = setTimeout(function () {
      if (!rollState || rollState.currentIndex >= rollState.end) {
        featureRollTimer = null;
        return;
      }
      appendBatch();
      scheduleNextFeature();
    }, adjustedMs);
  }

  function stopFeatureRoll() {
    if (featureRollTimer) {
      clearTimeout(featureRollTimer);
      featureRollTimer = null;
    }
    stopShapeDraw();
  }

  // Pause/resume: pause the shape drawing RAF loop and metadata rolling
  // when the user explicitly pauses (not when the video ends naturally).
  if (video) {
    video.addEventListener('pause', function () {
      if (!video.ended) {
        // Pause metadata rolling
        if (featureRollTimer) {
          clearTimeout(featureRollTimer);
          featureRollTimer = null;
        }
        // Pause shape drawing RAF loop
        if (shapeDrawState && shapeDrawState.rafId) {
          cancelAnimationFrame(shapeDrawState.rafId);
          shapeDrawState.rafId = null;
        }
      }
    });
    video.addEventListener('play', function () {
      // Resume metadata rolling if there are remaining features
      if (rollState && rollState.currentIndex < rollState.end && !featureRollTimer) {
        scheduleNextFeature();
      }
      // Resume shape drawing RAF loop
      if (shapeDrawState && !shapeDrawState.rafId) {
        shapeDrawState.rafId = requestAnimationFrame(shapeDrawTick);
      }
    });
  }

  // ------------------------------------------------------------------
  // resetUI — ported from hls-viewer resetUI()
  // ------------------------------------------------------------------
  function resetUI(name, path, badgeClass, badgeText) {
    fileNameDisplay.innerText = name;
    filePathDisplay.innerText = path;
    statusBadge.className = badgeClass;
    statusBadge.innerText = badgeText;
  }

  // ------------------------------------------------------------------
  // loadTreeLevel — ported from hls-viewer loadTreeLevel()
  // Lazily loads one level of the S3 tree from /api/tree
  // ------------------------------------------------------------------
  async function loadTreeLevel(prefix, container) {
    if (container.getAttribute('data-loaded') === 'true') {
      return;
    }

    // if (mediaStorePanel.classList.contains('section-hidden')) {
    //   return;
    // }

    try {
      const res = await fetch(`${HLS_VIEWER_BASE_URL}/api/tree?prefix=${encodeURIComponent(prefix)}`);
      if (!res.ok) {
        console.error("Tree fetch failed:", res.status, res.statusText);
        return;
      }
      const data = await res.json();

      if (data.error) {
        alert("Error: " + data.error);
        return;
      }

      renderNodes(data, container);

      container.setAttribute('data-loaded', 'true');
      container.style.display = 'block';

      // When prefix matches media-store/video-hls/<camera-id>/<date>/<hour>/,
      // load video segment metadata from the media server and resolve the feature layer.
      const hourLevelMatch = prefix.match(/^media-store\/video-hls\/([^/]+)\/([^/]+\/[^/]+)\/$/);
      if (hourLevelMatch) {
        const cameraId = hourLevelMatch[1];
        const playlistKey = prefix + cameraId + ".m3u8";
        const playlistUrl = `${HLS_VIEWER_BASE_URL}/api/playlist?key=${playlistKey}`;
        console.log("Hour-level folder detected, loading playlist:", playlistUrl);
        try {
          const playlistRes = await fetch(playlistUrl);
          const playlistText = await playlistRes.text();
          const triplets = parsePlaylist(playlistText);
          //console.log("Parsed video segments:", triplets);

          // Clear caches for the new hour-level folder
          segmentTriplets = {};
          featureCache = {};
          featureCacheKeys = [];
          triplets.forEach(function (t) {
            segmentTriplets[t[1]] = t; // key = segment name, value = [timestamp, segment, duration]
          });

          // Resolve and store the feature layer URL for this camera/date
          //currentFeatureLayerUrl = getFeatureLayerUrl(prefix);
          console.log("Feature layer URL:", currentFeatureLayerUrl);
        } catch (err) {
          console.error("Failed to load playlist:", err);
        }
      }

    } catch (e) {
      console.error("Failed to load tree level:", e);
    }
  }

  // ------------------------------------------------------------------
  // renderNodes — ported from hls-viewer renderNodes()
  // Creates folder / file DOM nodes with click handlers
  // Note: uses FA 4 icon classes (fa fa-folder) instead of FA 6 (fa-solid)
  // ------------------------------------------------------------------
  function renderNodes(data, container) {
    const folders = data.folders.sort((a, b) => a.name.localeCompare(b.name));
    const files   = data.files.sort((a, b) => a.name.localeCompare(b.name));

    folders.forEach(folder => {
      const wrapper = document.createElement('div');

      const node = document.createElement('div');
      node.className = 'tree-node folder-node';
      node.innerHTML = `<i class="fa fa-folder text-warning" style="color:#e6a817;"></i> <span>${folder.name}</span>`;

      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';

      node.onclick = (e) => {
        e.stopPropagation();
        const icon = node.querySelector('i');
        const isLoaded = childrenContainer.getAttribute('data-loaded') === 'true';

        if (isLoaded) {
          const isHidden = childrenContainer.style.display === 'none';
          childrenContainer.style.display = isHidden ? 'block' : 'none';
          icon.className = isHidden ? 'fa fa-folder-open' : 'fa fa-folder';
          icon.style.color = '#e6a817';
        } else {
          icon.className = 'fa fa-folder-open';
          icon.style.color = '#e6a817';
          loadTreeLevel(folder.path, childrenContainer);
        }
      };

      wrapper.appendChild(node);
      wrapper.appendChild(childrenContainer);
      container.appendChild(wrapper);
    });

    files.forEach(file => {
      const node = document.createElement('div');
      node.className = 'tree-node file-node';
      // FA 4 equivalents: fa-file-video-o (m3u8) / fa-film (other)
      let iconClass = file.name.endsWith('.m3u8') ? 'fa-file-video-o' : 'fa-film';
      let iconColor = file.name.endsWith('.m3u8') ? '#dc3545' : '#6c757d';
      node.innerHTML = `<i class="fa ${iconClass}" style="color:${iconColor};"></i> <span>${file.name}</span>`;

      node.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.file-node').forEach(el => el.classList.remove('active'));
        node.classList.add('active');
        playFile(file.path, file.name);
      };
      container.appendChild(node);
    });
  }

  // ------------------------------------------------------------------
  // playFile — ported from hls-viewer playFile()
  // Two modes identical to the original:
  //   1. CloudFront mode — build URL directly, no signing needed
  //   2. Direct S3 mode  — use backend /api/playlist and /api/sign
  // ------------------------------------------------------------------
  async function playFile(key, name) {
    if (hls) { hls.destroy(); hls = null; }

    // Open the Video Player panel if it is hidden
    if (videoPlayerPanel && videoPlayerPanel.classList.contains('section-hidden')) {
      videoPlayerPanel.classList.remove('section-hidden');
      var vpToggle = document.getElementById('videoPlayerToggle');
      if (vpToggle) {
        var vpIcon = vpToggle.querySelector('i');
        if (vpIcon) vpIcon.className = 'fa fa-chevron-up';
      }
      updatePanelPositions();
    }

    // --- CloudFront mode: build URL directly, no signing needed ---
    if (cloudfrontUrl) {
      const videoUrl = cloudfrontUrl + '/' + key;

      if (name.endsWith('.m3u8')) {
        resetUI(name, key, "video-badge video-badge-playing", "Playing Archived Playlist");
        if (Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(videoUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoUrl;
          video.play();
        }
      } else if (name.endsWith('.ts')) {
        resetUI(name, key, "video-badge video-badge-segment", "Playing Single Segment");
        selectFeaturesForSegment(key);
        if (Hls.isSupported()) {
          const dummyManifest = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:7\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6.0,\n" + videoUrl + "\n#EXT-X-ENDLIST";
          hls = new Hls();
          hls.loadSource(URL.createObjectURL(new Blob([dummyManifest], {type: 'application/x-mpegURL'})));
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
        } else {
          video.src = videoUrl;
          video.play();
        }
      } else {
        resetUI(name, key, "video-badge video-badge-direct", "Direct Playback");
        video.src = videoUrl;
        video.play();
      }
      return;
    }

    // --- Direct S3 mode: use backend endpoints for signing ---
    if (name.endsWith('.m3u8')) {
      // Use the playlist-rewriting endpoint so segment URLs are presigned
      const playlistUrl = `${HLS_VIEWER_BASE_URL}/api/playlist?key=${encodeURIComponent(key)}`;
      resetUI(name, key, "video-badge video-badge-playing", "Playing Archived Playlist");
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(playlistUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playlistUrl;
        video.play();
      }
    } else {
      // .ts segments and other files: get a presigned URL
      try {
        const res = await fetch(`${HLS_VIEWER_BASE_URL}/api/sign?key=${encodeURIComponent(key)}`);
        if (!res.ok) {
          console.error("Sign request failed:", res.status, res.statusText);
          resetUI(name, key, "video-badge video-badge-error", "Error");
          return;
        }
        const data = await res.json();
        if (data.error) {
          alert("Sign Error: " + data.error);
          return;
        }
        const videoUrl = data.url;

        if (name.endsWith('.ts')) {
          resetUI(name, key, "video-badge video-badge-segment", "Playing Single Segment");
          selectFeaturesForSegment(key);
          if (Hls.isSupported()) {
            const dummyManifest = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:7\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6.0,\n" + videoUrl + "\n#EXT-X-ENDLIST";
            hls = new Hls();
            hls.loadSource(URL.createObjectURL(new Blob([dummyManifest], {type: 'application/x-mpegURL'})));
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
          } else {
            video.src = videoUrl;
            video.play();
          }
        } else {
          resetUI(name, key, "video-badge video-badge-direct", "Direct Playback");
          video.src = videoUrl;
          video.play();
        }
      } catch (e) {
        console.error("Failed to sign URL:", e);
        resetUI(name, key, "video-badge video-badge-error", "Error");
      }
    }
  }

  // ------------------------------------------------------------------
  // Init — fetch CloudFront config, then load root tree level
  // ------------------------------------------------------------------
  async function init() {
    // if (mediaStorePanel.classList.contains('section-hidden')) {
    //   return;
    // }

    // Try to get the CloudFront URL from the server config
    try {
      const res = await fetch(`${HLS_VIEWER_BASE_URL}/api/config`);
      if (res.ok) {
        const config = await res.json();
        cloudfrontUrl = config.cloudfront_url || '';
      }
    } catch (e) {
      // Server may not have /api/config — fall back to direct S3 mode
      console.log("No /api/config endpoint; using backend API mode for playback.");
    }

    if (treeRoot) {
      loadTreeLevel('', treeRoot);
    }

    // Test: query features using window.queryFeatures (defined in app.js via esriRequest)
    // if (window.queryFeatures) {
    //   window.queryFeatures(
    //     'https://us6-iotdev.arcgis.com/dedicated/9ltepoauoaon0okn/maps/arcgis/rest/services/CalTrans_Camera_276_0225_1205_PolyAgg7/FeatureServer/0',
    //     '/2026-03-05/22'
    //   ).then(data => console.log(data.features));
    // }
  }

  init();
})();
