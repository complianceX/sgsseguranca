#!/bin/bash

# Database Backup Script
# Creates encrypted backups of PostgreSQL database

set -e

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="db_backup_${DATE}.sql.gz"
ENCRYPTED_FILE="${BACKUP_FILE}.enc"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

echo "🗄️  Starting database backup..."
echo "Timestamp: $DATE"
echo ""

# Get database credentials from environment
DB_HOST=${DATABASE_HOST:-db}
DB_PORT=${DATABASE_PORT:-5432}
DB_NAME=${DATABASE_NAME:-sst}
DB_USER=${DATABASE_USER:-sst_user}
DB_PASSWORD=${DATABASE_PASSWORD}

if [ -z "$DB_PASSWORD" ]; then
    echo "❌ Error: DATABASE_PASSWORD not set"
    exit 1
fi

# Create backup
echo "📦 Creating backup..."
PGPASSWORD=$DB_PASSWORD pg_dump \
    -h $DB_HOST \
    -p $DB_PORT \
    -U $DB_USER \
    -d $DB_NAME \
    --no-owner \
    --no-acl \
    | gzip > "$BACKUP_DIR/$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Backup created: $BACKUP_FILE"
    
    # Get file size
    SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
    echo "📊 Backup size: $SIZE"
else
    echo "❌ Backup failed"
    exit 1
fi

# Encrypt backup if encryption key is available
if [ ! -z "$BACKUP_SECRET_KEY" ]; then
    echo ""
    echo "🔐 Encrypting backup..."
    openssl enc -aes-256-cbc \
        -salt \
        -in "$BACKUP_DIR/$BACKUP_FILE" \
        -out "$BACKUP_DIR/$ENCRYPTED_FILE" \
        -k "$BACKUP_SECRET_KEY"
    
    if [ $? -eq 0 ]; then
        echo "✅ Backup encrypted: $ENCRYPTED_FILE"
        # Remove unencrypted backup
        rm "$BACKUP_DIR/$BACKUP_FILE"
        FINAL_FILE=$ENCRYPTED_FILE
    else
        echo "⚠️  Encryption failed, keeping unencrypted backup"
        FINAL_FILE=$BACKUP_FILE
    fi
else
    echo "⚠️  BACKUP_SECRET_KEY not set, backup not encrypted"
    FINAL_FILE=$BACKUP_FILE
fi

echo ""
echo "🧹 Cleaning old backups (keeping last 30 days)..."
find $BACKUP_DIR -name "db_backup_*.sql.gz*" -mtime +30 -delete

echo ""
echo "✅ Backup completed successfully!"
echo "📁 Backup location: $BACKUP_DIR/$FINAL_FILE"
echo ""
echo "💡 To restore this backup:"
if [ "$FINAL_FILE" = "$ENCRYPTED_FILE" ]; then
    echo "1. Decrypt: openssl enc -aes-256-cbc -d -in $FINAL_FILE -out backup.sql.gz -k \$BACKUP_SECRET_KEY"
    echo "2. Restore: gunzip -c backup.sql.gz | psql -h \$DB_HOST -U \$DB_USER -d \$DB_NAME"
else
    echo "gunzip -c $BACKUP_DIR/$FINAL_FILE | psql -h \$DB_HOST -U \$DB_USER -d \$DB_NAME"
fi
