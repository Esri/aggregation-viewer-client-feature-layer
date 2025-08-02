# Aggregation Viewer - Client Side Feature Layer

A web-based GIS application that performs server-side spatial aggregation of large datasets and renders interactive visualizations using the ArcGIS JavaScript API.

![Flat Hexagon Aggregation](client-flat-hexagon.png?raw=true)

## Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd aggregation-viewer-client-feature-layer

# Start a local web server
python -m http.server 8000

# Open browser to http://localhost:8000
```

📖 **[Installation Guide](INSTALL.md)** | 🛠️ **[Development Guide](DEVELOPMENT.md)** | 🤝 **[Contributing](CONTRIBUTING.md)**

## Overview

This application demonstrates server-side Feature Layer or Map Service Layer spatial aggregation with client-side rendering. It's designed for visualizing large spatial datasets where server-side aggregation improves performance while maintaining rich client-side interactivity.

## Description

The **aggregation-viewer-client-feature-layer** is a web-based Viewer sample application that performs spatial aggregation of large datasets on the server side and renders the results as interactive visualizations on the client side. The application demonstrates server-side Feature Layer or Map Service Layer spatial aggregation query into polygon bins with client-side rendering using the ArcGIS JavaScript API.
This project is ideal for visualizing large spatial datasets where server-side aggregation improves performance while maintaining rich client-side interactivity.

## Use Cases

- **Large dataset visualization** - Millions of points aggregated server-side
- **Real-time monitoring** - Live data feeds with automatic updates
- **Temporal analysis** - Time-series data exploration
- **Multi-projection analysis** - Cross-coordinate system comparison
- **Statistical mapping** - Weighted aggregations with custom field analysis

## Key Features

- The project essentially moves heavy spatial aggregation processing to the server while keeping the visualization and interaction on the client side for better performance with large datasets.
- Sends LOD queries to feature layer and map service layer services to get aggregated polygon features
- Renders results client-side as either polygon graphics or heatmap visualization
- Supports live updates, manual refresh, or time-based replay modes
- **Server-side aggregation** - Processes millions of points efficiently
- **Multiple aggregation types** - GeoHash, GeoTile, H3, Square, Hexagon, Triangle
- **Flexible rendering** - Polygon graphics or heatmap visualization
- **Multi-projection support** - Dynamic coordinate system transformations
- **Time-aware analysis** - Temporal data exploration with replay functionality
- **Interactive controls** - Real-time configuration and basemap switching

## Performance Features

- **Server-side aggregation** - Reduces client processing load
- **Extent-based filtering** - Queries only visible areas
- **Conditional projection** - Projects only when necessary
- **Lazy loading** - Loads components on demand
- **Renderer caching** - Optimizes visualization updates

### Visualization Modes

- **Polygon rendering** - Shows aggregated bins as colored polygons with class breaks
- **Heatmap rendering** - Displays data as heat intensity maps with configurable blur radius
- **Time-aware visualization** - Temporal data analysis with interactive time slider

## Interactive Controls

- **Dynamic layer management** - Runtime feature layer configuration and URL switching
- **Comprehensive basemap gallery switching** - 19+ basemap options including ESRI, USGS, and specialized maps
- **Advanced aggregation settings** - Aggregation style, Level of Detail, auto-offset calculations
- **Statistical analysis** - Field-based weighting, count aggregation, and custom statistics
- **Temporal controls** - Manual, live update, and replay modes with time slider support

## Spatial Reference Support

- **Multiple coordinate systems** - Web Mercator (102100), WGS84 (4326), Albers (102003), UTM zones, State Plane coordinates
    - **Web Mercator (102100)** - Default web mapping projection
    - **WGS84 (4326)** - Geographic coordinate system
    - **Albers (102003)** - Equal-area conic projection
    - **UTM Zones** - Universal Transverse Mercator
    - **State Plane** - US state-specific coordinate systems
- **Real-time transformations** - Dynamic map coordinate system switching with geometry reprojection
- **Geometry service integration** - Server-side projection handling for complex transformations

## Aggregation Styles

| Type | Description                                                                          | Auto Offset |
|------|--------------------------------------------------------------------------------------|-------------|
| **GeoHash** | Geographic hash-based aggregation with configurable precision                   | +0 |
| **GeoTile** | Tile-based aggregation system following web mapping standards                   | +5 |
| **H3** | Uber's hexagonal hierarchical spatial index for optimal coverage                     | +0 |
| **Square** | Square grid aggregation with custom Spatial Reference and LODs                   | +5 |
| **Hexagon** | Flat and Pointy Hexagonal aggrgeation with custom Spatial Reference and LODs    | +5 |
| **Triangle** | Flat and Pointy Triangular aggregation with custom Spatial Reference and LODs  | +4 |

## Visualization Examples

Client side rendering based on server side aggregation by style:

| Aggregation Style | Example                                               |
|-------------------|-------------------------------------------------------|
| **Square**        | ![Square](client-square.png?raw=true)                 |
| **Flat Hexagon**  | ![Hexagon](client-flat-hexagon.png?raw=true)          |
| **Flat Triangle** | ![Triangle](client-flat-triangle.png?raw=true)        |
| **Heatmap**       | ![Heatmap](client-flat-hexagon-heat-map.png?raw=true) |

## File Structure

```
├── index.html                      # Main application
├── featureServiceViewerStyles.css  # Application styles
├── flat/                           # UI theme
│   ├── flat.css                    # Theme entry point
│   ├── flat_dijit.css              # Dojo widget styles
│   ├── dijit/                      # Component styles
│   └── icons/                      # Icon fonts
├── README.md                       # This file
├── INSTALL.md                      # Installation guide
├── DEVELOPMENT.md                  # Development guide
├── CONTRIBUTING.md                 # Contribution guidelines
├── license.txt                     # Apache 2.0 license
└── .gitignore                      # Git ignore patterns
```
## Documentation

| Document | Description |
|----------|-------------|
| **[INSTALL.md](INSTALL.md)** | Complete installation and deployment guide |
| **[DEVELOPMENT.md](DEVELOPMENT.md)** | Development environment and coding guidelines |
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | Contribution guidelines and standards |

## Technical Stack

- **ArcGIS JavaScript API 3.46** - Core mapping framework
- **Dojo Framework 1.x** - UI components and module system
- **Custom Flat UI Theme** - Material Design-inspired styling
- **HTML5/CSS3** - Modern web standards

## Browser Compatibility

- **Chrome 60+** ✅
- **Firefox 55+** ✅
- **Safari 11+** ✅
- **Edge 79+** ✅
- **IE 11** ⚠️ Limited support

## Issues & Support

Found a bug or want to request a feature? Please [submit an issue](../../issues).

## Contributing

Esri welcomes contributions from anyone and everyone. Please see our [contribution guidelines](CONTRIBUTING.md) and [development guide](DEVELOPMENT.md) for details.

## License

Copyright 2017 Esri

Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

A copy of the license is available in the repository's [license.txt](license.txt) file.
