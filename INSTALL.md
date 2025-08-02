# Installation Guide

This guide will help you set up and run the aggregation-viewer-client-feature-layer application.

## Prerequisites

### System Requirements
- **Web Server** - Any HTTP server (Apache, Nginx, IIS, or simple development server)
- **Modern Web Browser** - Chrome 60+, Firefox 55+, Safari 11+, Edge 79+
- **Internet Connection** - Required for ArcGIS JavaScript API and basemap services

### Dependencies
- **ArcGIS JavaScript API 3.46** - Loaded via CDN
- **Font Awesome** - Loaded via CDN for icons
- **Dojo Framework** - Included with ArcGIS JS API

## Installation Methods

### Method 1: Simple File Server (Recommended for Development)

1. **Clone or Download the Repository**
   ```bash
   git clone <repository-url>
   cd aggregation-viewer-client-feature-layer
   ```

2. **Start a Local Web Server**
   
   **Using Python 3:**
   ```bash
   python -m http.server 8000
   ```
   
   **Using Python 2:**
   ```bash
   python -m SimpleHTTPServer 8000
   ```
   
   **Using Node.js (if you have it installed):**
   ```bash
   npx http-server -p 8000
   ```
   
   **Using PHP:**
   ```bash
   php -S localhost:8000
   ```

3. **Access the Application**
   Open your browser and navigate to: `http://localhost:8000`

### Method 2: Apache Web Server

1. **Copy Files to Web Directory**
   ```bash
   cp -r aggregation-viewer-client-feature-layer/ /var/www/html/
   ```

2. **Set Permissions (Linux/Mac)**
   ```bash
   chmod -R 755 /var/www/html/aggregation-viewer-client-feature-layer/
   ```

3. **Access the Application**
   Navigate to: `http://localhost/aggregation-viewer-client-feature-layer/`

### Method 3: IIS (Windows)

1. **Copy Files to IIS Directory**
   Copy the project folder to `C:\inetpub\wwwroot\`

2. **Configure IIS Site**
   - Open IIS Manager
   - Create new site pointing to the project directory
   - Set appropriate permissions

3. **Access the Application**
   Navigate to your configured IIS site URL

## Configuration

### Default Settings
The application comes with default configuration:
- **Default Layer**: FAA airports service
- **Default Basemap**: Topographic
- **Default Spatial Reference**: Web Mercator (102100)
- **Default LOD**: 3

### Customizing Default Layer
Edit `index.html` and modify the default URL:
```javascript
value="https://your-service-url/MapServer/0"
```

### CORS Configuration
If you encounter CORS issues, add your server to the allowed origins in `index.html`:
```javascript
esri.config.defaults.io.corsEnabledServers.push('https://your-server.com');
```

## Verification

### Test Basic Functionality
1. **Map Loads**: Verify the map displays with the default basemap
2. **Layer Loading**: Test loading the default FAA airports layer
3. **Aggregation**: Try different aggregation types (Square, Hexagon, etc.)
4. **Basemap Switching**: Test switching between different basemaps
5. **Time Slider**: If temporal data is available, test the time slider functionality

### Common Issues and Solutions

#### Issue: Blank Map
- **Cause**: CORS restrictions or network connectivity
- **Solution**: Check browser console for errors, verify internet connection

#### Issue: Layer Won't Load
- **Cause**: Invalid service URL or service unavailable
- **Solution**: Verify the service URL is accessible and supports aggregation queries

#### Issue: Styling Issues
- **Cause**: Missing CSS files or incorrect paths
- **Solution**: Verify all CSS files are present in the `flat/` directory

#### Issue: JavaScript Errors
- **Cause**: ArcGIS API loading issues
- **Solution**: Check internet connection and CDN availability

## Browser Compatibility

### Fully Supported
- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

### Limited Support
- Internet Explorer 11 (with polyfills)

### Mobile Support
- iOS Safari 11+
- Chrome Mobile 60+
- Samsung Internet 7+

## Security Considerations

### HTTPS Deployment
For production deployment, ensure:
- Use HTTPS for all external service calls
- Configure proper SSL certificates
- Update service URLs to use HTTPS endpoints

### Content Security Policy
Consider implementing CSP headers:
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self' https://js.arcgis.com https://use.fontawesome.com;">
```

## Performance Optimization

### Production Deployment
1. **Enable Gzip Compression** on your web server
2. **Set Proper Cache Headers** for static assets
3. **Use CDN** for faster asset delivery
4. **Minify CSS/JS** if making custom modifications

### Large Dataset Handling
- Use appropriate LOD levels for your data scale
- Consider server-side caching for frequently accessed aggregations
- Monitor network requests and optimize query parameters

## Troubleshooting

### Enable Debug Mode
Add debug parameters to see detailed logging:
```javascript
// Add to your JavaScript console
esri.config.defaults.io.corsDetection = false;
```

### Check Network Requests
Use browser developer tools to monitor:
- Failed HTTP requests
- CORS errors
- Service response times
- JavaScript console errors

### Common Error Messages
- **"Unable to load service"**: Check service URL and network connectivity
- **"CORS error"**: Add service domain to CORS enabled servers
- **"Projection failed"**: Verify spatial reference compatibility

For additional support, check the browser console for detailed error messages and refer to the ArcGIS JavaScript API documentation.