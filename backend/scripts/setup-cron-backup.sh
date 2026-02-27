#!/bin/bash

# Setup Cron Job for Automated Database Backups
# Runs daily at 2 AM

set -e

echo "⏰ Setting up automated database backups..."
echo ""

# Create cron job
CRON_JOB="0 2 * * * cd $(pwd) && docker-compose exec -T api /app/scripts/backup-database.sh >> /var/log/backup.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "backup-database.sh"; then
    echo "⚠️  Cron job already exists"
    echo ""
    echo "Current cron jobs:"
    crontab -l | grep "backup-database.sh"
else
    # Add cron job
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "✅ Cron job added successfully!"
    echo ""
    echo "Backup schedule: Daily at 2:00 AM"
    echo "Log file: /var/log/backup.log"
fi

echo ""
echo "📋 Current cron jobs:"
crontab -l

echo ""
echo "💡 To manually run backup:"
echo "docker-compose exec api /app/scripts/backup-database.sh"
echo ""
echo "💡 To view backup logs:"
echo "tail -f /var/log/backup.log"
