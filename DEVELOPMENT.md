# Development Guide

This guide covers development setup, architecture, and contribution guidelines for the aggregation-viewer-client-feature-layer project.

## Development Environment Setup

### Prerequisites
- **Code Editor**: VS Code, WebStorm, or similar with JavaScript support
- **Web Browser**: Chrome/Firefox with developer tools
- **Git**: For version control
- **Local Web Server**: Python, Node.js, or similar

### Recommended VS Code Extensions
- **ES6 String HTML**: Syntax highlighting for HTML in template literals
- **Dojo**: Dojo framework support
- **Live Server**: Auto-reload development server
- **Prettier**: Code formatting
- **ESLint**: JavaScript linting

### Development Server Setup
```bash
# Clone repository
git clone <repository-url>
cd aggregation-viewer-client-feature-layer

# Start development server
python -m http.server 8000
# or
npx live-server --port=8000
```

## Project Architecture

### File Structure
```
├── index.html                          # Main application entry point
├── featureServiceViewerStyles.css      # Application-specific styles
├── flat/                              # Flat UI theme
│   ├── flat.css                       # Theme entry point
│   ├── flat_dijit.css                 # Base Dojo widget styles
│   ├── dijit/                         # Widget-specific styles
│   │   ├── Common.css                 # Shared component styles
│   │   ├── Dialog.css                 # Modal and dialog styles
│   │   ├── Menu.css                   # Menu component styles
│   │   └── form/                      # Form control styles
│   └── icons/                         # Icon fonts and styles
├── README.md                          # Project documentation
├── INSTALL.md                         # Installation guide
├── DEVELOPMENT.md                     # This file
├── CONTRIBUTING.md                    # Contribution guidelines
├── license.txt                        # Apache 2.0 license
└── .gitignore                         # Git ignore patterns
```

### Technology Stack

#### Core Technologies
- **ArcGIS JavaScript API 3.46**: GIS mapping framework
- **Dojo Framework 1.x**: UI components and module system
- **HTML5/CSS3**: Modern web standards
- **ES5 JavaScript**: Compatible with older browsers

#### Key Dependencies
- **Font Awesome**: Icon library
- **Material Design Icons**: Custom icon font
- **Esri Geometry Service**: Coordinate transformations

### Code Organization

#### Main Application (`index.html`)
The application is structured as a single-page application with embedded JavaScript:

```javascript
require([
  // Dojo modules
  "dojo/parser", "dojo/dom", "dojo/on",
  // Esri modules  
  "esri/map", "esri/layers/FeatureLayer",
  // Custom modules
], function(parser, dom, on, Map, FeatureLayer) {
  // Application logic
});
```

#### Key Functions
- **`buildMap(extent)`**: Initializes the map with specified extent
- **`updateLayerFromUIChange()`**: Handles UI-triggered layer updates
- **`processProjectedFeatures()`**: Processes aggregated feature results
- **`initTimeSlider()`**: Initializes temporal controls
- **`createRenderer()`**: Builds visualization renderers

#### Event Handling
```javascript
// UI event binding pattern
on(dom.byId("elementId"), "click", function() {
  // Handle event
});
```

## Development Workflow

### Making Changes

#### 1. CSS Modifications
- Edit `featureServiceViewerStyles.css` for application styles
- Modify `flat/` directory files for theme changes
- Use browser dev tools for live CSS debugging

#### 2. JavaScript Development
- All JavaScript is embedded in `index.html`
- Use browser console for debugging
- Add `console.log()` statements for troubleshooting

#### 3. Testing Changes
```bash
# Start development server
python -m http.server 8000

# Open browser to
http://localhost:8000

# Use browser dev tools for debugging
```

### Debugging Techniques

#### Browser Developer Tools
- **Console**: View JavaScript errors and debug output
- **Network**: Monitor service requests and responses
- **Elements**: Inspect DOM and CSS changes
- **Sources**: Set breakpoints in JavaScript code

#### Common Debug Patterns
```javascript
// Log function entry
console.log("Function called:", arguments);

// Log variable values
console.log("Variable state:", variableName);

// Log service responses
request.then(function(response) {
  console.log("Service response:", response);
});
```

#### ArcGIS API Debugging
```javascript
// Enable detailed logging
esri.config.defaults.io.corsDetection = false;

// Log map events
map.on("load", function() {
  console.log("Map loaded successfully");
});
```

### Code Style Guidelines

#### JavaScript Conventions
- Use camelCase for variables and functions
- Use PascalCase for constructors
- Prefix private variables with underscore: `_privateVar`
- Use meaningful variable names
- Add comments for complex logic

#### CSS Conventions
- Use kebab-case for class names
- Group related styles together
- Use consistent indentation (2 spaces)
- Comment complex selectors

#### HTML Structure
- Use semantic HTML elements
- Maintain consistent indentation
- Add meaningful IDs and classes
- Include accessibility attributes

### Adding New Features

#### 1. New Aggregation Type
```javascript
// Add to aggregation type options
var newAggregationType = {
  value: "newType",
  label: "New Aggregation Type"
};

// Update query parameters
var queryParams = {
  lod: currentLOD,
  lodType: "newType",
  // additional parameters
};
```

#### 2. New Basemap Option
```javascript
// Add to basemap configuration
var newBasemap = new ArcGISTiledMapServiceLayer(
  "https://services.arcgisonline.com/arcgis/rest/services/NewBasemap/MapServer"
);
```

#### 3. New UI Control
```html
<!-- Add HTML element -->
<div class="input-group">
  <label for="newControl">New Control</label>
  <input type="text" id="newControl" />
</div>
```

```javascript
// Add event handler
on(dom.byId("newControl"), "change", function() {
  // Handle change
});
```

### Performance Considerations

#### Optimization Strategies
- **Minimize DOM queries**: Cache DOM references
- **Debounce user input**: Prevent excessive API calls
- **Use appropriate LOD levels**: Balance detail vs performance
- **Implement lazy loading**: Load components when needed

#### Memory Management
```javascript
// Clean up event handlers
if (existingHandler) {
  existingHandler.remove();
}

// Clear graphics layers
graphicsLayer.clear();

// Remove map layers
map.removeLayer(layer);
```

### Testing

#### Manual Testing Checklist
- [ ] Map loads with default extent
- [ ] Layer URL input accepts valid services
- [ ] Aggregation types render correctly
- [ ] Basemap switching works
- [ ] Time slider functions (if applicable)
- [ ] Spatial reference transformations work
- [ ] Error handling displays appropriate messages

#### Cross-Browser Testing
- Test in Chrome, Firefox, Safari, Edge
- Verify mobile responsiveness
- Check console for JavaScript errors
- Validate CSS rendering consistency

### Common Development Issues

#### CORS Errors
```javascript
// Add development server to CORS whitelist
esri.config.defaults.io.corsEnabledServers.push('http://localhost:8000');
```

#### Service Connectivity
```javascript
// Test service availability
esri.request({
  url: serviceUrl,
  content: { f: "json" }
}).then(function(response) {
  console.log("Service accessible:", response);
});
```

#### Styling Issues
- Check CSS file paths and imports
- Verify flat theme files are present
- Use browser dev tools to inspect computed styles

### Build and Deployment

#### Development Build
No build process required - direct file serving

#### Production Preparation
1. **Minify CSS** (optional)
2. **Optimize images** 
3. **Configure web server** for proper MIME types
4. **Set up HTTPS** for production deployment
5. **Configure CSP headers** for security

### Contributing

#### Before Making Changes
1. Check existing issues and pull requests
2. Create feature branch from main
3. Follow coding conventions
4. Test thoroughly across browsers

#### Submitting Changes
1. Create descriptive commit messages
2. Update documentation if needed
3. Test all functionality
4. Submit pull request with detailed description

For more information, see [CONTRIBUTING.md](CONTRIBUTING.md).

### Resources

#### Documentation
- [ArcGIS JavaScript API 3.46 Documentation](https://developers.arcgis.com/javascript/3/)
- [Dojo Framework Documentation](https://dojotoolkit.org/documentation/)
- [Material Design Guidelines](https://material.io/design/)

#### Tools
- [ArcGIS REST Services Directory](https://services.arcgisonline.com/arcgis/rest/services)
- [Spatial Reference Database](https://spatialreference.org/)
- [Browser Developer Tools Documentation](https://developer.mozilla.org/en-US/docs/Tools)