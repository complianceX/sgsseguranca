#!/bin/bash

# SSL Certificate Setup Script for Let's Encrypt
# This script helps you obtain SSL certificates using Certbot

set -e

echo "🔒 SSL Certificate Setup Script"
echo "================================"
echo ""

# Check if domain is provided
if [ -z "$1" ]; then
    echo "❌ Error: Domain name is required"
    echo ""
    echo "Usage: ./init-ssl.sh your-domain.com your-email@example.com"
    echo ""
    echo "Example: ./init-ssl.sh api.example.com admin@example.com"
    exit 1
fi

if [ -z "$2" ]; then
    echo "❌ Error: Email is required"
    echo ""
    echo "Usage: ./init-ssl.sh your-domain.com your-email@example.com"
    exit 1
fi

DOMAIN=$1
EMAIL=$2

echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo ""

# Create directories for certbot
echo "📁 Creating directories..."
mkdir -p ./certbot/conf
mkdir -p ./certbot/www

# Check if docker-compose is running
if ! docker-compose ps | grep -q "nginx"; then
    echo "⚠️  Nginx container is not running. Starting services..."
    docker-compose up -d
    sleep 5
fi

echo ""
echo "🔐 Obtaining SSL certificate from Let's Encrypt..."
echo ""

# Run certbot to obtain certificate
docker-compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ SSL certificate obtained successfully!"
    echo ""
    echo "📝 Next steps:"
    echo "1. Update backend/nginx/nginx.conf:"
    echo "   - Change 'server_name _;' to 'server_name $DOMAIN;'"
    echo "   - Change 'your-domain.com' to '$DOMAIN' in SSL certificate paths"
    echo "   - Uncomment the redirect in HTTP server block"
    echo ""
    echo "2. Restart nginx:"
    echo "   docker-compose restart nginx"
    echo ""
    echo "3. Test your HTTPS connection:"
    echo "   https://$DOMAIN"
    echo ""
    echo "🔄 Certificate will auto-renew every 12 hours via certbot container"
else
    echo ""
    echo "❌ Failed to obtain SSL certificate"
    echo ""
    echo "Common issues:"
    echo "- Domain DNS not pointing to this server"
    echo "- Port 80 not accessible from internet"
    echo "- Firewall blocking connections"
    echo ""
    echo "Troubleshooting:"
    echo "1. Verify DNS: dig $DOMAIN"
    echo "2. Check port 80: curl http://$DOMAIN/.well-known/acme-challenge/test"
    echo "3. Check nginx logs: docker-compose logs nginx"
    exit 1
fi
