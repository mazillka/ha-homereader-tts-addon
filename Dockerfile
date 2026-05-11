FROM nginx:alpine

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy application static files
COPY index.html index.css app.js /usr/share/nginx/html/

# Expose the ingress port
EXPOSE 8099
