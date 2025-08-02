# aggregation-viewer-client-feature-layer

Sample JavaScript Feature and Map Service Layer Aggregation Viewer, using aggregation (lod) queries against Feature or Map Service Layers, aggregating features server side, returning aggregated bins (polygon features) and rendering those aggregation bins client side.

Client side rendering based on server side Flat Hexagon aggregation:

![App](client-flat-hexagon.png?raw=true)

Client side rendering based on server side Square aggregation:

![alt text](client-square.png?raw=true)

Client side rendering based on server side Flat Triangle aggregation:

![alt text](client-flat-triangle.png?raw=true)

Client side Heat Map rendering based on server side Flat Hexagon aggregation:

![alt text](client-flat-hexagon-heat-map.png?raw=true)

## Description

The aggregation-viewer-client-feature-layer is a JavaScript Feature and Map Service Layer Aggregation Viewer that demonstrates server-side spatial aggregation with client-side rendering using the ArcGIS JavaScript API.

## Project Overview

**aggregation-viewer-client-feature-layer** is a web-based GIS application that performs spatial aggregation of large datasets on the server side and renders the results as interactive visualizations on the client side.

### Key Features:

- Server-side aggregation: Queries feature/map service layers with aggregation (LOD) parameters to get pre-aggregated spatial bins
- Multiple aggregation types: Supports GeoHash, GeoTile, H3, Square, Hexagon (flat/pointy), and Triangle (flat/pointy) aggregation patterns
- Flexible rendering: Can display aggregated polygons or heatmaps based on the aggregated data
- Spatial reference support: Handles coordinate system transformations between different spatial reference systems
- Time-aware: Includes time slider functionality for temporal data analysis
- Interactive controls: UI panel for configuring aggregation settings, basemaps, and visualization options

### Features

- Uses ArcGIS JavaScript API 3.46 with Dojo framework
- Sends LOD queries to feature services to get aggregated polygon features
- Renders results client-side as either polygon graphics or heatmap visualization
- Supports live updates, manual refresh, or time-based replay modes
- The project essentially moves heavy spatial aggregation processing to the server while keeping the visualization and interaction on the client side for better performance with large datasets.

#### Spatial Aggregation Types
- **GeoHash** - Geographic hash-based aggregation
- **GeoTile** - Tile-based aggregation system
- **H3** - Uber's hexagonal hierarchical spatial index
- **Square** - Square grid aggregation
- **Hexagon** (flat/pointy orientations)
- **Triangle** (flat/pointy orientations)

#### Visualization Modes
- **Polygon rendering** - Shows aggregated bins as colored polygons
- **Heatmap rendering** - Displays data as heat intensity maps
- **Time-aware visualization** - Temporal data analysis with time slider

#### Spatial Reference Support
- Multiple coordinate systems (Web Mercator, WGS84, Albers, UTM, State Plane, etc.)
- Real-time coordinate system transformations
- Geometry service integration for projections

#### Interactive Controls
- **Layer management** - Dynamic feature layer configuration
- **Basemap switching** - Multiple basemap options
- **Aggregation settings** - LOD levels, aggregation types, and sub-types
- **Statistics configuration** - Field-based weighting and calculations
- **Time controls** - Manual, live, and replay modes

## Technical Architecture

### Frontend Stack
- **ArcGIS JavaScript API 3.46** - Core mapping framework
- **Dojo Framework** - UI components and module system
- **Custom CSS themes** - Flat design styling

### Core Components
- **Map management** (`buildMap()`, spatial reference handling)
- **Feature layer querying** (LOD-based aggregation queries)
- **Geometry processing** (projection, centroid calculation)
- **Renderer management** (heatmap, class breaks)
- **Time slider integration** (temporal data analysis)

### Data Flow
1. **Server-side aggregation** - Queries feature services with LOD parameters
2. **Spatial projection** - Transforms geometries between coordinate systems
3. **Client-side rendering** - Displays aggregated results as graphics
4. **Interactive updates** - Real-time visualization updates based on user input

## File Structure
- `index.html` - Main application with embedded JavaScript
- `featureServiceViewerStyles.css` - Application-specific styles
- `flat/` - Flat UI theme directory with Dojo widget styling
- `README.md` - Project documentation

This project is ideal for visualizing large spatial datasets where server-side aggregation improves performance while maintaining rich client-side interactivity.

## Issues

Find a bug or want to request a new feature?  Please let us know by submitting an issue.

## Contributing

Esri welcomes contributions from anyone and everyone. Please see our [guidelines for contributing](https://github.com/esri/contributing).

## Licensing
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
