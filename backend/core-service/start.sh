#!/bin/bash
cd /opt/openclaw/core-service
nohup node dist/index.js > /var/log/core-service.log 2>&1 &
echo  > /var/run/core-service.pid
sleep 2
ss -tlnp | grep -E '3001|3003'
