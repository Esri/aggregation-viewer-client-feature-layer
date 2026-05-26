    require([
      "dojo/parser",
      "dojo/dom",
      "dojo/dom-style",
      "dojo/dom-class",
      "dojo/on",
      "dojo/json",
      "dojo/_base/array",
      "dojo/query",
      "dojo/number",

      "esri/map",
      "esri/graphic",
      "esri/SpatialReference",
      "esri/Color",
      "esri/request",
      "esri/geometry/webMercatorUtils",
      "esri/geometry/Extent",
      "esri/tasks/GeometryService",
      "esri/InfoTemplate",
      "esri/TimeExtent",
      "esri/graphicsUtils",

      "esri/IdentityManager",

      "esri/layers/FeatureLayer",
      "esri/layers/GraphicsLayer",
      "esri/layers/LabelClass",
      "esri/layers/ArcGISDynamicMapServiceLayer",
      "esri/layers/ArcGISTiledMapServiceLayer",

      "esri/symbols/SimpleLineSymbol",
      "esri/symbols/SimpleFillSymbol",
      "esri/symbols/TextSymbol",
      "esri/symbols/PictureMarkerSymbol",
      "esri/geometry/Point",
      "esri/geometry/Polygon",

      "esri/dijit/TimeSlider",

      "esri/renderers/HeatmapRenderer",
      "esri/renderers/ClassBreaksRenderer",
      "esri/renderers/SimpleRenderer",

      "dijit/layout/BorderContainer",
      "dijit/layout/ContentPane",
      "dijit/TitlePane",
      "dijit/TooltipDialog",
      "dijit/form/DropDownButton",
      "dijit/form/Select",

      "dojo/query!css2",
      "dojo/domReady!"
    ], function (
      parser, dom, domStyle, domClass, on, JSON, array, domQuery, number,
      Map, Graphic, SpatialReference, Color, esriRequest, webMercatorUtils, Extent, GeometryService, InfoTemplate, TimeExtent, graphicsUtils,
      IdentityManager,
      FeatureLayer, GraphicsLayer, LabelClass, ArcGISDynamicMapServiceLayer, ArcGISTiledMapServiceLayer,
      SimpleLineSymbol, SimpleFillSymbol, TextSymbol, PictureMarkerSymbol, Point, Polygon,
      TimeSlider,
      HeatmapRenderer, ClassBreaksRenderer, SimpleRenderer,
      BorderContainer, ContentPane, TitlePane, TooltipDialog, DropDownButton, Select) {

      parser.parse();

      // Fetch available FeatureServer services after user logs in
      IdentityManager.on("credential-create", function () {
        if (typeof fetchFeatureServices === "function") {
          fetchFeatureServices();
        }
      });

      // ### global variables ###
      let _map;
      let _layerTimeExtent;
      let _replay = false;
      let _live = false;
      let _startTimeSlider = true;
      let _minValue;
      let _maxValue;
      let _ignoreChangeEvent = false;
      let _layerInfo;
      let _timeSlider;
      const _binRendererProps = {};
      let _polygonalAggInfos = null;
      let _cachedLinkedLayerUri = null;
      let _cachedLinkedFeatures = null;
      let _polyAggAutoRefresh = false;
      let _polyAggPolygonRefreshInterval = null;
      let _polyAggLabelRefreshInterval = null;
      let _polyAggContext = null;
      let _lodAutoRefresh = false;
      let _lodRefreshInterval = null;
      
      // ### Spatial Reference variables ###
      // These variables manage coordinate system transformations and spatial reference handling
      const _defaultWkid = 102100; // Web Mercator - default coordinate system
      let _wkid = 102100;         // Current working coordinate system ID
      let _currentMapSR = 102100; // Current map spatial reference system
      
      // ### Geometry Service for spatial reference transformations ###
      const _gs = new GeometryService("https://utility.arcgisonline.com/arcgis/rest/services/Geometry/GeometryServer");

      // Define _isBasemapTiled with a default value
      let _isBasemapTiled = true; // Set to true if tiled basemaps are the default, otherwise false

      // ### Feature service discovery ###
      var SERVICES_URL = "https://us6-iotdev.arcgis.com/dedicated/9ltepoauoaon0okn/maps/arcgis/rest/services";
      var featureServices = [];

      //#############################################################################################
      // Map Related functions
      //#############################################################################################

      esri.config.defaults.io.corsEnabledServers.push('http://storm.esri.com');
      esri.config.defaults.io.corsEnabledServers.push('http://storm.esri.com:6080');
      esri.config.defaults.io.corsEnabledServers.push('https://storm.esri.com:6443');
      esri.config.defaults.io.corsEnabledServers.push('http://localhost:9000');

      // ### Initialize map with default extent ###
      const initMapExtent = new Extent({
        "xmin": -20037508.342787,
        "ymin": -20037508.342787,
        "xmax": 20037508.342787,
        "ymax": 20037508.342787,
        "spatialReference": {"wkid": _defaultWkid}
      });

      // Build initial map with the default extent
      buildMap(initMapExtent);


      /**
       * Builds or rebuilds the map with the specified extent and current spatial reference
       * This function destroys any existing map and creates a new one with proper spatial reference
       * @param {Extent} mapExtent - The extent to set for the new map
       */
      function buildMap(mapExtent) {

        if (_map) {
          // Destroy existing map if it exists
          _map.removeAllLayers();
          _map.destroy();
          _map = null;
          console.log("Destroyed previous map instance for spatial reference change");
        }

        // Create new map with the specified extent
        _map = new Map("map", {
          wrapAround180: true,
          extent: mapExtent,
          showLabels: true,
          showAttribution: false,
          sliderStyle: "small"
        });

        _map.on("load", function () {
          console.log("Map loaded successfully.");
          setFeatureLayers();
          fetchFeatureServices();
          addCameraFovLayer();
          addCameraLayer();
        });

        // Attach extent change handler
        attachMapExtentChangeHandler();

        // Add the basemap. Use the tiled layer only when the map SR is Web Mercator
        // (wkid 102100) — that's the only SR the arcgisonline tile services publish in,
        // and only deterministic /tile/{z}/{y}/{x} URLs are browser-cacheable. For any
        // other SR fall back to the dynamic export layer (uncached, but reprojected).
        const basemapUrl = dom.byId("basemapUrl").value;
        const mapWkid = mapExtent && mapExtent.spatialReference
          ? mapExtent.spatialReference.wkid
          : _wkid;
        _isBasemapTiled = (mapWkid === 102100);

        let basemapLayer;
        if (_isBasemapTiled) {
          basemapLayer = new ArcGISTiledMapServiceLayer(basemapUrl, {
            id: "basemap",
            showAttribution: false,
            opacity: 1.0
          });
        } else {
          basemapLayer = new ArcGISDynamicMapServiceLayer(basemapUrl, {
            id: "basemap",
            showAttribution: false,
            opacity: 1.0
          });
        }
        _map.addLayers([basemapLayer]);
      }

      /**
       * Issue new query on extent-change if live mode is disabled ###
       * Note: This event handler will be re-attached when map is rebuilt
       */
       function attachMapExtentChangeHandler() {
        _map.on("extent-change", function (evt) {
          if (_map.getLayer("aggregations") && !_ignoreChangeEvent && !_live) {
            updateLayerFromUIChange();
          }
        });
      }

      //#############################################################################################
      // UI Related functions
      //#############################################################################################

      /*
       * DRY: Reusable section toggle function
       * This function creates a toggle handler for a section based on its ID and visibility state
       * @param {string} sectionId - The ID of the section to toggle
       * @param {string} toggleId - The ID of the toggle button
       * @param {Object} visibilityVar - An object to track the visibility state of the section
       */
      function createSectionToggle(sectionId, toggleId, visibilityVar) {
        return function () {
          // toggle section visibility
          if (visibilityVar.value) {
            domClass.add(dojo.byId(sectionId), "section-hidden");
            domClass.replace(domQuery("#" + toggleId + " i")[0], "fa-chevron-down", "fa-chevron-up");
          } else {
            domClass.remove(dojo.byId(sectionId), "section-hidden");
            domClass.replace(domQuery("#" + toggleId + " i")[0], "fa-chevron-up", "fa-chevron-down");
          }
          visibilityVar.value = !visibilityVar.value;
        };
      }

      // ### Section visibility state objects ###
      const layersVisibility = { value: true };
      const polyAggSettingsVisibility = { value: true };
      const polyAggLabelVisibility = { value: true };
      const aggSettingsVisibility = { value: true };
      const aggStyleVisibility = { value: false };
      const aggBinsVisibility = { value: true };
      const streamingModeVisibility = { value: true };
      const aggLabelsVisibility = { value: true };

      //#############################################################################################
      // ### UI Event Listeners ###
      //#############################################################################################

      // ### Section toggle event handlers ###
      on(dojo.byId("layersToggle"), "click", createSectionToggle("layersSection", "layersToggle", layersVisibility));
      on(dojo.byId("aggSettingsToggle"), "click", createSectionToggle("aggSettingsSection", "aggSettingsToggle", aggSettingsVisibility));
      on(dojo.byId("aggStyleToggle"), "click", createSectionToggle("aggStyleSection", "aggStyleToggle", aggStyleVisibility));
      on(dojo.byId("aggBinsToggle"), "click", createSectionToggle("aggBinsSection", "aggBinsToggle", aggBinsVisibility));
      on(dojo.byId("streamingModeToggle"), "click", createSectionToggle("streamingModeSection", "streamingModeToggle", streamingModeVisibility));
      on(dojo.byId("polyAggSettingsToggle"), "click", createSectionToggle("polyAggSettingsSection", "polyAggSettingsToggle", polyAggSettingsVisibility));
      on(dojo.byId("polyAggLabelToggle"), "click", createSectionToggle("polyAggLabelSection", "polyAggLabelToggle", polyAggLabelVisibility));

      // Video Layer panel toggle (floating panel behind #controls)
      on(dojo.byId("videoLayerToggle"), "click", function (e) {
        e.preventDefault();
        var panel = dojo.byId("video-layer-panel");
        if (!panel) return;
        var isHidden = domClass.toggle(panel, "section-hidden");
        var icon = domQuery("#videoLayerToggle i")[0];
        if (icon) {
          domClass.replace(icon, isHidden ? "fa-chevron-down" : "fa-chevron-up", isHidden ? "fa-chevron-up" : "fa-chevron-down");
        }
      });
      // Video Panels section toggle
      const videoPanelsVisibility = { value: true };
      on(dojo.byId("videoPanelsToggle"), "click", createSectionToggle("videoPanelsSection", "videoPanelsToggle", videoPanelsVisibility));

      // Video panel checkbox toggles
      var panelCheckboxMap = [
        { checkbox: "toggleMediaStore",    panel: "media-store-panel" },
        { checkbox: "toggleVideoPlayer",   panel: "video-player-panel" },
        { checkbox: "toggleMetadataLayer", panel: "features-panel" },
        { checkbox: "toggleVideoLayer",    panel: "video-layer-panel" }
      ];
      var toggleAllCheckbox = dojo.byId("toggleAllPanels");

      panelCheckboxMap.forEach(function (entry) {
        on(dojo.byId(entry.checkbox), "change", function () {
          var panel = dojo.byId(entry.panel);
          if (!panel) return;
          panel.style.display = this.checked ? "" : "none";
          // Update "Toggle All" to reflect individual states
          var allChecked = panelCheckboxMap.every(function (e) {
            return dojo.byId(e.checkbox).checked;
          });
          toggleAllCheckbox.checked = allChecked;
        });
      });

      // Toggle All checkbox controls all four panels
      on(toggleAllCheckbox, "change", function () {
        var checked = this.checked;
        panelCheckboxMap.forEach(function (entry) {
          var cb = dojo.byId(entry.checkbox);
          var panel = dojo.byId(entry.panel);
          cb.checked = checked;
          if (panel) panel.style.display = checked ? "" : "none";
        });
      });

      on(dojo.byId("applyPolyAggButton"), "click", applyPolygonalAggregation);
      on(dojo.byId("polyAggAutoRefresh"), "change", function () {
        if (!this.checked) {
          clearTimeout(_polyAggPolygonRefreshInterval);
          clearTimeout(_polyAggLabelRefreshInterval);
          _polyAggAutoRefresh = false;
        }
      });
      on(dojo.byId("lodAutoRefresh"), "change", function () {
        if (!this.checked) {
          clearTimeout(_lodRefreshInterval);
          _lodAutoRefresh = false;
        } else {
          _lodAutoRefresh = true;
          updateLayerFromUIChange();
        }
      });
      on(dojo.byId("aggLabelsToggle"), "click", createSectionToggle("aggLabelsMainSection", "aggLabelsToggle", aggLabelsVisibility));

      on(dojo.byId("setLayerButton"), "click", setFeatureLayers);
      on(dojo.byId("refreshFeatureLayersButton"), "click", fetchFeatureServices);
      on(dojo.byId("heatmap"), "change", toggleHeatmap);
      on(dojo.byId("refreshMode"), "change", toggleMode);
      on(dojo.byId("autoOffSet"), "change", toggleRefresh);
      on(dojo.byId("lodType"), "change", function () {
        updateLodLevelDropdown();
        toggleRefresh();
      });
      on(dojo.byId("lodGeometryAggregationType"), "change", toggleRefresh);
      on(dojo.byId("lod"), "change", toggleRefresh);
      on(dojo.byId("blurRadius"), "change", toggleRefresh);
      on(dom.byId("useStats"), "change", toggleStats);

      on(dijit.byId("statField"), "change", statFieldChanged);
      on(dijit.byId("statType"), "change", updateLayerFromUIChange);
      
      // ### Spatial Reference event handlers ###
      on(dijit.byId("spatialReferenceSelect"), "change", onSpatialReferenceChange);

      // ### Aggregation Renderer event handlers ###
      on(dojo.byId("useAggregationRenderer"), "change", toggleUseAggregationRenderer);
      on(dojo.byId("minColor"), "change", updateRendererFromUI);
      on(dojo.byId("maxColor"), "change", updateRendererFromUI);
      on(dojo.byId("minColorA"), "change", updateRendererFromUI);
      on(dojo.byId("maxColorA"), "change", updateRendererFromUI);
      on(dojo.byId("minOutlineColor"), "change", updateRendererFromUI);
      on(dojo.byId("maxOutlineColor"), "change", updateRendererFromUI);
      on(dojo.byId("minOutlineColorA"), "change", updateRendererFromUI);
      on(dojo.byId("maxOutlineColorA"), "change", updateRendererFromUI);
      on(dojo.byId("minOutlineWidth"), "change", updateRendererFromUI);
      on(dojo.byId("maxOutlineWidth"), "change", updateRendererFromUI);
      on(dojo.byId("minSize"), "change", updateRendererFromUI);
      on(dojo.byId("maxSize"), "change", updateRendererFromUI);
      on(dojo.byId("minValue"), "change", updateRendererFromUI);
      on(dojo.byId("maxValue"), "change", updateRendererFromUI);
      on(dojo.byId("classBreaksCount"), "change", updateRendererFromUI);

      // ### Aggregation Labels event handlers ###
      on(dojo.byId("renderLabels"), "change", updateRendererFromUI);
      on(dijit.byId("labelFont"), "change", updateRendererFromUI);
      on(dijit.byId("labelStyle"), "change", updateRendererFromUI);
      on(dijit.byId("labelWeight"), "change", updateRendererFromUI);
      on(dojo.byId("labelSize"), "change", updateRendererFromUI);
      on(dojo.byId("labelColor"), "change", updateRendererFromUI);
      on(dojo.byId("labelOpacity"), "change", updateRendererFromUI);
      
      // ### LOD SR event handlers ###
      on(dijit.byId("lodSR"), "change", updateLayerFromUIChange);
      on(dojo.byId("useLodSR"), "change", updateLayerFromUIChange);

      on(document.getElementsByClassName("collapser")[0], "click", togglePanel);

      /**
       * Shows a tooltip with the current value of the input field
       * This function is called when the mouse enters the input field
       */
      on(dom.byId("inputUrl"), "mouseenter", function() {
        this.title = this.value || "No value entered";
      });

      /**
       * Clears the tooltip when the mouse leaves the input field
       * This function is called when the mouse leaves the input field
       */
      on(dom.byId("inputUrl"), "mouseleave", function() {
        this.title = "";
      });


      // ------------------------------------------------------------------
      // LOD label mapping: camelCase value → human-readable label
      // ------------------------------------------------------------------
      const LOD_TYPE_LABELS = {
        geohash: "GeoHash",
        geotile: "GeoTile",
        h3: "H3",
        square: "Square",
        flatHexagon: "Flat Hexagon",
        pointyHexagon: "Pointy Hexagon",
        flatTriangle: "Flat Triangle",
        pointyTriangle: "Pointy Triangle"
      };

      const LOD_GEOMETRY_LABELS = {
        centroid: "Centroid",
        shape: "Shape"
      };

      // Paired LOD types: if one exists, add its pair
      const LOD_TYPE_PAIRS = {
        pointyTriangle: "pointyHexagon",
        flatTriangle: "flatHexagon"
      };

      // Store the full lodInfos array so we can update LOD levels when lodType changes
      let _lodInfos = [];

      /**
       * Fetches LOD info from the feature service /lod endpoint and
       * dynamically populates the LOD Type, Geometry, and LOD level dropdowns.
       */
      function fetchLodInfo(featureServiceUrl) {
        const url = featureServiceUrl + "/lod?f=json";
        const request = esriRequest({
          url: url,
          handleAs: "json",
          callbackParamName: "callback"
        });
        request.then(function (response) {
          console.log("LOD info:", response);
          const lodInfos = response.lodInfos || [];
          _lodInfos = lodInfos;

          // --- Build LOD Type dropdown ---
          const lodTypeSelect = dojo.byId("lodType");
          const previousLodType = lodTypeSelect.value;
          lodTypeSelect.innerHTML = "";

          const lodTypes = [];
          const extraTypes = new Set();

          lodInfos.forEach(function (info) {
            const t = info.lodType;
            if (lodTypes.indexOf(t) === -1) {
              lodTypes.push(t);
            }
            // If pointyTriangle exists, also add pointyHexagon (and vice-versa pattern)
            if (LOD_TYPE_PAIRS[t] && lodTypes.indexOf(LOD_TYPE_PAIRS[t]) === -1) {
              extraTypes.add(LOD_TYPE_PAIRS[t]);
            }
          });

          // Add paired types that weren't already present
          extraTypes.forEach(function (t) {
            if (lodTypes.indexOf(t) === -1) {
              lodTypes.push(t);
            }
          });

          lodTypes.forEach(function (t) {
            const opt = document.createElement("option");
            opt.value = t;
            opt.textContent = LOD_TYPE_LABELS[t] || t;
            lodTypeSelect.appendChild(opt);
          });

          // Restore previous selection if still available, otherwise select first
          if (lodTypes.indexOf(previousLodType) !== -1) {
            lodTypeSelect.value = previousLodType;
          }

          // --- Build Geometry dropdown ---
          const geomSelect = dojo.byId("lodGeometryAggregationType");
          const previousGeom = geomSelect.value;
          geomSelect.innerHTML = "";

          const geomTypes = [];
          lodInfos.forEach(function (info) {
            const g = info.lodGeometryAggregationType;
            if (geomTypes.indexOf(g) === -1) {
              geomTypes.push(g);
            }
          });

          geomTypes.forEach(function (g) {
            const opt = document.createElement("option");
            opt.value = g;
            opt.textContent = LOD_GEOMETRY_LABELS[g] || g;
            geomSelect.appendChild(opt);
          });

          if (geomTypes.indexOf(previousGeom) !== -1) {
            geomSelect.value = previousGeom;
          }

          // --- Build LOD level dropdown based on selected LOD type ---
          updateLodLevelDropdown();

        }, function (error) {
          console.error("Failed to fetch LOD info:", error);
        });
      }

      /**
       * Updates the LOD level dropdown based on the currently selected LOD type.
       * Reads min/max from the matching lodInfo entry in _lodInfos.
       */
      function updateLodLevelDropdown() {
        const lodTypeSelect = dojo.byId("lodType");
        const lodSelect = dojo.byId("lod");
        const selectedType = lodTypeSelect.value;

        // Find the matching lodInfo for the selected type
        var matchingInfo = null;
        for (var i = 0; i < _lodInfos.length; i++) {
          if (_lodInfos[i].lodType === selectedType) {
            matchingInfo = _lodInfos[i];
            break;
          }
        }

        if (!matchingInfo || !matchingInfo.levels) {
          return; // Keep existing options if no match found
        }

        var min = matchingInfo.levels.min;
        var max = matchingInfo.levels.max;

        lodSelect.innerHTML = "";
        for (var lvl = min; lvl <= max; lvl++) {
          var opt = document.createElement("option");
          opt.value = lvl;
          opt.textContent = lvl;
          lodSelect.appendChild(opt);
        }

        // Default LOD level per type; fall back to midpoint
        var defaultLevels = { pointyHexagon: 18, square: 17 };
        var defaultLevel = defaultLevels[selectedType] || Math.round((min + max) / 2);
        // Clamp to valid range
        defaultLevel = Math.max(min, Math.min(max, defaultLevel));
        lodSelect.value = String(defaultLevel);
      }

      /**
       * Updates the feature layers based on the current UI settings
       * This function is called when the user clicks the "Set Layer" button
       */
      function setFeatureLayers() {

        // Remove existing feature layers
        const existingAggregationLayer = _map.getLayer("aggregations");
        if (existingAggregationLayer) {
          _map.removeLayer(existingAggregationLayer);
        } else {
          console.log("Aggregation layer not found.");
        }

        const heatmapLayer = _map.getLayer("heatmap");
        if (heatmapLayer) {
          _map.removeLayer(heatmapLayer);
        } else {
          console.log("Heatmap layer not found.");
        }

        // Fetch LOD info to populate dropdowns dynamically
        fetchLodInfo(dojo.byId("inputUrl").value);

        // Auto-fetch polygonal aggregation metadata for the new layer
        fetchPolygonalAggMetadata();

        const newAggregationLayer = addAggregationsLayer();
        newAggregationLayer.on("load", function () {
          queryLayerTimeExtent();
          addHeatmapLayer();
          updateLayerFromUIChange(true);
        });
      }

      /**
       * Adds the corridor 197–276 camera FOV polygon feature layer to the map.
       * Renders each polygon with a transparent fill and a 2-pt dashed orange outline.
       */
      function addCameraFovLayer() {
        // "https://services.arcgis.com/hRUr1F8lE8Jq2uJo/arcgis/rest/services/corridor_camera_fov_197_to_276/FeatureServer/0";
        // const fovLayerUrl = "https://services.arcgis.com/hRUr1F8lE8Jq2uJo/arcgis/rest/services/camera_197_to_276_fov_1/FeatureServer/0";
        const fovLayerUrl = "https://services.arcgis.com/hRUr1F8lE8Jq2uJo/ArcGIS/rest/services/camera_187_276_viewsheds_100m/FeatureServer/0"
        const existing = _map.getLayer("cameraFovLayer");
        if (existing) {
          _map.removeLayer(existing);
        }

        const orange = new Color([255, 140, 0, 1]);
        const fovOutline = new SimpleLineSymbol(SimpleLineSymbol.STYLE_DASH, orange, 2);
        const fovFill = new SimpleFillSymbol(SimpleFillSymbol.STYLE_NULL, fovOutline, new Color([0, 0, 0, 0]));

        const fovLayer = new FeatureLayer(fovLayerUrl, {
          id: "cameraFovLayer",
          outFields: ["*"],
          mode: FeatureLayer.MODE_ONDEMAND
        });
        fovLayer.setRenderer(new SimpleRenderer(fovFill));
        fovLayer.setMinScale(0);
        fovLayer.setMaxScale(0);

        fovLayer.on("error", function (err) {
          console.log("Camera FOV layer load error: " + (err && err.error && err.error.message));
        });

        _map.addLayer(fovLayer);
        console.log("Camera FOV layer added: " + fovLayerUrl);
      }

      /**
       * Adds the corridor 197–276 cameras point feature layer to the map.
       * Renders each point with an inline SVG traffic-camera symbol and labels
       * the points with the "Alias" field.
       */
      function addCameraLayer() {
        const cameraLayerUrl = "https://services.arcgis.com/hRUr1F8lE8Jq2uJo/arcgis/rest/services/corridor_197_to_276_cameras/FeatureServer/0";

        // Remove any previously added camera layer (e.g., after SR change rebuilds the map)
        const existing = _map.getLayer("cameraLayer");
        if (existing) {
          _map.removeLayer(existing);
        }

        const cameraSvg =
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
          '<rect x="3" y="9" width="18" height="14" rx="2" fill="#FF8C00" stroke="white" stroke-width="2"/>' +
          '<polygon points="21,12 29,8 29,24 21,20" fill="#FF8C00" stroke="white" stroke-width="2"/>' +
          '<circle cx="10" cy="16" r="3.5" fill="white"/>' +
          '<circle cx="10" cy="16" r="1.5" fill="#FF8C00"/>' +
          '</svg>';
        const cameraDataUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(cameraSvg);
        const cameraSymbol = new PictureMarkerSymbol(cameraDataUri, 32, 32);

        const aliasTextSymbol = new TextSymbol().setColor(new Color([0, 0, 0, 1]));
        aliasTextSymbol.font.setFamily("arial");
        // aliasTextSymbol.font.setSize("12pt");
        aliasTextSymbol.font.setSize("9pt");
        aliasTextSymbol.font.setWeight("bold");
        aliasTextSymbol.setHaloColor(new Color([255, 255, 255, 1]));
        aliasTextSymbol.setHaloSize(2);
        aliasTextSymbol.setAlign("center");
        aliasTextSymbol.setVerticalAlignment("top");
        aliasTextSymbol.setOffset(0, 0);

        const aliasLabelClass = new LabelClass({
          labelExpressionInfo: { value: "{alias}" },
          labelPlacement: "below-center"
        });
        aliasLabelClass.symbol = aliasTextSymbol;

        const cameraLayer = new FeatureLayer(cameraLayerUrl, {
          id: "cameraLayer",
          outFields: ["alias"],
          showLabels: true,
          mode: FeatureLayer.MODE_ONDEMAND
        });
        cameraLayer.setRenderer(new SimpleRenderer(cameraSymbol));
        cameraLayer.setLabelingInfo([aliasLabelClass]);
        cameraLayer.setMinScale(0);
        cameraLayer.setMaxScale(0);

        cameraLayer.on("error", function (err) {
          console.log("Camera layer load error: " + (err && err.error && err.error.message));
        });

        _map.addLayer(cameraLayer);
        console.log("Camera layer added: " + cameraLayerUrl);
      }

      /**
       * Toggles the visibility of the panel by adding or removing a CSS class
       * This function is used to collapse or expand the panel
       */
      function togglePanel() {
        domClass.toggle(document.getElementsByTagName("body")[0], "panel-collapsed");
      }

      // ### Switch change functions ###

      /*
       * Toggles the map interaction mode between manual, live, and replay
       * This function is called when the mode switch is changed
       */
      function toggleMode(evt) {
        if (evt.target.value === "manual") {
          _live = false;
          _replay = false;
          domStyle.set(dom.byId('timeSlider'), "display", 'none');
          _map.setTimeSlider(null);
          _map.setTimeExtent(null);
          updateLayerFromUIChange();
        } else if (evt.target.value === "live") {
          _live = true;
          _replay = false;
          autoUpdate();
          domStyle.set(dom.byId('timeSlider'), "display", 'none');
          _map.setTimeSlider(null);
          _map.setTimeExtent(null);
        } else if (evt.target.value === "replay") {
          _live = false;
          _replay = true;
          if (_startTimeSlider) {
            initTimeSlider();
            _startTimeSlider = false;
          } else {
            _ignoreChangeEvent = true;
            updateTimeSlider();
          }
          domStyle.set(dom.byId('timeSlider'), "display", 'block');
        }
      }

      /**
       * Toggles the heatmap layer on and off
       * This function is called when the heatmap toggle is changed
       */
      function toggleHeatmap(evt) {
        if (dojo.byId("heatmap").checked === true) {
          dojo.byId("radius").style.display = "inherit";
          const layer = _map.getLayer("heatmap");
          const minIsFinit = isFinite(_minValue);
          const maxIsFinit = isFinite(_maxValue);
          if (!minIsFinit) {
            _minValue = 0;
          }
          if (!maxIsFinit) {
            _maxValue = 1;
          }
          layer.renderer.setMinPixelIntensity(_minValue);
          layer.renderer.setMaxPixelIntensity(_maxValue);
        } else {
          dojo.byId("radius").style.display = "none";
        }
        updateLayerFromUIChange();
      }

      /**
       * Toggles the refresh of the layer
       * This function is called when the refresh toggle is changed
       */
      function toggleRefresh(evt) {
        if (!_live) {
          updateLayerFromUIChange();
        }
      }

      /**
       * Toggles the use of the aggregation renderer
       * This function is called when the useAggregationRenderer toggle is changed
       */
      function toggleStats(evt) {
        if (evt.target.id === "useStats") {
          if (dojo.byId("useStats").checked === true) {
            dojo.byId("statField").style.display = "block";
            dojo.byId("statType").style.display = "block";
          } else {
            dojo.byId("statField").style.display = "none";
            dojo.byId("statType").style.display = "none";
          }
          updateLayerFromUIChange();
        }
      }

      /**
       * Handles changes to the selected statistical field
       * This function is called when the statistical field dropdown is changed
       */
      function statFieldChanged(val) {
        const control = dijit.byId('statField');
        const selectedOption = control.getOptions(val);
        populateStatTypeSelectOptions(selectedOption);
        updateLayerFromUIChange();
      }

      //#############################################################################################
      // ### Spatial Reference Functions ###
      //#############################################################################################

      /**
       * Handles spatial reference system changes from the dropdown
       * Updates global variables and re-projects map if necessary
       * @param {string|number} newWkid - The new spatial reference WKID
       */
      function onSpatialReferenceChange(newWkid) {
        _wkid = parseInt(newWkid);

        // Check if the map's current spatial reference matches the new one
        if (_map && _map.spatialReference && _wkid === _map.spatialReference.wkid) {
          return; // No need to rebuild the map
        }

        // Update the current map spatial reference
        _currentMapSR = _wkid;

        // Project the map's current extent to the new spatial reference
        projectMapToSR(_wkid);
      }

      /**
       * Projects the current map extent to a new spatial reference system using geometry service
       * @param {number} wkid - The target spatial reference WKID
       */
      function projectMapToSR(wkid) {
        const sr = new SpatialReference(wkid);
        const project = _gs.project([_map.extent], sr);
        project.then(function (result) {
          if (result.length) {
            const newMapExtent = result[0];
            buildMap(newMapExtent); // Rebuild the map with the new extent
          } else {
            console.log("Projection was successful, but no results were returned.");
          }
        }, function (err) {
          console.log("Project Map to SR failed: ", err);
          // Fallback: build map with default extent for the new spatial reference
          const defaultExtent = new Extent({
            "xmin": -20037508.342787,
            "ymin": -20037508.342787,
            "xmax": 20037508.342787,
            "ymax": 20037508.342787,
            "spatialReference": { "wkid": wkid }
          });
          buildMap(defaultExtent);
        });
      }

      /**
       * Fetches a feature layer's metadata and zooms the map to its extent.
       * If the layer's extent is in a different spatial reference than the map,
       * projects it to the map SR first using GeometryService.
       */
      function zoomToLayerExtent(layerUrl) {
        if (!layerUrl || !_map) return;

        esriRequest({
          url: layerUrl,
          content: { f: "json" },
          handleAs: "json",
          callbackParamName: "callback"
        }).then(function (response) {
          if (!response || !response.extent) {
            console.log("zoomToLayerExtent: layer has no extent metadata");
            return;
          }
          var ext = response.extent;
          if (ext.xmin == null || ext.xmax == null ||
              ext.xmin === ext.xmax || ext.ymin === ext.ymax) {
            console.log("zoomToLayerExtent: degenerate extent, skipping zoom");
            return;
          }

          var layerExtent = new Extent({
            xmin: ext.xmin, ymin: ext.ymin,
            xmax: ext.xmax, ymax: ext.ymax,
            spatialReference: ext.spatialReference
          });

          var layerWkid = ext.spatialReference.wkid || ext.spatialReference.latestWkid;
          var mapWkid = _map.spatialReference.wkid;
          // 102100 and 3857 are both Web Mercator — treat as equivalent
          var sameSR = layerWkid === mapWkid ||
                       (layerWkid === 102100 && mapWkid === 3857) ||
                       (layerWkid === 3857 && mapWkid === 102100);

          if (sameSR) {
            _map.setExtent(layerExtent, true);
          } else {
            _gs.project([layerExtent], _map.spatialReference).then(function (results) {
              if (results && results.length > 0) {
                _map.setExtent(results[0], true);
              }
            }, function (err) {
              console.log("zoomToLayerExtent: project to map SR failed:", err);
            });
          }
        }, function (err) {
          console.log("zoomToLayerExtent: failed to fetch layer metadata:", err);
        });
      }


      //#############################################################################################      
      // ### Aggregation Labels Functions ###
      //#############################################################################################

      /**
       * Populates the statistical type select options based on the selected field
       * @param {Object} selectedOption - The selected field option
       */
      function populateStatTypeSelectOptions(selectedOption) {
        const statTypeSelect = dijit.byId("statType");

        // clear statTypeSelect
        statTypeSelect.removeOption(statTypeSelect.getOptions());

        // find the field by name
        const statFieldElement = dijit.byId("statField");
        if (!statFieldElement) {
          console.warn("Element with ID 'statField' not found.");
          return;
        }
        const fieldName = statFieldElement.value;
        let field = null;
        for (let i = 0; i < _layerInfo.fields.length; i++) {
          const currentField = _layerInfo.fields[i];
          if (currentField.name === fieldName)
            field = currentField;
        }

        if (isFieldNumeric(field)) {
          // add all types
          const options = [ {'label':'Average', 'value':'avg'},
                          {'label':'Maximum', 'value':'max'},
                          {'label':'Minimum', 'value':'min'},
                          {'label':'Standard Deviation', 'value':'stddev'},
                          {'label':'Sum', 'value':'sum'},
                          {'label':'Variance', 'value':'var'},
                          {'label':'Count Distinct', 'value':'countdistinct'},
                          {'label':'Count', 'value':'count'} ];
          statTypeSelect.addOption(options);
        } else {
          // add only the count and count distinct types
          const options = [ {'label':'Count Distinct', 'value':'countdistinct'},
                          {'label':'Count', 'value':'count'} ];
          statTypeSelect.addOption(options);
        }

        updateLayerFromUIChange();
      }

      function getLayerInfo() {
        const url = dojo.byId("inputUrl").value;
        const mapServiceInfoDeferred = esri.request({
          url: url,
          content: {
            f: 'json'
          },
          callbackParamName: "callback"
        });
        mapServiceInfoDeferred.then(function (response) {
              _layerInfo = response;
              populateDijitSelectWithLayerFields(dijit.byId('statField'), false);
              statFieldChanged(dijit.byId('statField').value); // to init-populate the stat types control
              populateUniqueValueFieldDropdown();
            }
        );
      }



      /**
       * Fetches polygonal aggregation metadata from the polygonalAgg endpoint
       * and populates the Type and Field dropdowns from the response.
       * URL format: {featureServerUri}/polygonalAgg?f=json
       */
      function fetchPolygonalAggMetadata() {
        const inputUrl = dojo.byId("inputUrl").value;
        if (!inputUrl) return;

        const metadataUrl = inputUrl + "/polygonalAgg?f=json";
        console.log("Fetching polygonal aggregation metadata: " + metadataUrl);

        const request = esriRequest({
          url: metadataUrl,
          handleAs: "json",
          callbackParamName: "callback"
        });

        request.then(function (response) {
          if (!response || !response.polygonalAggInfos || !Array.isArray(response.polygonalAggInfos)) {
            console.warn("No polygonalAggInfos found in polygonalAgg response.");
            return;
          }
          populatePolygonalAggDropdowns(response.polygonalAggInfos);
          console.log("Polygonal aggregation metadata loaded: " + response.polygonalAggInfos.length + " aggregation type(s).");
        }, function (error) {
          console.log("Error fetching polygonal aggregation metadata: " + error.message);
        });
      }

      /**
       * Populates the Polygonal Aggregation dropdowns from polygonalAggInfos
       * - "Polygonal Aggregation Type" dropdown from aggType values
       * - "Polygonal Aggregation Field" dropdown from the selected aggType's aggAttributeInfos
       * @param {Array} polygonalAggInfos - The polygonalAggInfos array from the polygonalAgg endpoint
       */
      function populatePolygonalAggDropdowns(polygonalAggInfos) {
        const typeSelect = dojo.byId("polyAggType");
        const fieldSelect = dojo.byId("polyAggField");
        if (!typeSelect || !fieldSelect) return;

        // Clear existing options
        typeSelect.innerHTML = "";
        fieldSelect.innerHTML = "";

        if (!polygonalAggInfos || !Array.isArray(polygonalAggInfos) || polygonalAggInfos.length === 0) {
          return;
        }

        // Store the full polygonalAggInfos for use when type changes
        _polygonalAggInfos = polygonalAggInfos;

        // Populate Aggregation Type dropdown with unique aggType values
        array.forEach(_polygonalAggInfos, function (aggInfo, idx) {
          const option = document.createElement("option");
          option.value = idx;
          option.textContent = aggInfo.aggType;
          typeSelect.appendChild(option);
        });

        // Hide the type dropdown row when there is only one aggregation type
        var typeRow = dojo.byId("polyAggTypeRow");
        if (typeRow) {
          typeRow.style.display = polygonalAggInfos.length <= 1 ? "none" : "";
        }

        // Populate Aggregation Field based on the first aggType
        updatePolyAggFieldDropdown();

        // Attach change handler for Aggregation Type
        on(typeSelect, "change", updatePolyAggFieldDropdown);
      }

      /**
       * Updates the Aggregation Field dropdown based on the currently selected Aggregation Type
       */
      function updatePolyAggFieldDropdown() {
        const typeSelect = dojo.byId("polyAggType");
        const fieldSelect = dojo.byId("polyAggField");
        if (!typeSelect || !fieldSelect || !_polygonalAggInfos) return;

        fieldSelect.innerHTML = "";

        const selectedIdx = parseInt(typeSelect.value);
        if (isNaN(selectedIdx) || !_polygonalAggInfos[selectedIdx]) return;

        const aggInfo = _polygonalAggInfos[selectedIdx];
        if (!aggInfo.aggAttributeInfos || !Array.isArray(aggInfo.aggAttributeInfos)) return;

        var reversed = aggInfo.aggAttributeInfos.slice().reverse();
        array.forEach(reversed, function (attrInfo) {
          const option = document.createElement("option");
          option.value = attrInfo.fieldName;
          option.textContent = attrInfo.level + ": " + attrInfo.fieldName;
          fieldSelect.appendChild(option);
        });
      }

      /**
       * Populates the Unique Value Field dropdown in the Polygon Aggregation
       * Settings section with the current feature layer's field names,
       * excluding system / geometry fields.
       * If _layerInfo is not yet available, fetches it directly.
       */
      function populateUniqueValueFieldDropdown() {
        const select = dojo.byId("polyAggUniqueValueField");
        if (!select) return;
        console.log(_layerInfo)

        if (_layerInfo && _layerInfo.fields) {
          _fillPolyAggStatFieldDropdown(select, _layerInfo.fields);
        } else {
          // _layerInfo not ready yet — fetch fields directly
          const url = dojo.byId("inputUrl").value;
          if (!url) return;
          esriRequest({
            url: url,
            handleAs: "json",
            content: { f: "json" },
            callbackParamName: "callback"
          }).then(function (response) {
            console.log(response)
            if (response && response.fields) {
              _fillPolyAggStatFieldDropdown(select, response.fields);
            }
          }, function (error) {
            console.warn("Failed to fetch fields for Unique Value Field dropdown: " + error.message);
          });
        }
      }

      // Fields to exclude (lower-cased for comparison)
      var _polyAggExcludeExact = [
        "objectid", "globalid", "fid",
        "geometry_json", "shape",
        "x", "y", "z", "m",
        "shape_length", "shape_area",
        "shape__length", "shape__area"
      ];
      var _polyAggExcludePrefixes = ["bbox_"];
      var _polyAggExcludeTypes = [
        "esriFieldTypeOID", "esriFieldTypeGlobalID", "esriFieldTypeGeometry"
      ];

      function _fillPolyAggStatFieldDropdown(select, fields) {
        select.innerHTML = "";

        // Default placeholder option
        var placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "-- Select a Field --";
        select.appendChild(placeholder);

        for (var i = 0; i < fields.length; i++) {
          var field = fields[i];
          var nameLower = field.name.toLowerCase();

          // Skip by type
          if (_polyAggExcludeTypes.indexOf(field.type) !== -1) continue;
          // Skip by exact name
          if (_polyAggExcludeExact.indexOf(nameLower) !== -1) continue;
          // Skip by prefix
          var skip = false;
          for (var p = 0; p < _polyAggExcludePrefixes.length; p++) {
            if (nameLower.indexOf(_polyAggExcludePrefixes[p]) === 0) { skip = true; break; }
          }
          if (skip) continue;

          var option = document.createElement("option");
          option.value = field.name;
          option.textContent = field.name;
          select.appendChild(option);
        }
      }

      /**
       * Sends a polygonal aggregation POST request, then queries the linked
       * polygon feature layer, joins aggregation counts to the polygons,
       * and renders the result with a ClassBreaksRenderer.
       *
       * Flow:
       *  1. Read selected polygonalAggType / polygonalAggField from the UI
       *  2. Find the linkedFeatureLayerUri from the metadata for the selected field
       *  3. POST to the feature layer endpoint to get aggregation results
       *  4. Query the linked polygon layer for geometries
       *  5. Join aggregation counts to polygons via the selected field
       *  6. Apply a ClassBreaksRenderer to visualize the result
       */
      function applyPolygonalAggregation() {
        // Clear both timers to prevent stacking
        clearTimeout(_polyAggPolygonRefreshInterval);
        clearTimeout(_polyAggLabelRefreshInterval);

        const typeSelect = dojo.byId("polyAggType");
        const fieldSelect = dojo.byId("polyAggField");
        if (!typeSelect || !fieldSelect) return;

        const selectedIdx = parseInt(typeSelect.value);
        const fieldName = fieldSelect.value;
        if (isNaN(selectedIdx) || !fieldName) return;

        const aggInfo = _polygonalAggInfos ? _polygonalAggInfos[selectedIdx] : null;
        if (!aggInfo || !aggInfo.aggAttributeInfos) return;
        const polygonalAggType = aggInfo.aggType;

        // Find the selected attrInfo and its linkedFeatureLayerUri
        let selectedAttrInfo = null;
        array.forEach(aggInfo.aggAttributeInfos, function (attrInfo) {
          if (attrInfo.fieldName === fieldName) {
            selectedAttrInfo = attrInfo;
          }
        });
        if (!selectedAttrInfo) return;

        const selectedLevel = selectedAttrInfo.level;

        // Find linkedFeatureLayerUri: check selected level first, then traverse
        // up to lower levels (parent), then one level below (child).
        let linkedUri = null;
        let linkedLevel = -1;
        for (let lvl = selectedLevel; lvl >= 0; lvl--) {
          array.forEach(aggInfo.aggAttributeInfos, function (attrInfo) {
            if (attrInfo.level === lvl && attrInfo.linkedFeatureLayerUri && !linkedUri) {
              linkedUri = attrInfo.linkedFeatureLayerUri;
              linkedLevel = lvl;
            }
          });
          if (linkedUri) break;
        }
        if (!linkedUri) {
          array.forEach(aggInfo.aggAttributeInfos, function (attrInfo) {
            if (attrInfo.level === selectedLevel + 1 && attrInfo.linkedFeatureLayerUri && !linkedUri) {
              linkedUri = attrInfo.linkedFeatureLayerUri;
              linkedLevel = attrInfo.level;
            }
          });
        }
        if (!linkedUri) {
          console.warn("No linkedFeatureLayerUri found for field '" + fieldName + "'.");
          return;
        }

        // Determine the join fields: fields from level 0 up to the linked level.
        // These are the fields that the linked feature layer actually has.
        const joinFields = [];
        array.forEach(aggInfo.aggAttributeInfos, function (attrInfo) {
          if (attrInfo.level <= linkedLevel) {
            joinFields.push(attrInfo.fieldName);
          }
        });

        // Determine the common fields between aggregation results and linked layer.
        const commonFields = [];
        array.forEach(aggInfo.aggAttributeInfos, function (attrInfo) {
          if (attrInfo.level <= Math.min(selectedLevel, linkedLevel)) {
            commonFields.push(attrInfo.fieldName);
          }
        });

        const inputUrl = dojo.byId("inputUrl").value;
        if (!inputUrl) return;

        // Read the optional unique value field
        const uvfSelect = dojo.byId("polyAggUniqueValueField");
        const uniqueValueField = uvfSelect ? uvfSelect.value : "";

        // Build POST content for aggregation query
        const postContent = {
          polygonalAggType: polygonalAggType,
          polygonalAggField: fieldName,
          returnGeometry: false,
          f: "json"
        };
        if (uniqueValueField) {
          postContent.uniqueValueFields = uniqueValueField;
        }

        // Save context for label-only refresh
        _polyAggContext = {
          inputUrl: inputUrl,
          polygonalAggType: polygonalAggType,
          fieldName: fieldName,
          uniqueValueFields: uniqueValueField,
          commonFields: commonFields,
          joinFields: joinFields,
          aggTypePrefix: polygonalAggType + "."
        };

        console.log("Polygonal aggregation POST to: " + inputUrl + "/query");
        console.log("  polygonalAggType=" + polygonalAggType + ", polygonalAggField=" + fieldName + ", uniqueValueField=" + uniqueValueField);

        // Step 1: POST aggregation query to the source layer
        const aggRequest = esriRequest({
          url: inputUrl + "/query",
          content: postContent,
          handleAs: "json",
          callbackParamName: "callback"
        }, { usePost: true });

        aggRequest.then(function (aggResponse) {
          const aggFeatures = Array.isArray(aggResponse.features) ? aggResponse.features : [];
          if (aggFeatures.length === 0) {
            console.warn("Polygonal aggregation query returned no features.");
            return;
          }

          console.log("Polygonal aggregation returned " + aggFeatures.length + " results.");

          // The count field in the response is "Count" (no aggType prefix)
          const countFieldName = "Count";

          // Strip the aggType prefix (e.g., "DCMetroBus.") from response attribute names
          // so they match the linked feature layer's field names.
          const aggTypePrefix = polygonalAggType + ".";
          function stripPrefix(name) {
            return name.startsWith(aggTypePrefix) ? name.substring(aggTypePrefix.length) : name;
          }

          // Also strip prefix from countFieldName for the result layer
          const cleanCountFieldName = stripPrefix(countFieldName);

          // Normalize each aggregation feature's attributes by stripping the
          // aggType prefix from all keys so they match linked layer field names.
          array.forEach(aggFeatures, function (f) {
            const cleaned = {};
            for (var attrName in f.attributes) {
              cleaned[stripPrefix(attrName)] = f.attributes[attrName];
            }
            f.attributes = cleaned;
          });

          // Build a lookup keyed by common fields, summing counts
          const aggLookup = {};
          let maxCount = 0;
          array.forEach(aggFeatures, function (f) {
            const keyParts = [];
            array.forEach(commonFields, function (cf) {
              keyParts.push(f.attributes[cf] !== undefined && f.attributes[cf] !== null ? f.attributes[cf] : "");
            });
            const key = keyParts.join("|");
            const count = f.attributes[cleanCountFieldName] || 0;
            aggLookup[key] = (aggLookup[key] || 0) + count;
          });
          for (var k in aggLookup) {
            if (aggLookup[k] > maxCount) maxCount = aggLookup[k];
          }

          console.log("Aggregation lookup (" + Object.keys(aggLookup).length + " keys, maxCount=" + maxCount + "):");
          for (var dk in aggLookup) {
            console.log("  [" + dk + "] = " + aggLookup[dk]);
          }

          // Step 2: Query the linked polygon layer for geometries (with caching)
          function processLinkedFeatures(linkedFeatures) {
            if (linkedFeatures.length === 0) {
              console.warn("Linked feature layer returned no features.");
              return;
            }

            // Remove previous LOD aggregation layer if it exists
            const existingAggLayer = _map.getLayer("aggregations");
            if (existingAggLayer) {
              _map.removeLayer(existingAggLayer);
            }

            // Remove previous polygonal aggregation result layer and its labels if they exist
            const prevResultLayer = _map.getLayer("polyAggResult");
            if (prevResultLayer) {
              _map.removeLayer(prevResultLayer);
            }
            const prevPolyAggLabels = _map.getLayer("polyAggLabels");
            if (prevPolyAggLabels) {
              _map.removeLayer(prevPolyAggLabels);
            }

            // Create field definitions for the result layer (use clean field names)
            const resultFields = [
              { name: "objectid", type: "esriFieldTypeOID", alias: "objectid" },
              { name: cleanCountFieldName, type: "esriFieldTypeInteger", alias: "Aggregation Count" }
            ];
            array.forEach(joinFields, function (jf) {
              resultFields.push({ name: jf, type: "esriFieldTypeString", alias: jf });
            });

            const resultLayerDef = {
              geometryType: "esriGeometryPolygon",
              fields: resultFields
            };
            const resultCollection = {
              layerDefinition: resultLayerDef,
              featureSet: {
                features: [],
                geometryType: "esriGeometryPolygon"
              }
            };
            const resultInfoTemplate = new InfoTemplate("Aggregation Result", "${*}");
            const resultLayer = new FeatureLayer(resultCollection, {
              id: "polyAggResult",
              objectIdField: "objectid",
              showLabels: true,
              showLabels: true,
              infoTemplate: resultInfoTemplate,
              outFields: ["*"]
            });

            // Build graphics by joining linked polygons with aggregation counts
            const mapSR = new SpatialReference(_map.spatialReference.wkid);
            const graphics = [];
            array.forEach(linkedFeatures, function (feature) {
              if (!feature.geometry) return;
              feature.geometry.spatialReference = mapSR.toJson();
              const geometry = new Polygon(feature.geometry);

              // Build composite key from the linked feature's common fields
              const keyParts = [];
              array.forEach(commonFields, function (cf) {
                var val = feature.attributes[cf];
                keyParts.push(val !== undefined && val !== null ? val : "");
              });
              const key = keyParts.join("|");
              const aggCount = aggLookup[key] || 0;
              if (aggCount === 0) {
                console.warn("polyAgg join: no match for key [" + key + "], commonFields=" + JSON.stringify(commonFields) +
                  ", linked attrs=" + JSON.stringify(feature.attributes));
              }

              const attrs = {};
              array.forEach(joinFields, function (jf) {
                attrs[jf] = feature.attributes[jf];
              });
              attrs[cleanCountFieldName] = aggCount;
              const graphic = new Graphic(geometry, null, attrs, null);
              graphics.push(graphic);
            });

            // Apply a ClassBreaksRenderer based on the count field
            if (maxCount > 0) {
              const renderer = createPolyAggClassBreaksRenderer(maxCount, cleanCountFieldName);
              resultLayer.setRenderer(renderer);
            }

            _map.addLayer(resultLayer);

            // Remove previous polyAgg labels layer if it exists
            const prevLabelsLayer = _map.getLayer("polyAggLabels");
            if (prevLabelsLayer) {
              _map.removeLayer(prevLabelsLayer);
            }

            resultLayer.on("load", function () {
              resultLayer.applyEdits(graphics, null, null).then(function () {
                resultLayer.refresh();
                console.log("Polygonal aggregation result layer added: " + graphics.length + " polygon features.");

                var geometries = array.map(graphics, function (g) { return g.geometry; });
                if (geometries.length > 0 && geometries[0].rings.length > 0) {
                  var palFont = (dojo.byId("polyAggLabelFont") || {}).value || "arial";
                  var palStyle = (dojo.byId("polyAggLabelStyle") || {}).value || "normal";
                  var palWeight = (dojo.byId("polyAggLabelWeight") || {}).value || "bold";
                  var palSize = parseInt((dojo.byId("polyAggLabelSize") || {}).value) || 10;
                  var palColorHex = (dojo.byId("polyAggLabelColor") || {}).value || "#000000";
                  var palOpacity = parseFloat((dojo.byId("polyAggLabelOpacity") || {}).value);
                  if (isNaN(palOpacity)) palOpacity = 1;

                  var palR = parseInt(palColorHex.slice(1, 3), 16);
                  var palG = parseInt(palColorHex.slice(3, 5), 16);
                  var palB = parseInt(palColorHex.slice(5, 7), 16);

                  function addPolyAggLabels(labelPts) {
                    var polyAggLabelsLayer = new GraphicsLayer({ id: "polyAggLabels" });
                    array.forEach(labelPts, function (labelPoint, i) {
                      if (!labelPoint) return;
                      var count = graphics[i].attributes ? graphics[i].attributes[cleanCountFieldName] : "";
                      if (count === null || count === undefined) return;
                      var textSymbol = new TextSymbol(number.format(count, { places: 0 }));
                      textSymbol.setColor(new Color([palR, palG, palB, palOpacity]));
                      textSymbol.font.setFamily(palFont);
                      textSymbol.font.setSize(palSize + "pt");
                      textSymbol.font.setStyle(palStyle);
                      textSymbol.font.setWeight(palWeight);
                      textSymbol.setHaloColor(new Color([255, 255, 255, 1]));
                      textSymbol.setHaloSize(2);
                      textSymbol.setAlign("center");
                      textSymbol.setVerticalAlignment("middle");
                      polyAggLabelsLayer.add(new Graphic(labelPoint, textSymbol));
                    });
                    _map.addLayer(polyAggLabelsLayer);
                  }

                  var labelMethod = (dojo.byId("polyAggLabelMethod") || {}).value || "geometryService";
                  if (labelMethod === "centerline" && window.computeCenterlineLabelPoints) {
                    var ringsArray = array.map(geometries, function (g) { return g.rings; });
                    var rawPts = window.computeCenterlineLabelPoints(ringsArray);
                    var labelPts = array.map(rawPts, function (pt) {
                      return new Point(pt[0], pt[1], mapSR);
                    });
                    addPolyAggLabels(labelPts);
                  } else {
                    _gs.labelPoints(geometries).then(addPolyAggLabels);
                  }
                }

                // Schedule auto-refresh if enabled (separate rates for polygons and labels)
                if (dojo.byId("polyAggAutoRefresh").checked) {
                  _polyAggAutoRefresh = true;
                  var intervalSec = parseFloat(dojo.byId("polyAggRefreshInterval").value) || 1;
                  // Polygon rendering refreshes at 10x the user-set interval
                  clearTimeout(_polyAggPolygonRefreshInterval);
                  _polyAggPolygonRefreshInterval = setTimeout(applyPolygonalAggregation, intervalSec * 10 * 1000);
                  // Label rendering refreshes at the user-set interval
                  clearTimeout(_polyAggLabelRefreshInterval);
                  _polyAggLabelRefreshInterval = setTimeout(refreshPolyAggLabelsOnly, intervalSec * 1000);
                }
              });
            });
          }

          // Use cached linked features if available for the same URI
          if (linkedUri === _cachedLinkedLayerUri && _cachedLinkedFeatures) {
            console.log("Using cached linked layer features for: " + linkedUri);
            processLinkedFeatures(_cachedLinkedFeatures);
          } else {
            const linkedOutFields = joinFields.join(",");
            const linkedQueryUrl = linkedUri + "/query?where=1%3D1" +
              "&outFields=" + encodeURIComponent(linkedOutFields) +
              "&returnGeometry=true&outSR=" + _currentMapSR + "&f=pjson";

            const linkedRequest = esriRequest({
              url: linkedQueryUrl,
              handleAs: "json",
              callbackParamName: "callback"
            });

            linkedRequest.then(function (linkedResponse) {
              const linkedFeatures = Array.isArray(linkedResponse.features) ? linkedResponse.features : [];
              _cachedLinkedLayerUri = linkedUri;
              _cachedLinkedFeatures = linkedFeatures;
              console.log("Fetched and cached linked layer features: " + linkedFeatures.length + " features from " + linkedUri);
              processLinkedFeatures(linkedFeatures);
            }, function (error) {
              console.log("Error querying linked feature layer: " + error.message);
            });
          }

        }, function (error) {
          console.log("Error querying polygonal aggregation: " + error.message);
        });
      }

      /**
       * Refreshes only the polygonal aggregation labels by re-querying
       * aggregation data and updating label text, without re-rendering polygons.
       */
      function refreshPolyAggLabelsOnly() {
        if (!_polyAggContext) return;
        var ctx = _polyAggContext;

        var postContent = {
          polygonalAggType: ctx.polygonalAggType,
          polygonalAggField: ctx.fieldName,
          returnGeometry: false,
          f: "json"
        };
        if (ctx.uniqueValueFields) {
          postContent.uniqueValueFields = ctx.uniqueValueFields;
        }

        console.log("Label-only refresh: POST to " + ctx.inputUrl + "/query");

        var aggRequest = esriRequest({
          url: ctx.inputUrl + "/query",
          content: postContent,
          handleAs: "json",
          callbackParamName: "callback"
        }, { usePost: true });

        aggRequest.then(function (aggResponse) {
          var aggFeatures = Array.isArray(aggResponse.features) ? aggResponse.features : [];
          if (aggFeatures.length === 0) return;

          var aggTypePrefix = ctx.aggTypePrefix;
          function stripPrefix(name) {
            return name.startsWith(aggTypePrefix) ? name.substring(aggTypePrefix.length) : name;
          }

          var cleanCountFieldName = stripPrefix("Count");

          array.forEach(aggFeatures, function (f) {
            var cleaned = {};
            for (var attrName in f.attributes) {
              cleaned[stripPrefix(attrName)] = f.attributes[attrName];
            }
            f.attributes = cleaned;
          });

          var aggLookup = {};
          array.forEach(aggFeatures, function (f) {
            var keyParts = [];
            array.forEach(ctx.commonFields, function (cf) {
              keyParts.push(f.attributes[cf] !== undefined && f.attributes[cf] !== null ? f.attributes[cf] : "");
            });
            var key = keyParts.join("|");
            var count = f.attributes[cleanCountFieldName] || 0;
            aggLookup[key] = (aggLookup[key] || 0) + count;
          });

          // Get existing polygon layer graphics for geometries and keys
          var resultLayer = _map.getLayer("polyAggResult");
          if (!resultLayer || !resultLayer.graphics || resultLayer.graphics.length === 0) return;

          var existingGraphics = resultLayer.graphics;
          var geometries = array.map(existingGraphics, function (g) { return g.geometry; });

          // Remove old labels
          var prevLabels = _map.getLayer("polyAggLabels");
          if (prevLabels) {
            _map.removeLayer(prevLabels);
          }

          // Read label settings from Polygon Aggregation Label panel
          var palFont = (dojo.byId("polyAggLabelFont") || {}).value || "arial";
          var palStyle = (dojo.byId("polyAggLabelStyle") || {}).value || "normal";
          var palWeight = (dojo.byId("polyAggLabelWeight") || {}).value || "bold";
          var palSize = parseInt((dojo.byId("polyAggLabelSize") || {}).value) || 10;
          var palColorHex = (dojo.byId("polyAggLabelColor") || {}).value || "#000000";
          var palOpacity = parseFloat((dojo.byId("polyAggLabelOpacity") || {}).value);
          if (isNaN(palOpacity)) palOpacity = 1;

          var palR = parseInt(palColorHex.slice(1, 3), 16);
          var palG = parseInt(palColorHex.slice(3, 5), 16);
          var palB = parseInt(palColorHex.slice(5, 7), 16);

          if (geometries.length > 0 && geometries[0].rings && geometries[0].rings.length > 0) {
            function addRefreshedLabels(labelPts) {
              var polyAggLabelsLayer = new GraphicsLayer({ id: "polyAggLabels" });
              array.forEach(labelPts, function (labelPoint, i) {
                if (!labelPoint) return;
                var keyParts = [];
                array.forEach(ctx.commonFields, function (cf) {
                  keyParts.push(existingGraphics[i].attributes[cf] || "");
                });
                var key = keyParts.join("|");
                var count = aggLookup[key] || 0;
                if (count === null || count === undefined) return;
                var textSymbol = new TextSymbol(number.format(count, { places: 0 }));
                textSymbol.setColor(new Color([palR, palG, palB, palOpacity]));
                textSymbol.font.setFamily(palFont);
                textSymbol.font.setSize(palSize + "pt");
                textSymbol.font.setStyle(palStyle);
                textSymbol.font.setWeight(palWeight);
                textSymbol.setHaloColor(new Color([255, 255, 255, 1]));
                textSymbol.setHaloSize(2);
                textSymbol.setAlign("center");
                textSymbol.setVerticalAlignment("middle");
                polyAggLabelsLayer.add(new Graphic(labelPoint, textSymbol));
              });
              _map.addLayer(polyAggLabelsLayer);
              console.log("Label-only refresh complete: " + labelPts.length + " labels updated.");

              if (dojo.byId("polyAggAutoRefresh").checked) {
                var intervalSec = parseFloat(dojo.byId("polyAggRefreshInterval").value) || 1;
                clearTimeout(_polyAggLabelRefreshInterval);
                _polyAggLabelRefreshInterval = setTimeout(refreshPolyAggLabelsOnly, intervalSec * 1000);
              }
            }

            var labelMethod = (dojo.byId("polyAggLabelMethod") || {}).value || "geometryService";
            if (labelMethod === "centerline" && window.computeCenterlineLabelPoints) {
              var mapSR = new SpatialReference(_map.spatialReference.wkid);
              var ringsArray = array.map(geometries, function (g) { return g.rings; });
              var rawPts = window.computeCenterlineLabelPoints(ringsArray);
              var labelPts = array.map(rawPts, function (pt) {
                return new Point(pt[0], pt[1], mapSR);
              });
              addRefreshedLabels(labelPts);
            } else {
              _gs.labelPoints(geometries).then(addRefreshedLabels);
            }
          }
        }, function (error) {
          console.log("Error in label-only refresh: " + error.message);
        });
      }

      /**
       * Creates a ClassBreaksRenderer for polygonal aggregation results
       * Uses the "agg_count" field with color ramp from light to dark
       * @param {number} maxCount - The maximum aggregation count for scaling breaks
       * @returns {ClassBreaksRenderer} The renderer instance
       */
      // Color ramp definitions for polygonal aggregation renderer
      var _polyAggColorRamps = {
        blue:     [[222,235,247],[198,219,239],[158,202,225],[107,174,214],[66,146,198],[33,113,181],[8,81,156]],
        red:      [[254,229,217],[252,187,161],[252,146,114],[251,106,74],[239,59,44],[203,24,29],[153,0,13]],
        green:    [[229,245,224],[199,233,192],[161,217,155],[116,196,118],[65,171,93],[35,139,69],[0,104,55]],
        orange:   [[254,237,222],[253,208,162],[253,174,107],[253,141,60],[241,105,19],[217,72,1],[166,54,3]],
        purple:   [[239,237,245],[218,218,235],[188,189,220],[158,154,200],[128,125,186],[106,81,163],[74,20,134]],
        heat:     [[255,255,178],[254,217,118],[254,178,76],[253,141,60],[252,78,42],[227,26,28],[177,0,38]],
        spectral: [[215,25,28],[253,174,97],[254,204,92],[255,255,191],[171,221,164],[43,131,186],[36,104,180]]
      };

      function createPolyAggClassBreaksRenderer(maxCount, fieldName) {
        if (maxCount <= 0) maxCount = 1;
        if (!fieldName) fieldName = "agg_count";

        var numBreaks = parseInt((dojo.byId("polyAggClassBreaks") || {}).value) || 7;
        var rampName = (dojo.byId("polyAggColorRamp") || {}).value || "blue";
        var fillOpacity = parseFloat((dojo.byId("polyAggFillOpacity") || {}).value);
        if (isNaN(fillOpacity)) fillOpacity = 0.6;

        var rampColors = _polyAggColorRamps[rampName] || _polyAggColorRamps.blue;

        // Interpolate ramp to the requested number of breaks
        function interpolateRamp(colors, n) {
          if (n <= 1) return [colors[0]];
          var result = [];
          for (var i = 0; i < n; i++) {
            var t = i / (n - 1) * (colors.length - 1);
            var lo = Math.floor(t);
            var hi = Math.min(lo + 1, colors.length - 1);
            var frac = t - lo;
            result.push([
              Math.round(colors[lo][0] + (colors[hi][0] - colors[lo][0]) * frac),
              Math.round(colors[lo][1] + (colors[hi][1] - colors[lo][1]) * frac),
              Math.round(colors[lo][2] + (colors[hi][2] - colors[lo][2]) * frac)
            ]);
          }
          return result;
        }

        var ramp = interpolateRamp(rampColors, numBreaks);

        function createSymbol(color) {
          return new SimpleFillSymbol()
            .setColor(color)
            .setOutline(
              new SimpleLineSymbol().setColor(new Color([20, 20, 20, 1])).setWidth(1.5)
            );
        }

        var breakSize = maxCount / numBreaks;
        var classBreakInfos = [];
        for (var i = 0; i < numBreaks; i++) {
          classBreakInfos.push({
            minValue: i === 0 ? 0 : breakSize * i,
            maxValue: i === numBreaks - 1 ? maxCount + 1 : breakSize * (i + 1),
            symbol: createSymbol(new Color([ramp[i][0], ramp[i][1], ramp[i][2], fillOpacity]))
          });
        }

        var renderer = new ClassBreaksRenderer({
          field: fieldName,
          defaultSymbol: createSymbol(new Color([150, 150, 150, 0.3])),
          classBreakInfos: classBreakInfos
        });

        return renderer;
      }

      function populateDijitSelectWithLayerFields(select, numericOnly) {
        // clear exiting options
        select.removeOption(select.getOptions());

        // populate options based on the _layerInfo.fields array
        for (let i = 0; i < _layerInfo.fields.length; i++) {
          const field = _layerInfo.fields[i];
          const fieldType = field.type.substring(13);
          const option = {'label': field.name + "&nbsp;&nbsp;" + "<em class='fieldTypeSelect'>" + fieldType + '</em>', 'value': field.name, 'type': field.type };
          if (numericOnly) {
            if (isFieldNumeric(field))
              select.addOption(option);
          } else {
            if (isSupportedStatField(field))
              select.addOption(option);
          }
        }
      }


      /**
       * Checks if the field is numeric
       * @param {Object} field - The field object to check
       * @returns {boolean} True if the field is numeric, false otherwise
       */
      function isFieldNumeric(field) {
          if (!field || !field.type)
            return false;

          return (field.type === "esriFieldTypeSmallInteger" || field.type === "esriFieldTypeInteger" || field.type === "esriFieldTypeSingle" || field.type === "esriFieldTypeDouble" || field.type === "esriFieldTypeOID");
      }

      /**
       * Checks if the field is supported for statistical operations
       * @param {Object} field - The field object to check
       * @returns {boolean} True if the field is supported, false otherwise
       */
      function isSupportedStatField(field) {
          if (!field || !field.type)
            return false;

          return (field.type !== "esriFieldTypeGeometry" && field.type !== "esriFieldTypeBlob" && field.type !== "esriFieldTypeRaster");
      }


      //#############################################################################################
      // Layer related functions
      //#############################################################################################

      /**
       * Adds a client-side feature layer for aggregations with a predefined feature collection and renderer
       * This layer will be used to display aggregated data on the map
       * @returns {FeatureLayer} The created FeatureLayer instance
       */
      function addAggregationsLayer() {
        const layerDefinition = {
          "geometryType": "esriGeometryPolygon",
          "fields": [
            {
              "name": "objectid",
              "type": "esriFieldTypeInteger",
              "alias": "objectid"
            }, {
              "name": "Geohash",
              "type": "esriFieldTypeString",
              "alias": "Geohash"
            }, {
              "name": "Count",
              "type": "esriFieldTypeInteger",
              "alias": "Count"
            }, {
              "name": "Weight",
              "type": "esriFieldTypeDouble",
              "alias": "Weight"
            }, {
              "name": "Geometry",
              "type": "esriFieldTypeGeometry",
              "alias": "Geometry"
            }
          ]
        };
        const featureCollection = {
          layerDefinition: layerDefinition,
          featureSet: {
            features: [],
            geometryType: layerDefinition.geometryType
          }
        };
        const infoTemplate = new InfoTemplate("Attributes", "${*}");
        const aggregationLayer = new FeatureLayer(featureCollection, {
          id: "aggregations",
          objectIdField: "objectid",
          showLabels: true,
          infoTemplate: infoTemplate,
          outFields: ["*"]
        });

        // Create and set the bins renderer
        const renderer = dojo.byId("useAggregationRenderer").checked === true ? createAggregationRenderer() : createClassBreakRenderer();
        aggregationLayer.setRenderer(renderer);
        
        // Create and set the bin labels (if renderLabels is checked)
        if (dojo.byId("renderLabels") && dojo.byId("renderLabels").checked === true) {
          const labelClass = createLabelClass();
          aggregationLayer.setLabelingInfo([labelClass]);
        }
        
        _map.addLayer(aggregationLayer);
        console.log("Client Aggregation Layer added");

        getLayerInfo();
        return aggregationLayer
      }

      /**
       * Adds a heatmap layer to the map with a predefined feature collection and renderer
       */
      function addHeatmapLayer() {
        const layerDefinition = {
          "geometryType": "esriGeometryPoint",
          "fields": [{
            "name": "objectid",
            "type": "esriFieldTypeInteger",
            "alias": "objectid"
                }, {
            "name": "Geohash",
            "type": "esriFieldTypeString",
            "alias": "Geohash"
                }, {
            "name": "Count",
            "type": "esriFieldTypeInteger",
            "alias": "Count"
                }, {
            "name": "Weight",
            "type": "esriFieldTypeDouble",
            "alias": "Weight"
                }, {
            "name": "geometry",
            "type": "esriFieldTypeGeometry",
            "alias": ""
                }]
        };

        const featureCollection = {
          layerDefinition: layerDefinition,
          featureSet: {
            features: [],
            geometryType: layerDefinition.geometryType
          }
        };

        const heatmapLayer = new FeatureLayer(featureCollection, {
          id: "heatmap",
          objectIdField: "objectid",
          visible: true,
          opacity: 1
        });

        // Create and set the renderer for the heatmap layer
        const renderer = createHeatmapRenderer();
        heatmapLayer.setRenderer(renderer);

        _map.addLayer(heatmapLayer);
        console.log("Heatmap Layer added");
      }

      /**
       * Queries the feature layer's time extent and sets the global _layerTimeExtent variable
       * This function is called when the map is loaded or when the layer is set
       */
      function queryLayerTimeExtent() {
        const url = dojo.byId("inputUrl").value + "?f=json";
        const request = esriRequest({
          "url": url,
          "handleAs": "json",
          "callbackParamName": "callback"
        });
        request.then(
          function (response) {
            _layerTimeExtent = new TimeExtent(new Date(response.timeInfo.timeExtent[0]), new Date(response.timeInfo.timeExtent[1]));
          },
          function (error) {
            console.log("Error getting the layers time extent: ", error.message);
          });
      }

      /**
       * Loads the properties for the bin renderer from the UI inputs
       * This function reads values from the input fields and sets them in the _binRendererProps object
       * It is called when the aggregation renderer is used or when the properties need to be
       */
      function loadBinRendererProps() {
        _binRendererProps.classBreaksCount = dojo.byId("classBreaksCount") ? dojo.byId("classBreaksCount").value : 10;
        console.log("Creating an aggregation renderer with " + _binRendererProps.classBreaksCount + " class breaks");

        // min and max fill color and opacity
        const minColorHex = dojo.byId("minColor") ? dojo.byId("minColor").value : "#000000";
        const maxColorHex = dojo.byId("maxColor") ? dojo.byId("maxColor").value : "#000000";
        let minColorA = dojo.byId("minColorA") ? parseFloat(dojo.byId("minColorA").value / 255) : 1.0;
        if (isNaN(minColorA) || minColorA < 0 || minColorA > 1) {
          minColorA = 1.0; // Default to fully opaque if invalid
        }
        let maxColorA = dojo.byId("maxColorA") ? parseFloat(dojo.byId("maxColorA").value / 255) : 1.0;
        if (isNaN(maxColorA) || maxColorA < 0 || maxColorA > 1) {
          maxColorA = 1.0; // Default to fully opaque if invalid
        }
        _binRendererProps.minColor = hexToRgba(minColorHex, minColorA);
        _binRendererProps.maxColor = hexToRgba(maxColorHex, maxColorA);

        // min and max outline color and opacity
        const minOutlineColorHex = dojo.byId("minOutlineColor") ? dojo.byId("minOutlineColor").value : "#000000";
        const maxOutlineColorHex = dojo.byId("maxOutlineColor") ? dojo.byId("maxOutlineColor").value : "#000000";
        let minOutlineColorA = dojo.byId("minOutlineColorA") ? parseFloat(dojo.byId("minOutlineColorA").value / 255) : 1.0;
        if (isNaN(minOutlineColorA) || minOutlineColorA < 0 || minOutlineColorA > 1) {
          minOutlineColorA = 1.0; // Default to fully opaque if invalid
        }
        let maxOutlineColorA = dojo.byId("maxOutlineColorA") ? parseFloat(dojo.byId("maxOutlineColorA").value / 255) : 1.0;
        if (isNaN(maxOutlineColorA) || maxOutlineColorA < 0 || maxOutlineColorA > 1) {
          maxOutlineColorA = 1.0; // Default to fully opaque if invalid
        }
        _binRendererProps.minOutlineColor = hexToRgba(minOutlineColorHex, minOutlineColorA);
        _binRendererProps.maxOutlineColor = hexToRgba(maxOutlineColorHex, maxOutlineColorA);

        // min and max outline width
        _binRendererProps.minOutlineWidth = dojo.byId("minOutlineWidth") ? parseFloat(dojo.byId("minOutlineWidth").value) : 0.5;
        _binRendererProps.maxOutlineWidth = dojo.byId("maxOutlineWidth") ? parseFloat(dojo.byId("maxOutlineWidth").value) : 1.0;
      }

      /**
       * Interpolates a value between min and max.
       * @param {number} ratio - A value between 0 and 1
       * @param {number} min - The minimum value
       * @param {number} max - The maximum value
       * @returns {number} A value between min and max
       */
      function interpolate(ratio, min, max) {
        if (max === min) return max;
        return min + ratio * (max - min);
      }

      /**
       * Creates class break information for the renderer.
       * @param {number} min - The minimum value for the class break
       * @param {number} max - The maximum value for the class break
       * @returns {Object} An object containing the class break information
       */
      function createClassBreakInfo(min, max) {
        const ratio = max / 100;

        // fill color and opacity
        const fillR = interpolate(ratio, _binRendererProps.minColor[0], _binRendererProps.maxColor[0]);
        const fillG = interpolate(ratio, _binRendererProps.minColor[1], _binRendererProps.maxColor[1]);
        const fillB = interpolate(ratio, _binRendererProps.minColor[2], _binRendererProps.maxColor[2]);
        const fillA = interpolate(ratio, _binRendererProps.minColor[3], _binRendererProps.maxColor[3]);
        const fillColor = new Color([fillR, fillG, fillB, fillA]);
        const fillSymbol = new SimpleFillSymbol();

        // outline color and width
        const outlineR = interpolate(ratio, _binRendererProps.minOutlineColor[0], _binRendererProps.maxOutlineColor[0]);
        const outlineG = interpolate(ratio, _binRendererProps.minOutlineColor[1], _binRendererProps.maxOutlineColor[1]);
        const outlineB = interpolate(ratio, _binRendererProps.minOutlineColor[2], _binRendererProps.maxOutlineColor[2]);
        const outlineA = interpolate(ratio, _binRendererProps.minOutlineColor[3], _binRendererProps.maxOutlineColor[3]);
        const outlineColor = new Color([outlineR, outlineG, outlineB, outlineA]);
        const outlineWidth = interpolate(ratio, _binRendererProps.minOutlineWidth, _binRendererProps.maxOutlineWidth);
        fillSymbol
                .setStyle(SimpleFillSymbol.STYLE_SOLID)
                .setColor(fillColor)
                .setOutline(
                        new SimpleLineSymbol().setColor(outlineColor).setWidth(outlineWidth)
                );
        return {
          minValue: min,
          maxValue: max,
          symbol: fillSymbol
        };
      }

      /**
       * Builds class break infos for the aggregation renderer based on the bin renderer properties
       * This function creates an array of class break infos with interpolated colors and sizes
       * @returns {Array} An array of class break info objects
       */
      function buildAggregationRendererClassBreakInfos() {
        loadBinRendererProps();
        const classBreakInfos = [];
        const classSize = 100 / _binRendererProps.classBreaksCount;
        for (let i = 0; i < _binRendererProps.classBreaksCount; i++) {
          classBreakInfos.push(createClassBreakInfo(i * classSize, (i + 1) * classSize));
        }
        return classBreakInfos;
      }

      /**
       * Builds class break infos for a simple aggregation renderer with fixed breaks
       * This function creates an array of class break infos with predefined ranges
       * This is used for the simple aggregation renderer example
       * It creates fixed class breaks for demonstration purposes
       * It does not use the bin renderer properties
       * @returns {Array} An array of class break info objects
       */
      function buildAggregationRendererClassBreakInfos_Simple() {
        loadBinRendererProps();
        const classBreakInfos = [];
        classBreakInfos.push(createClassBreakInfo(0, 10));
        classBreakInfos.push(createClassBreakInfo(10, 20));
        classBreakInfos.push(createClassBreakInfo(20, 30));
        classBreakInfos.push(createClassBreakInfo(30, 40));
        classBreakInfos.push(createClassBreakInfo(40, 50));
        classBreakInfos.push(createClassBreakInfo(50, 60));
        classBreakInfos.push(createClassBreakInfo(60, 70));
        classBreakInfos.push(createClassBreakInfo(70, 80));
        classBreakInfos.push(createClassBreakInfo(80, 90));
        classBreakInfos.push(createClassBreakInfo(90, 100));
        return classBreakInfos;
      }

      /**
       * Creates a ClassBreaksRenderer for the aggregation layer
       * This renderer defines different color breaks based on the "Weight" field
       * @returns {ClassBreaksRenderer} The created ClassBreaksRenderer instance
       */
      function createAggregationRenderer() {
        const classBreakInfos = buildAggregationRendererClassBreakInfos();

        // define breaks and color
        const renderer = new ClassBreaksRenderer({
          field: "Weight",
          defaultSymbol: createClassBreakInfo(90, 100).symbol,
          normalizationType: "percent-of-total",
          normalizationTotal: 100,
          classBreakInfos: classBreakInfos
        });

        return renderer;
      }

      /**
       * Creates a ClassBreaksRenderer for the aggregation layer
       * This renderer defines different color breaks based on the "Weight" field
       * @returns {ClassBreaksRenderer} The created ClassBreaksRenderer instance
       */
       function createClassBreakRenderer() {
        console.log("Creating a class break renderer with 10 classes");

        // define default symbol
        const symbol = new SimpleFillSymbol();
        symbol.setColor(new Color([150, 150, 150, 0.3]))
          .setOutline(new SimpleLineSymbol().setColor(new Color([20, 20, 20, 1])).setWidth(1.5));
        // function to create symbol for breaks with a given color
        function createSymbol(color) {
          return new SimpleFillSymbol()
            .setColor(color)
            .setOutline(
              new SimpleLineSymbol().setColor(new Color([20, 20, 20, 1])).setWidth(1.0)
            );
        };
        const classColorInfo = [];

        // define breaks and color
        const renderer = new ClassBreaksRenderer({
          field: "Weight",
          defaultSymbol: symbol,
          normalizationType: "percent-of-total",
          normalizationTotal: 100,
          classBreakInfos: [
            {
              minValue: 0,
              maxValue: 10,
              symbol: createSymbol(new Color([254, 240, 217, 0.7]))
            },
            {
              minValue: 10,
              maxValue: 20,
              symbol: createSymbol(new Color([253, 212, 158, 0.7]))
            },
            {
              minValue: 20,
              maxValue: 30,
              symbol: createSymbol(new Color([253, 187, 132, 0.8]))
            },
            {
              minValue: 30,
              maxValue: 40,
              symbol: createSymbol(new Color([252, 141, 89, 0.8]))
            },
            {
              minValue: 40,
              maxValue: 60,
              symbol: createSymbol(new Color([239, 101, 72, 0.9]))
            },
            {
              minValue: 60,
              maxValue: 80,
              symbol: createSymbol(new Color([215, 48, 31, 0.9]))
            },
            {
              minValue: 80,
              maxValue: 100,
              symbol: createSymbol(new Color([153, 0, 0, 1]))
            }
          ]
        });

        return renderer;        
      }

      /**
       * Creates a HeatmapRenderer for the heatmap layer
       * This renderer defines color stops and blur radius for the heatmap visualization
       * @returns {HeatmapRenderer} The created HeatmapRenderer instance
       */
      function createHeatmapRenderer() {
          const renderer =  new HeatmapRenderer({
            colorStops: [
              {
                ratio: 0,
                color: "rgba(250, 0, 0, 0)"
                    },
              {
                ratio: 0.3,
                color: "rgba(0,128,255, 1)"
                    },
              {
                ratio: 0.4,
                color: "rgba(115,185,139, 1)"
                    },
              {
                ratio: 0.5,
                color: "rgba(185,220,69, 1)"
                    },
              {
                ratio: 0.6,
                color: "rgba(255,255,0, 1)"
                    },
              {
                ratio: 0.7,
                color: "rgb(255,220,0)"
                    },
              {
                ratio: 0.9,
                color: "rgb(255,174,0)"
                    },
              {
                ratio: 0.97,
                color: "rgb(255,112,0)"
                    },
              {
                ratio: 0.98,
                color: "rgb(255,80,0)"
                    },
              {
                ratio: 0.999,
                color: "rgb(255, 0, 0)"
                    }],
            blurRadius: 12,
            field: "Weight"
          });

          return renderer;
      }

      /**
       * Creates a LabelClass for the feature layer
       * This class defines the labeling properties for the features
       * @returns {LabelClass} The created LabelClass instance
       */
      function createLabelClass() {
        // Get label configuration from UI controls
        const labelFont = dijit.byId("labelFont") ? dijit.byId("labelFont").value : "arial";
        const labelStyle = dijit.byId("labelStyle") ? dijit.byId("labelStyle").value : "normal";
        const labelWeight = dijit.byId("labelWeight") ? dijit.byId("labelWeight").value : "normal";
        const labelSize = dojo.byId("labelSize") ? dojo.byId("labelSize").value + "pt" : "9pt";
        const labelColorHex = dojo.byId("labelColor") ? dojo.byId("labelColor").value : "#000000";
        const labelOpacity = dojo.byId("labelOpacity") ? parseFloat(dojo.byId("labelOpacity").value) : 1.0;
        
        // Convert hex color to RGB with opacity
        let labelColor = hexToRgb(labelColorHex);
        if (labelColor) {
          labelColor = [labelColor.r, labelColor.g, labelColor.b, labelOpacity];
        } else {
          labelColor = [0, 0, 0, labelOpacity]; // Default to black
        }

        // Create a text symbol for the label
        const textSymbol = new TextSymbol().setColor(new Color(labelColor));
        textSymbol.font.setSize(labelSize);
        textSymbol.font.setFamily(labelFont);
        textSymbol.font.setStyle(toFontStyle(labelStyle));
        textSymbol.font.setWeight(toFontWeight(labelWeight));


        // Create a label class with label expression and text symbol
        const labelJson = {
          "labelExpressionInfo": {
            "value": "{Weight}"
          },
          "labelPlacement": "always-horizontal"
        };
        const labelClass = new LabelClass(labelJson);
        labelClass.symbol = textSymbol;
        
        return labelClass;
      }

      // ###############################################################################################
      // ### Utility Functions ###
      // ###############################################################################################

      /**
       * Converts label style string to a valid font style
       * @param {string} labelStyle - The label style string (e.g., "italic", "oblique")
       * @returns {string} The corresponding font style ("normal", "italic", "oblique")
       */
      function toFontStyle(labelStyle) {
        // Convert label style string to font style
        if (!labelStyle || typeof labelStyle !== "string") {
          return "normal"; // Default to normal if no style is provided
        }

        if (labelStyle.toLowerCase().includes("italic")) {
          return "italic";
        }
        if (labelStyle.toLowerCase().includes("oblique")) {
          return "oblique";
        }

        // default to normal if no specific style is found
        return "normal";
      }

      /**
       * Converts label weight string to a valid font weight
       * @param {string} labelWeight - The label weight string (e.g., "bold", "bolder", "lighter")
       * @returns {string} The corresponding font weight ("normal", "bold", "bolder", "lighter")
       */
      function toFontWeight(labelWeight) {
        // Convert label style string to font weight
        if (!labelWeight || typeof labelWeight !== "string") {
          return "normal"; // Default to normal if no style is provided
        }

        if (labelWeight.toLowerCase().includes("bold")) {
          return "bold";
        }
        if (labelWeight.toLowerCase().includes("bolder")) {
          return "bolder";
        }
        if (labelWeight.toLowerCase().includes("lighter")) {
          return "lighter";
        }

        // default to normal if no specific weight is found
        return "normal";
      }

      /**
       * Converts a hexadecimal color string to RGB values
       * Used for processing label color settings from the UI
       * @param {string} hex - Hexadecimal color string (e.g., "#FF0000")
       * @returns {Object|null} RGB object with r, g, b properties or null if invalid
       */
      function hexToRgb(hex) {
        const hexWithoutHash = hex.replace("#", "");

        const r = parseInt(hexWithoutHash.substring(0, 2), 16);
        const g = parseInt(hexWithoutHash.substring(2, 4), 16);
        const b = parseInt(hexWithoutHash.substring(4, 6), 16);
        return {
          r,
          g,
          b
        };
      }

      /**
       * Converts a hexadecimal color string to RGBA values
       * @param {string} hex - Hexadecimal color string (e.g., "#FF0000")
       * @param {number} a - Alpha value (0-1)
       * @returns {Array|null} Array with r, g, b, a values or null if invalid
       */
      function hexToRgba(hex, a) {
        const hexWithoutHash = hex.replace("#", "");

        const r = parseInt(hexWithoutHash.substring(0, 2), 16);
        const g = parseInt(hexWithoutHash.substring(2, 4), 16);
        const b = parseInt(hexWithoutHash.substring(4, 6), 16);

        return [r, g, b, a];
      }

      /**
       * Builds the query URL based on the current UI settings
       * This function constructs the URL for querying the feature layer (or MSL) with LOD, time, and spatial filters
       * @returns {string} The constructed query URL
       */
      function buildQueryUrlFromUI() {
        let timeParam = "";
        if (_replay) {
          const start = _layerTimeExtent.startTime.getTime();
          const end = _layerTimeExtent.endTime.getTime();
          timeParam = "&time=" + start + "," + end;
        } else if (_live) {
          const now = new Date().getTime();
          timeParam = "&time=null," + now;
        }

        let lod = dojo.byId("lod").value;
        let lodGeometryAggregationType = dojo.byId("lodGeometryAggregationType").value;
        const lodType = dojo.byId("lodType").value;
        if (dojo.byId("autoOffSet").checked === true) {
          if (lodType === "flatHexagon" || lodType === "pointyHexagon" || lodType === "square" || lodType === 'geotile') {
            lod = (parseInt(lod) + 5).toString();
          } else if (lodType === "flatTriangle" || lodType === "pointyTriangle") {
            lod = (parseInt(lod) + 4).toString();
          } else if (lodType === 'h3') {
            lod = (parseInt(lod) + 0).toString();
          }
        }

        // Build the query URL
        let url = dojo.byId("inputUrl").value;
        const outSR = _currentMapSR;
        url += "/query?lod=" + lod + "&lodType=" + lodType + "&outSR=" + outSR;
        url += "&lodGeometryAggregationType=" + lodGeometryAggregationType;
        if (dojo.byId("useLodSR") && dojo.byId("useLodSR").checked === true) {
          const lodSR = dijit.byId("lodSR").value;
          url += "&lodSR=" + lodSR;
        }
        url +=  "&returnGeometry=true" + timeParam;


        // TODO - for now, add the spatial filter to the query, only for point geometry layers
        if (_layerInfo && _layerInfo.geometryType && _layerInfo.geometryType === "esriGeometryPoint") {
          const ext = encodeURIComponent(JSON.stringify(_map.extent.toJson()));
          url += "&geometryType=esriGeometryEnvelope&geometry=" + ext;
        }

        url += "&f=pjson";

        if (dojo.byId("useStats").checked === true) {
          const outStatisticsObj = [ {
            "statisticType": dijit.byId("statType").value,
            "onStatisticField": dijit.byId("statField").value,
            "outStatisticFieldName": dijit.byId("statField").value + "_" + dijit.byId("statType").value
          } ];
          const outStatisticsStr = JSON.stringify(outStatisticsObj);
          url += "&outStatistics=" + encodeURIComponent(outStatisticsStr);
        }

        //console.log(url);
        return url;
      }

      /**
       * Toggles the visibility of the aggregation renderer controls
       */
      function toggleUseAggregationRenderer() {
        if (dojo.byId("useAggregationRenderer").checked === true) {
          dojo.byId("aggregationRendererControls").style.display = "block";
        } else {
          dojo.byId("aggregationRendererControls").style.display = "none";
        }

        updateRendererFromUI();
      }

      /**
       * Updates the layer renderer and label based on UI changes
       * This function is called when label-related UI controls are changed
       */
      function updateRendererFromUI() {
        const aggregationLayer = _map.getLayer("aggregations");
        if (!aggregationLayer) {
          console.log("Aggregation layer not found.");
          return;
        }

        // Create and set the bins renderer
        const renderer = dojo.byId("useAggregationRenderer").checked === true ? createAggregationRenderer() : createClassBreakRenderer();
        aggregationLayer.setRenderer(renderer);

        // Create and set the bin labels (if renderLabels is checked)
        if (dojo.byId("renderLabels") && dojo.byId("renderLabels").checked === true) {
          const labelClass = createLabelClass();
          aggregationLayer.setLabelingInfo([labelClass]);
        } else {
          aggregationLayer.setLabelingInfo([]);
        }

        aggregationLayer.refresh();
      }

      /**
       * Updates the aggregation layer based on UI changes
       * This function is called when any UI control that affects the layer is changed
       * @param {boolean} setMapExtent - Whether to set the map extent after updating the layer
       */
      function updateLayerFromUIChange(setMapExtent) {
        // Use current map spatial reference or LOD SR if enabled
        const outputSR = _currentMapSR;
        const sr = new SpatialReference(parseInt(outputSR));
        const mapSR = new SpatialReference(_map.spatialReference.wkid);

        // Remove polygonal aggregation result layer and its labels if they exist
        const polyAggLayer = _map.getLayer("polyAggResult");
        if (polyAggLayer) {
          _map.removeLayer(polyAggLayer);
        }
        const polyAggLabels = _map.getLayer("polyAggLabels");
        if (polyAggLabels) {
          _map.removeLayer(polyAggLabels);
        }

        // Re-create the aggregations layer if it was removed (e.g., by polygonal aggregation)
        if (!_map.getLayer("aggregations")) {
          addAggregationsLayer();
        }

        const url = buildQueryUrlFromUI();
        const request = esriRequest({
          "url": url,
          "handleAs": "json",
          "callbackParamName": "callback"
        });
        request.then(
          function (response) {
            // Defensive: ensure features is always an array
            response.features = Array.isArray(response.features) ? response.features : [];

            const aggregationsLayer = _map.getLayer("aggregations");
            const heatmapLayer = _map.getLayer("heatmap");
            if (!aggregationsLayer || !heatmapLayer)
              return;

            const weightsArray = [];

            // If the output SR is different from map SR, we need to project geometries
            if (parseInt(outputSR) !== _map.spatialReference.wkid) {
              // Project all geometries to map's spatial reference
              const geometriesToProject = [];
              array.forEach(response.features, function(feature) {
                if (feature && feature.geometry) {
                  feature.geometry.spatialReference = sr.toJson();
                  geometriesToProject.push(new Polygon(feature.geometry));
                }
              });

              if (geometriesToProject.length > 0) {
                const projectTask = _gs.project(geometriesToProject, mapSR);
                projectTask.then(function(projectedGeometries) {
                  processProjectedFeatures(response.features, projectedGeometries, weightsArray, setMapExtent);
                }, function(error) {
                  console.log("Error projecting geometries:", error);
                  // Fallback: process without projection
                  processFeatures(response.features, weightsArray, setMapExtent);
                });
              }
            } else {
              // No projection needed
              processFeatures(response.features, weightsArray, setMapExtent);
            }
          },
          function (error) {
            console.log("Error querying the aggregations: ", error.message);
          });
      }

      /**
       * Processes projected features and updates the layers with graphics
       * This function is called after geometries are projected to the map's spatial reference
       * This function creates graphics from the projected geometries and updates the layers with them
       * It also calculates weights based on the selected statistics field and type
       * If heatmap is enabled, it uses the centroid of the geometry
       * If statistics are used, it retrieves the weight from the feature attributes
       * If not, it uses the "Count" attribute as the weight
       * @param {Array} features - The array of features to process
       * @param {Array} projectedGeometries - The array of projected geometries corresponding to the features
       * @param {Array} weightsArray - The array to store weights for each feature
       * @param {boolean} setMapExtent - Whether to set the map extent after updating the layer
       */
      function processProjectedFeatures(features, projectedGeometries, weightsArray, setMapExtent) {
        let newFeatures = Array.isArray(features) ? features : [];

        const graphics = array.map(newFeatures, function (feature, i) {
          let geometry = projectedGeometries[i];

          if (dojo.byId("heatmap").checked === true) {
            geometry = geometry.getCentroid();
          }

          let weight = 0;
          if (dojo.byId("useStats").checked === true) {
            let weightFieldName = dijit.byId("statField").value + "_" + dijit.byId("statType").value;
            weight = feature.attributes[weightFieldName];
          } else {
            weight = feature.attributes["Count"];
          }
          feature.attributes["Weight"] = number.round(weight, 2);
          weightsArray.push(weight);

          const graphic = new Graphic(geometry, null, feature.attributes, null);
          return graphic;
        });

        updateLayersWithGraphics(graphics, weightsArray, setMapExtent);
      }

      function processFeatures(features, weightsArray, setMapExtent) {
        let newFeatures = Array.isArray(features) ? features : [];
        const mapSR = new SpatialReference(_map.spatialReference.wkid);

        // create features (graphics) from the response features
        const graphics = array.map(newFeatures, function (feature, i) {
            // Ensure the geometry has the correct spatial reference that matches the map
            if (feature && feature.geometry) {
              // Set the spatial reference to match the map's spatial reference
              feature.geometry['spatialReference'] = mapSR.toJson();
            }

            // create the polygon
            let geometry = new Polygon(feature.geometry);

            if (dojo.byId("heatmap").checked === true) {
              geometry = geometry.getCentroid();
            }

            let weight = 0;
            if (dojo.byId("useStats").checked === true) {
              const weightFieldName = dijit.byId("statField").value + "_" + dijit.byId("statType").value;
              weight = feature.attributes[weightFieldName];
            } else {
              weight = feature.attributes["Count"];
            }
            feature.attributes["Weight"] = number.round(weight, 2);
            weightsArray.push(weight);

            const graphic = new Graphic(geometry, null, feature.attributes, null);
            return graphic;
        });

        updateLayersWithGraphics(graphics, weightsArray, setMapExtent);
      }

      /**
       * Updates the aggregations and heatmap layers with the provided graphics
       * This function is called after querying the feature layer and processing the features
       * This function updates the selected layer (heatmap or aggregations) with the new graphics
       * It also adjusts the renderer based on the selected layer and updates the map extent if needed
       * If the heatmap layer is selected, it sets the blur radius from the UI control
       * @param {Array} graphics - The array of graphics to update the layers with
       * @param {Array} weightsArray - The array of weights corresponding to the graphics
       * @param {boolean} setMapExtent - Whether to set the map extent after updating the layer
       */
      function updateLayersWithGraphics(graphics, weightsArray, setMapExtent) {
        const aggregationsLayer = _map.getLayer("aggregations");
        const heatmapLayer = _map.getLayer("heatmap");

        // add features to the respective selected layer and adjust renderer
        let selectedLayer = null;
        let otherLayer = null;
        if (dojo.byId("heatmap").checked === true) {
          selectedLayer = heatmapLayer;
          otherLayer = aggregationsLayer;
          heatmapLayer.renderer.setBlurRadius(dojo.byId("blurRadius").value);
        } else {
          selectedLayer = aggregationsLayer;
          otherLayer = heatmapLayer;

          // calculate min and max weight values to adjust heatmap renderer
          _minValue = Math.min.apply(null, weightsArray);
          _maxValue = Math.max.apply(null, weightsArray);
          aggregationsLayer.renderer.normalizationTotal = _maxValue;
        }

        // update features layer with new features (graphics)
        otherLayer.setVisibility(false);
        selectedLayer.clear();
        selectedLayer.setVisibility(true);
        selectedLayer.applyEdits(graphics, null, null)
          .then(function () {
            if (setMapExtent && graphics.length > 0) {
              const layerExtent = graphicsUtils.graphicsExtent(graphics);
              if (layerExtent)
                _map.setExtent(layerExtent.expand(1.0));
            }
            selectedLayer.refresh();

            // Schedule LOD auto-refresh if enabled
            if (dojo.byId("lodAutoRefresh").checked) {
              _lodAutoRefresh = true;
              var intervalSec = parseFloat(dojo.byId("lodRefreshInterval").value) || 1;
              clearTimeout(_lodRefreshInterval);
              _lodRefreshInterval = setTimeout(updateLayerFromUIChange, intervalSec * 1000);
            }
          });
      }

      //#############################################################################################
      // Other Functions
      //#############################################################################################

      /**
       * Initializes (init & update including labels) the time slider for the map
       */
      function initTimeSlider() {
        _timeSlider = new TimeSlider({
          style: "width: 100%;"
        }, dom.byId("timeSlider"));
        _map.setTimeSlider(_timeSlider);
        _timeSlider.setThumbCount(2);
        _timeSlider.createTimeStopsByCount(_layerTimeExtent, 21);
        _timeSlider.setThumbIndexes([0, 21]);
        _timeSlider.setThumbMovingRate(2000);
        _timeSlider.startup();
        _timeSlider.on("time-extent-change", function () {
          if (!_ignoreChangeEvent) {
            _layerTimeExtent = _timeSlider.getCurrentTimeExtent();
            updateLayerFromUIChange();
          };
        });
        // add labels for every other time stop
        const labels = createLabels();
        _timeSlider.setLabels(labels);
      }

      /**
       * Updates the time slider based on the current layer time extent
       */
      function updateTimeSlider() {
        queryLayerTimeExtent();
        setTimeout(function () {
          _timeSlider.createTimeStopsByCount(_layerTimeExtent, 21);
          _timeSlider.setThumbIndexes([0, 21]);
          _timeSlider.startup();
          _map.setTimeSlider(_timeSlider);
          // add labels for every other time stop
          const labels = createLabels();
          _timeSlider.setLabels(labels);
          domStyle.set(dom.byId('timeSlider'), "display", 'block');
          updateLayerFromUIChange();
          _ignoreChangeEvent = false;
        }, 1000);
      }

      /**
       * Creates labels for the time slider based on the time stops
       * This function generates labels for every other time stop in the time slider
       * It formats the date and time for display
       * @returns {Array} An array of formatted labels for the time slider
       */
      function createLabels() {
        const labels = array.map(_timeSlider.timeStops, function (timeStop, i) {
          let hours;
          let minutes;
          let seconds;

          if (i % 2 === 0) {
            if (timeStop.getHours() < 10) {
              hours = "0" + timeStop.getHours();
            } else {
              hours = timeStop.getHours();
            };
            if (timeStop.getMinutes() < 10) {
              minutes = "0" + timeStop.getMinutes();
            } else {
              minutes = timeStop.getMinutes();
            };
            if (timeStop.getSeconds() < 10) {
              seconds = "0" + timeStop.getSeconds();
            } else {
              seconds = timeStop.getSeconds();
            };
            const month = timeStop.getMonth() + 1;
            const day = timeStop.getDate();
            //return hours + ":" + minutes;
            return month + "/" + day + "<br>" + hours + ":" + minutes + ":" + seconds;
          } else {
            return "";
          }
        });
        return labels;
      }

      /**
       * Starts the auto-update process for the layer
       * This function sets a timeout to update the layer every 2 seconds
       * It checks if the live mode is enabled before continuing
       */
      function autoUpdate() {
        setTimeout(function () {
          updateLayerFromUIChange();
          if (_live) {
            autoUpdate();
          }
        }, 2000);
      }

      /**
       * Handles the change event for the basemap dropdown
       * This function updates the map's basemap layer based on the selected URL from the dropdown
       * It removes the existing basemap layer if it exists and adds a new one
       */
      function onSelectedBasemapChanged() {
        // Get the selected basemap URL from the dropdown
        const basemapUrl = dom.byId("basemapUrl").value;
        console.log("Selected basemap URL: ", basemapUrl);

        // Check if the map object is initialized
        if (!_map) {
          console.error("Map object is not initialized.");
          return;
        }

        // Remove the existing basemap layer if it exists
        const basemapLayer = _map.getLayer("basemap");
        if (basemapLayer) {
          console.log("Removing existing basemap layer.");
          _map.removeLayer(basemapLayer);
        }

        // Add the new basemap layer
        let newBasemapLayer;
        if (_isBasemapTiled) {
          newBasemapLayer = new ArcGISTiledMapServiceLayer(basemapUrl, { id: "basemap" });
        } else {
          newBasemapLayer = new ArcGISDynamicMapServiceLayer(basemapUrl, { id: "basemap", opacity: 1.0 });
        }
        _map.addLayer(newBasemapLayer);

        console.log("Basemap updated to: " + basemapUrl);
      }


      //#############################################################################################
      // Initialization
      //#############################################################################################

      // Initialize the map and layers when the DOM is ready
      require(["dojo/domReady!"], function() {
        const basemapDropdown = dom.byId("basemapUrl");
        if (basemapDropdown) {
          // Attach the event listener to the basemap dropdown
          on(basemapDropdown, "change", onSelectedBasemapChanged);
        } else {
          console.warn("Element with ID 'basemapUrl' not found in the DOM.");
        }
      });

      on(dojo.byId("labelOpacity"), "input", function() {
        const slider = dojo.byId("labelOpacity");
        slider.title = Math.round(slider.value * 255);
      });

      // ------------------------------------------------------------------
      // queryFeatures — query a feature service for attributes (no geometry)
      //
      // Parameters:
      //   featureServiceUrl — full URL to the feature layer endpoint
      //   frameImageSubstring — substring to match in frame_image (e.g. "/2026-03-05/22")
      //
      // Returns a Deferred that resolves to the JSON response (with .features array)
      // ------------------------------------------------------------------
      // All features retrieved by the most recent queryFeatures call
      var allFeatures = [];

      function renderFeatures(features) {
        // Open the Video Metadata panel if it is hidden
        var panel = document.getElementById("features-panel");
        if (panel && panel.classList.contains("section-hidden")) {
          panel.classList.remove("section-hidden");
          var toggle = document.getElementById("featuresToggle");
          if (toggle) {
            var icon = toggle.querySelector("i");
            if (icon) icon.className = "fa fa-chevron-up";
          }
        }

        var tbody = document.getElementById("features-table-body");
        var countEl = document.getElementById("features-count");
        if (tbody) {
          tbody.innerHTML = "";
          features.forEach(function (f) {
            var a = f.attributes || {};
            var tr = document.createElement("tr");
            tr.innerHTML =
              "<td>" + (a.object_class || "") + "</td>" +
              "<td>" + (a.track_id != null ? a.track_id : "") + "</td>" +
              "<td>" + (a.confidence_score != null ? Number(a.confidence_score).toFixed(2) : "") + "</td>" +
              "<td>" + (a.depth_m != null ? Number(a.depth_m).toFixed(1) : "") + "</td>";
            tbody.appendChild(tr);
          });
        }
        if (countEl) {
          countEl.innerText = features.length + " features";
        }
      }

      function queryFeatures(featureServiceUrl, frameImageSubstring) {
        const outFields = [
          'camera_id', 'frame_id', 'frame_image', 'track_id',
          'object_class', 'bbox_x1', 'bbox_y1', 'bbox_x2', 'bbox_y2',
          'confidence_score', 'depth_m', 'pts_ms', 'depth_raw_m',
          'geo_confidence', 'geometry_json'
        ].join(',');

        const safeSubstring = frameImageSubstring.replace(/'/g, "''");
        const where = "frame_image LIKE '%" + safeSubstring + "%'";

        // Get token from IdentityManager (same approach as LOD aggregation requests)
        let tokenParam = "";
        const credential = IdentityManager.findCredential(featureServiceUrl);
        if (credential && credential.token) {
          tokenParam = "&token=" + credential.token;
        }

        // Reset for the new query
        allFeatures = [];

        function fetchPage(resultOffset) {
          var url = featureServiceUrl + "/query"
            + "?where=" + encodeURIComponent(where)
            + "&outFields=" + encodeURIComponent(outFields)
            + "&returnGeometry=false"
            + "&orderByFields=" + encodeURIComponent("frame_image ASC")
            + "&resultOffset=" + resultOffset
            + "&f=json"
            + tokenParam;

          console.log("queryFeatures URL (offset=" + resultOffset + "):", url);

          var request = esriRequest({
            url: url,
            handleAs: "json",
            callbackParamName: "callback"
          });

          request.then(
            function (response) {
              console.log("queryFeatures response (offset=" + resultOffset + "):", response);
              var features = Array.isArray(response.features) ? response.features : [];
              allFeatures = allFeatures.concat(features);

              if (response.exceededTransferLimit === true) {
                fetchPage(allFeatures.length);
              } else {
                console.log("queryFeatures complete: " + allFeatures.length + " features loaded");
              }
            },
            function (error) {
              console.error("queryFeatures error:", error);
            }
          );

          return request;
        }

        return fetchPage(0);
      }

      // Return all features from the most recent query
      function getAllFeatures() {
        return allFeatures;
      }

      // Filter features by a predicate function and render the subset.
      // predicate receives each feature object; return true to include.
      // Example: filterFeatures(function(f) { return f.attributes.object_class === 'car'; })
      function filterFeatures(predicate) {
        var subset = allFeatures.filter(predicate);
        renderFeatures(subset);
        return subset;
      }

      // Select features by index range (e.g. "100:120" returns indices 100–119).
      // Renders the subset and returns it.
      function selectFeaturesByRange(rangeStr) {
        var parts = rangeStr.split(':');
        var start = parseInt(parts[0], 10) || 0;
        var end = parts.length > 1 ? parseInt(parts[1], 10) : allFeatures.length;
        if (start < 0) start = 0;
        if (end > allFeatures.length) end = allFeatures.length;
        var subset = allFeatures.slice(start, end);
        renderFeatures(subset);
        return subset;
      }

      // Clear the features table and update the count display
      function clearFeaturesTable() {
        var tbody = document.getElementById("features-table-body");
        var countEl = document.getElementById("features-count");
        if (tbody) tbody.innerHTML = "";
        if (countEl) countEl.innerText = "0 features";
      }

      // Append a single feature row (by allFeatures index) to the bottom
      // of the table and scroll it into view.
      function appendFeature(index) {
        if (index < 0 || index >= allFeatures.length) return;
        var f = allFeatures[index];
        var a = f.attributes || {};
        var tbody = document.getElementById("features-table-body");
        var countEl = document.getElementById("features-count");
        if (!tbody) return;

        // Open the Video Metadata panel if hidden
        var panel = document.getElementById("features-panel");
        if (panel && panel.classList.contains("section-hidden")) {
          panel.classList.remove("section-hidden");
          var toggle = document.getElementById("featuresToggle");
          if (toggle) {
            var icon = toggle.querySelector("i");
            if (icon) icon.className = "fa fa-chevron-up";
          }
        }

        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + (a.object_class || "") + "</td>" +
          "<td>" + (a.track_id != null ? a.track_id : "") + "</td>" +
          "<td>" + (a.confidence_score != null ? Number(a.confidence_score).toFixed(2) : "") + "</td>" +
          "<td>" + (a.depth_m != null ? Number(a.depth_m).toFixed(1) : "") + "</td>";
        tbody.appendChild(tr);

        // Scroll the new row into view
        tr.scrollIntoView({ behavior: "smooth", block: "end" });

        if (countEl) {
          countEl.innerText = tbody.rows.length + " features";
        }
      }

      // ------------------------------------------------------------------
      // Query features by hls_segment field for a specific video segment.
      // segmentPath: e.g. "CalTrans-Camera-199/2026-03-30/16/segment00032.ts"
      // Uses a LIKE clause: hls_segment LIKE '%CalTrans-Camera-199/2026-03-30/16/segment00032.ts'
      // Returns a Promise that resolves with an array of features.
      // ------------------------------------------------------------------
      function queryFeaturesForSegment(featureServiceUrl, segmentPath) {
        var where = "hls_segment LIKE '%" + segmentPath + "'";

        var outFields = [
          'geo_confidence', 'bbox_y1', 'bbox_y2', 'depth_m', 'frame_id',
          'depth_raw_m', 'bbox_x1', 'pts_ms', 'camera_id', 'frame_image',
          'confidence_score', 'object_class', 'track_id', 'bbox_x2',
          'hls_segment_offset_sec', 'hls_segment'
        ].join(',');

        var tokenParam = "";
        var credential = IdentityManager.findCredential(featureServiceUrl);
        if (credential && credential.token) {
          tokenParam = "&token=" + credential.token;
        }

        var collectedFeatures = [];

        return new Promise(function(resolve, reject) {
          function fetchPage(resultOffset) {
            var url = featureServiceUrl + "/query"
              + "?where=" + encodeURIComponent(where)
              + "&outFields=" + encodeURIComponent(outFields)
              + "&orderByFields=" + encodeURIComponent("frame_image")
              + "&outSR=4326"
              + "&returnGeometry=false"
              + "&resultRecordCount=10000"
              + "&resultOffset=" + resultOffset
              + "&f=json"
              + tokenParam;

            console.log("queryFeaturesForSegment URL (offset=" + resultOffset + "):", url);

            esriRequest({
              url: url,
              handleAs: "json",
              callbackParamName: "callback"
            }).then(
              function(response) {
                var features = Array.isArray(response.features) ? response.features : [];
                collectedFeatures = collectedFeatures.concat(features);
                if (response.exceededTransferLimit === true) {
                  fetchPage(collectedFeatures.length);
                } else {
                  console.log("queryFeaturesForSegment complete: " + collectedFeatures.length + " features");
                  resolve(collectedFeatures);
                }
              },
              function(error) {
                console.error("queryFeaturesForSegment error:", error);
                reject(error);
              }
            );
          }
          fetchPage(0);
        });
      }

      window.queryFeaturesForSegment = queryFeaturesForSegment;

      // Append one or more feature objects to the features table.
      // Accepts a single feature or an array of features.
      function appendFeatureRow(features) {
        var list = Array.isArray(features) ? features : [features];
        if (list.length === 0) return;

        var tbody = document.getElementById("features-table-body");
        var countEl = document.getElementById("features-count");
        if (!tbody) return;

        // Open the Video Metadata panel if hidden
        var panel = document.getElementById("features-panel");
        if (panel && panel.classList.contains("section-hidden")) {
          panel.classList.remove("section-hidden");
          var toggle = document.getElementById("featuresToggle");
          if (toggle) {
            var icon = toggle.querySelector("i");
            if (icon) icon.className = "fa fa-chevron-up";
          }
        }

        var lastTr;
        for (var i = 0; i < list.length; i++) {
          var a = list[i].attributes || {};
          var tr = document.createElement("tr");
          tr.innerHTML =
            "<td>" + (a.object_class || "") + "</td>" +
            "<td>" + (a.track_id != null ? a.track_id : "") + "</td>" +
            "<td>" + (a.confidence_score != null ? Number(a.confidence_score).toFixed(2) : "") + "</td>" +
            "<td>" + (a.depth_m != null ? Number(a.depth_m).toFixed(1) : "") + "</td>";
          tbody.appendChild(tr);
          lastTr = tr;
        }

        // Scroll only the last row into view
        if (lastTr) lastTr.scrollIntoView({ behavior: "smooth", block: "end" });

        if (countEl) {
          countEl.innerText = tbody.rows.length + " features";
        }
      }

      // Expose to global scope for media-player.js
      window.queryFeatures = queryFeatures;

      window.getAllFeatures = getAllFeatures;
      window.filterFeatures = filterFeatures;
      window.selectFeaturesByRange = selectFeaturesByRange;
      window.clearFeaturesTable = clearFeaturesTable;
      window.appendFeature = appendFeature;
      window.appendFeatureRow = appendFeatureRow;
      window.renderAllFeatures = function () { renderFeatures(allFeatures); };

      // ------------------------------------------------------------------
      // Dynamic feature layer discovery from ArcGIS REST services endpoint
      // ------------------------------------------------------------------

      // Fetch the services list with token from IdentityManager
      function fetchFeatureServices() {
        console.log("Fetching feature services from:", SERVICES_URL);

        var token = "";
        var credentials = IdentityManager.credentials;
        for (var i = 0; i < credentials.length; i++) {
          if (SERVICES_URL.indexOf(credentials[i].server) !== -1 && credentials[i].token) {
            token = credentials[i].token;
            break;
          }
        }

        if (!token) {
          console.warn("fetchFeatureServices: no token available yet, skipping.");
          return;
        }

        var url = SERVICES_URL + "?f=json&token=" + token;
        var request = esriRequest({
          url: url,
          handleAs: "json",
          callbackParamName: "callback"
        });
        request.then(function (response) {
          featureServices = (response.services || []).filter(function (s) {
            return s.type === "FeatureServer";
          });
          console.log("Fetched " + featureServices.length + " FeatureServer services");
          populateFeatureLayerDropdown();
        }, function (error) {
          console.error("Failed to fetch feature services:", error);
        });
      }

      // Populate the feature layer dropdown from fetched services
      function populateFeatureLayerDropdown() {
        var select = dojo.byId("featureLayerSelect");
        if (!select) return;

        // Preserve current selection if possible
        var currentValue = select.value;

        select.innerHTML = '<option value="">-- Select a Feature Layer --</option>';
        featureServices.forEach(function (s) {
          var opt = document.createElement("option");
          opt.value = s.url + "/0";
          opt.textContent = s.name;
          select.appendChild(opt);
        });

        // Restore previous selection, or select the first available layer
        if (currentValue) {
          select.value = currentValue;
        } else if (featureServices.length > 0) {
          // Auto-select the first feature layer from the list
          var firstLayerUrl = featureServices[0].url + "/0";
          select.value = firstLayerUrl;
          var inputUrl = dojo.byId("inputUrl");
          if (inputUrl) inputUrl.value = firstLayerUrl;

          console.log("------------setInputFeatureLayer------------- " + firstLayerUrl)
          console.log(window.setMediaPlayerFeatureLayerUrl)

          if (window.setMediaPlayerFeatureLayerUrl) {
            window.setMediaPlayerFeatureLayerUrl(firstLayerUrl);
          }
          setFeatureLayers();
          fetchObjectTypes(firstLayerUrl);
        } else {
          var inputUrl = dojo.byId("inputUrl");
          if (inputUrl) select.value = inputUrl.value;
        }
      }

      // When user selects a layer from the dropdown, update inputUrl and refresh
      on(dojo.byId("featureLayerSelect"), "change", function () {
        var select = dojo.byId("featureLayerSelect");
        if (!select || !select.value) return;
        var inputUrl = dojo.byId("inputUrl");
        if (inputUrl) {
          inputUrl.value = select.value;
        }
        setFeatureLayers();
        zoomToLayerExtent(select.value);

        console.log("------------setInputFeatureLayer------------- ", select.value)
        console.log(window.setMediaPlayerFeatureLayerUrl)

        if (window.setMediaPlayerFeatureLayerUrl) {
          window.setMediaPlayerFeatureLayerUrl(select.value);
        }
        fetchObjectTypes(select.value);
      });

      // Resolve a FeatureServer URL for a given camera_id and date.
      // camera_id: e.g. "CalTrans-Camera-276"
      // date: e.g. "2026-03-11"
      // Prefers services with "_PolyAgg" suffix; appends "/0" for the layer index.
      function resolveFeatureLayerUrl(cameraId, date) {
        // Convert camera_id: "CalTrans-Camera-276" → "CalTrans_Camera_276"
        var cameraPrefix = cameraId.replace(/-/g, '_');

        // Convert date: "2026-03-11" → "03112026" (MMDDYYYY)
        var parts = date.split('-');
        var dateStr = parts[1] + parts[2] + parts[0]; // MM + DD + YYYY

        // Find services whose name starts with "{camera}_{date}"
        var prefix = cameraPrefix + '_' + dateStr;
        var matches = featureServices.filter(function (s) {
          return s.name.indexOf(prefix) === 0;
        });

        if (matches.length === 0) return null;

        // Prefer the one with _PolyAgg suffix
        var polyAgg = matches.filter(function (s) {
          return /_PolyAgg\d*$/.test(s.name);
        });

        // Pick the last (latest) PolyAgg match, or fall back to last overall match
        var chosen = polyAgg.length > 0 ? polyAgg[polyAgg.length - 1] : matches[matches.length - 1];
        return chosen.url + "/0";
      }

      window.resolveFeatureLayerUrl = resolveFeatureLayerUrl;

      // Update the input URL, dropdown, and refresh aggregation layers
      // to match a feature layer URL selected via video segment playback.
      function setInputFeatureLayer(featureLayerUrl) {
        var inputUrl = dojo.byId("inputUrl");
        var select = dojo.byId("featureLayerSelect");

        // Skip if already matching
        if (inputUrl && inputUrl.value === featureLayerUrl) return;

        if (inputUrl) inputUrl.value = featureLayerUrl;
        if (select) select.value = featureLayerUrl;

        setFeatureLayers();

        // Sync the media player's feature layer URL
        console.log("------------setInputFeatureLayer------------- " + featureLayerUrl)
        console.log(window.setMediaPlayerFeatureLayerUrl)

        if (window.setMediaPlayerFeatureLayerUrl) {
          window.setMediaPlayerFeatureLayerUrl(featureLayerUrl);
        }

        // Populate video layer object types from the new feature layer
        fetchObjectTypes(featureLayerUrl);
      }

      window.setInputFeatureLayer = setInputFeatureLayer;

      // ------------------------------------------------------------------
      // Video Layer: populate Detected Object Types from feature layer
      // ------------------------------------------------------------------
      function fetchObjectTypes(featureServiceUrl) {
        var tokenParam = "";
        var credentials = IdentityManager.credentials;
        for (var i = 0; i < credentials.length; i++) {
          if (featureServiceUrl.indexOf(credentials[i].server) !== -1 && credentials[i].token) {
            tokenParam = "&token=" + credentials[i].token;
            break;
          }
        }

        // Use returnDistinctValues to get unique object_class values
        var url = featureServiceUrl + "/query"
          + "?where=1%3D1"
          + "&outFields=object_class"
          + "&returnDistinctValues=true"
          + "&returnGeometry=false"
          + "&orderByFields=" + encodeURIComponent("object_class ASC")
          + "&f=json"
          + tokenParam;

        var request = esriRequest({
          url: url,
          handleAs: "json",
          callbackParamName: "callback"
        });
        request.then(function (response) {
          var features = response.features || [];
          var select = dojo.byId("videoObjectType");
          if (!select) return;

          select.innerHTML = '<option value="">All Types</option>';
          features.forEach(function (f) {
            var objClass = (f.attributes && f.attributes.object_class) || "";
            if (objClass) {
              var opt = document.createElement("option");
              opt.value = objClass;
              opt.textContent = objClass;
              select.appendChild(opt);
            }
          });
          console.log("Populated " + features.length + " object types");
        }, function (error) {
          console.error("Failed to fetch object types:", error);
        });
      }

      window.fetchObjectTypes = fetchObjectTypes;

    });
