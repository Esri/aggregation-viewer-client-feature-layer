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

  // CloudFront URL — fetched from the server's /api/config endpoint at startup.
  // When set, video files are loaded directly via CloudFront (no signing needed).
  // When empty, the backend /api/playlist and /api/sign endpoints are used instead.
  let cloudfrontUrl = '';

  let hls = null;

  let feature_layer_url = 'https://us6-iotdev.arcgis.com/dedicated/9ltepoauoaon0okn/maps/arcgis/rest/services/CalTrans_Camera_276_0225_1205_PolyAgg7/FeatureServer/0'

  // Video-to-feature sync parameters
  var videoSegmentLength = 6;   // seconds per .ts segment
  var framesPerSecond = 15;     // detection frames per second
  var videoPlaySpeed = 1;       // video playback speed multiplier (e.g. 2 = 2x faster)
  var metadataRollDelay = 1;    // seconds to wait before starting metadata rolling (gives video time to load)

  // ------------------------------------------------------------------
  // Panel toggle helpers
  // ------------------------------------------------------------------
  function updatePanelPositions() {
    if (!videoPlayerPanel || !mediaStorePanel) return;
    // Video Player sits to the right of Media Store
    let videoLeft;
    if (mediaStorePanel.classList.contains('section-hidden')) {
      videoLeft = mediaStorePanel.offsetWidth + 20;
    } else {
      videoLeft = 340;
    }
    videoPlayerPanel.style.left = videoLeft + 'px';

    // Features panel sits to the right of Video Player
    if (featuresPanel) {
      let featuresLeft;
      if (videoPlayerPanel.classList.contains('section-hidden')) {
        featuresLeft = videoLeft + videoPlayerPanel.offsetWidth + 10;
      } else {
        featuresLeft = videoLeft + 325;
      }
      featuresPanel.style.left = featuresLeft + 'px';
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

    var segMatch = key.match(/segment(\d+)\.ts$/);
    if (!segMatch || !window.appendFeature) return;

    var segNum = parseInt(segMatch[1], 10);
    var featuresPerSegment = videoSegmentLength * framesPerSecond;
    var start = segNum * featuresPerSegment;
    var end = start + featuresPerSegment;
    console.log("Segment " + segNum + ": rolling features " + start + ":" + end);

    // Clear table and start fresh for this segment
    if (window.clearFeaturesTable) window.clearFeaturesTable();

    // Base interval between each feature row (ms) at 1x speed
    var baseIntervalMs = (videoSegmentLength / (end - start)) * 1000;

    rollState = {
      start: start,
      end: end,
      currentIndex: start,
      baseIntervalMs: baseIntervalMs
    };

    // Delay the start of rolling to give the video player time to load
    featureRollTimer = setTimeout(function () {
      if (!rollState) return;
      window.appendFeature(rollState.currentIndex);
      rollState.currentIndex++;
      scheduleNextFeature();
    }, metadataRollDelay * 1000);
  }

  function scheduleNextFeature() {
    if (!rollState || rollState.currentIndex >= rollState.end) {
      featureRollTimer = null;
      return;
    }
    // Adjust interval by the videoPlaySpeed multiplier
    var adjustedMs = rollState.baseIntervalMs / videoPlaySpeed;

    featureRollTimer = setTimeout(function () {
      if (!rollState || rollState.currentIndex >= rollState.end) {
        featureRollTimer = null;
        return;
      }
      window.appendFeature(rollState.currentIndex);
      rollState.currentIndex++;
      scheduleNextFeature();
    }, adjustedMs);
  }

  function stopFeatureRoll() {
    if (featureRollTimer) {
      clearTimeout(featureRollTimer);
      featureRollTimer = null;
    }
  }

  // Pause rolling when video is paused; resume when played
  if (video) {
    video.addEventListener('pause', function () {
      stopFeatureRoll();
    });
    video.addEventListener('play', function () {
      // Resume rolling if there are remaining features
      if (rollState && rollState.currentIndex < rollState.end && !featureRollTimer) {
        scheduleNextFeature();
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
      // query the feature layer for detections in that date/hour.
      const hourLevelMatch = prefix.match(/^media-store\/video-hls\/[^/]+\/([^/]+\/[^/]+)\/$/);
      if (hourLevelMatch && window.queryFeatures) {
        const frameImageSubstring = hourLevelMatch[1] + "-";
        console.log("Hour-level folder detected, querying features with:", frameImageSubstring);
        window.queryFeatures(feature_layer_url, frameImageSubstring);
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
