# Aggregation Viewer - Client Side Feature Layer

Sample JavaScript Feature and Map Service Layer Aggregation Viewer, using aggregation (lod) queries against Feature or Map Service Layers, aggregating features server side, returning aggregated bins (polygon features) and rendering those aggregation bins client side.

## Description

The **aggregation-viewer-client-feature-layer** is a web-based Viewer sample application that performs spatial aggregation of large datasets on the server side and renders the results as interactive visualizations on the client side. The application demonstrates server-side Feature Layer or Map Service Layer spatial aggregation query into polygon bins with client-side rendering using the ArcGIS JavaScript API.
This project is ideal for visualizing large spatial datasets where server-side aggregation improves performance while maintaining rich client-side interactivity.

## Use Cases
- **Large dataset visualization** - Millions of points aggregated server-side
- **Real-time monitoring** - Live data feeds with automatic updates
- **Temporal analysis** - Time-series data exploration with replay functionality
- **Multi-projection analysis** - Cross-coordinate system data comparison
- **Statistical mapping** - Weighted aggregations with custom field analysis

This project demonstrates best practices for handling large spatial datasets while maintaining interactive performance through intelligent server-side processing and optimized client-side rendering.

## Getting Started

### Installation
For detailed installation instructions, including multiple deployment methods and configuration options, see [INSTALL.md](INSTALL.md).

### Development
For development environment setup, code organization, debugging techniques, and contribution guidelines, see [DEVELOPMENT.md](DEVELOPMENT.md).

### Quick Setup
```bash
# Clone the repository
git clone <repository-url>
cd aggregation-viewer-client-feature-layer

# Start a local web server
python -m http.server 8000

# Open browser to http://localhost:8000
```
### Documentation

- **[INSTALL.md](INSTALL.md)** - Complete installation and deployment guide
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Development environment setup and coding guidelines
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - How to contribute to the project

### Key Features
- Uses ArcGIS JavaScript API 3.46 with Dojo framework
- Sends LOD queries to feature services to get aggregated polygon features
- Renders results client-side as either polygon graphics or heatmap visualization
- Supports live updates, manual refresh, or time-based replay modes
- The project essentially moves heavy spatial aggregation processing to the server while keeping the visualization and interaction on the client side for better performance with large datasets.
- Server-side aggregation: Queries feature/map service layers with aggregation (LOD) parameters to get pre-aggregated spatial bins
- Multiple aggregation types: Supports GeoHash, GeoTile, H3, Square, Hexagon (flat/pointy), and Triangle (flat/pointy) aggregation patterns
- Flexible rendering: Can display aggregated polygons or heatmaps based on the aggregated data
- Spatial reference support: Handles coordinate system transformations between different spatial reference systems
- Time-aware: Includes time slider functionality for temporal data analysis
- Interactive controls: UI panel for configuring aggregation settings, basemaps, and visualization options

#### Spatial Aggregation Types
- **GeoHash** - Geographic hash-based aggregation with configurable precision
- **GeoTile** - Tile-based aggregation system following web mapping standards
- **H3** - Uber's hexagonal hierarchical spatial index for optimal coverage
- **Square** - Square grid aggregation with customizable cell sizes
- **Hexagon** - Flat and pointy orientations for hexagonal binning
- **Triangle** - Flat and pointy orientations for triangular tessellation

#### Visualization Modes
- **Polygon rendering** - Shows aggregated bins as colored polygons with class breaks
- **Heatmap rendering** - Displays data as heat intensity maps with configurable blur radius
- **Time-aware visualization** - Temporal data analysis with interactive time slider

#### Spatial Reference Support
- **Multiple coordinate systems** - Web Mercator (102100), WGS84 (4326), Albers (102003), UTM zones, State Plane coordinates
- **Real-time transformations** - Dynamic map coordinate system switching with geometry reprojection
- **Geometry service integration** - Server-side projection handling for complex transformations

#### Interactive Controls
- **Dynamic layer management** - Runtime feature layer configuration and URL switching
- **Comprehensive basemap gallery switching** - 19+ basemap options including ESRI, USGS, and specialized maps
- **Advanced aggregation settings** - Aggregation style, Level of Detail, auto-offset calculations
- **Statistical analysis** - Field-based weighting, count aggregation, and custom statistics
- **Temporal controls** - Manual, live update, and replay modes with time slider support

## Examples

Client side rendering based on server side Flat Hexagon aggregation:

![App](client-flat-hexagon.png?raw=true)

Client side rendering based on server side Square aggregation:

![alt text](client-square.png?raw=true)

Client side rendering based on server side Flat Triangle aggregation:

![alt text](client-flat-triangle.png?raw=true)

Client side Heat Map rendering based on server side Flat Hexagon aggregation:

![alt text](client-flat-hexagon-heat-map.png?raw=true)

## Configuration Options

### Aggregation Settings
- **LOD Levels** - With auto-offset calculations per aggregation type
- **Auto Offset Values** - GeoHash: 0, GeoTile/Square/Hexagon: +5, Triangle: +4, H3: 0
- **Sub-types** - Shape (full geometry) vs Centroid (point representation)
- **Custom LOD Spatial Reference** - Allows the user to choose the spatial reference index to use for the LOD aggregation bins, rather than using the map's spatial reference.

### Basemap Options
- **ESRI Online Services** - Topographic, Streets, Imagery, Terrain, Ocean
- **Specialized Maps** - National Geographic, Navigation Charts, Transportation
- **USGS Services** - National Map, Imagery, Hydro, Topo maps
- **Canvas Styles** - Light/Dark Gray for minimal distraction

### Statistical Analysis
- **Weight Fields** - Custom field selection for aggregation weighting
- **Statistical Types** - Count, Sum, Average, Min, Max operations
- **Normalization** - Dynamic range calculation for optimal visualization

## Technical Architecture

### Core JavaScript Modules
- **Map Management** - `buildMap()`, extent handling, layer lifecycle management
- **Query Engine** - LOD-based aggregation queries with spatial filtering
- **Geometry Processing** - Multi-projection support, centroid calculation, extent management
- **Renderer System** - Dynamic class breaks, heatmap configuration, normalization
- **Time Integration** - TimeSlider widget with custom labeling and extent management

### Data Processing Pipeline
1. **Server-side aggregation** - REST queries with LOD parameters (`lod`, `lodType`, `lodSubType`)
2. **Spatial filtering** - Envelope-based extent queries
3. **Coordinate transformation** - Geometry service projection between spatial references
4. **Client-side rendering** - Graphics layer updates with optimized renderers and labels
5. **Interactive feedback** - Real-time updates based on extent changes and user input

### Performance Optimizations
- **Server-side aggregation** - Reduces client-side processing load and large payloads
- **Conditional geometry projection** - Only projects when spatial references differ
- **Lazy loading** - Time slider initialization on demand
- **Extent-based filtering** - Spatial queries filtered to the current map extent view
- **Renderer caching** - Reuses renderers with updated normalization values

## File Structure and Dependencies

```
├── index.html                         # Main application (embedded JavaScript)
├── featureServiceViewerStyles.css     # Application-specific styles
├── flat/                              # Flat UI theme directory
│   ├── flat.css                       # Main theme imports
│   ├── flat_dijit.css                 # Base Dojo widget styles
│   ├── dijit/                         # Widget-specific styling
│   │   ├── Common.css                 # Shared component styles
│   │   ├── Dialog.css                 # Modal and tooltip styles
│   │   ├── Menu.css                   # Menu component styles
│   │   └── form/                      # Form control styles
│   └── icons/                         # Icon font and styles
├── README.md                          # Project documentation
├── INSTALL.md                         # Installation and setup guide
├── DEVELOPMENT.md                     # Development environment and contribution guide
├── CONTRIBUTING.md                    # Contribution guidelines
├── license.txt                        # Apache 2.0 license
└── .gitignore                         # Git ignore patterns
```

## Issues

Find a bug or want to request a new feature? Please let us know by submitting an issue.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and the the detailed [DEVELOPMENT.md](DEVELOPMENT.md) guide for development setup and coding standards.

## License
Copyright 2017 Esri

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

A copy of the license is available in the repository's [license.txt](license.txt?raw=true) file.
