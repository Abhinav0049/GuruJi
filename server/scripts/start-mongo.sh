#!/usr/bin/env bash
set -euo pipefail

# Starts a local MongoDB container for development
# Usage: ./scripts/start-mongo.sh

CONTAINER_NAME="leap-local-mongo"
IMAGE="mongo:6.0"
PORT=27017

if command -v docker >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Mongo container '${CONTAINER_NAME}' is already running."
    exit 0
  fi

  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Starting existing container '${CONTAINER_NAME}'..."
    docker start "${CONTAINER_NAME}"
    exit 0
  fi

  echo "Pulling ${IMAGE} and starting container '${CONTAINER_NAME}' on port ${PORT}..."
  docker run -d --name "${CONTAINER_NAME}" -p ${PORT}:27017 -e MONGO_INITDB_DATABASE=leap-survey "${IMAGE}"
  echo "MongoDB should be available at mongodb://localhost:${PORT}"
else
  echo "docker CLI not found. Please install Docker and re-run this script, or provide a MongoDB URI via MONGODB_URI environment variable."
  exit 1
fi
