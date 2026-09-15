#!/usr/bin/env bash

PORT=3000

echo "🔍 Checking for existing processes on port $PORT..."

# Find PIDs listening on port 3000
PIDS=$(lsof -ti :$PORT 2>/dev/null)

if [ -n "$PIDS" ]; then
  echo "⚠️ Found running process(es): $PIDS"
  echo "🛑 Attempting graceful shutdown (SIGTERM)..."
  kill $PIDS 2>/dev/null

  # Wait up to 5 seconds for the process to exit
  TIMEOUT=5
  while [ $TIMEOUT -gt 0 ] && lsof -ti :$PORT >/dev/null 2>&1; do
    sleep 1
    TIMEOUT=$((TIMEOUT - 1))
  done

  # Force kill if still holding the port
  REMAINING=$(lsof -ti :$PORT 2>/dev/null)
  if [ -n "$REMAINING" ]; then
    echo "⚠️ Process didn't exit in time. Forcing termination (SIGKILL)..."
    kill -9 $REMAINING 2>/dev/null
    sleep 1
  fi
  echo "✅ Port $PORT is now clear."
else
  echo "✅ No process currently using port $PORT."
fi

echo "🚀 Starting Next.js development server..."
#
# npm run dev
#
