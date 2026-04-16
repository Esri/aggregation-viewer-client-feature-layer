FROM nginx:alpine

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy webapp files
COPY index.html /usr/share/nginx/html/
COPY featureServiceViewerStyles.css /usr/share/nginx/html/
COPY javascript/ /usr/share/nginx/html/javascript/
COPY flat/ /usr/share/nginx/html/flat/
COPY license.txt /usr/share/nginx/html/

# Copy image assets
COPY client-flat-hexagon-heat-map.png /usr/share/nginx/html/
COPY client-flat-hexagon.png /usr/share/nginx/html/
COPY client-flat-triangle.png /usr/share/nginx/html/
COPY client-square.png /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
