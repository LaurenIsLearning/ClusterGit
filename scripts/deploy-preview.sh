#!/bin/bash

set -e

: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
: "${REPO_BASE_PATH:?REPO_BASE_PATH is required}"

BRANCH=$(echo "$1" | tr '/' '-' | tr '[:upper:]' '[:lower:]')

if [[ "$BRANCH" == "main" || "$BRANCH" == "develop" ]]; then
  echo "Skipping preview deploy for protected branch: $BRANCH"
  exit 0
fi

echo "Deploying preview for branch: $BRANCH"

TEMPLATE="k8s/preview-template.yaml"
OUTPUT="/tmp/generated-preview.yaml"

sed "s/{{BRANCH}}/$BRANCH/g" "$TEMPLATE" > "$OUTPUT"

kubectl create namespace "preview-$BRANCH" --dry-run=client -o yaml | kubectl apply -f -

SECRET_ARGS=(
  --from-literal=PORT=80
  --from-literal=REPO_BASE_PATH="$REPO_BASE_PATH"
  --from-literal=SUPABASE_URL="$SUPABASE_URL"
  --from-literal=SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
)

if [[ -n "${PROMETHEUS_URL:-}" ]]; then
  SECRET_ARGS+=(--from-literal=PROMETHEUS_URL="$PROMETHEUS_URL")
fi

if [[ -n "${PROMETHEUS_STORAGE_MOUNTPOINTS:-}" ]]; then
  SECRET_ARGS+=(--from-literal=PROMETHEUS_STORAGE_MOUNTPOINTS="$PROMETHEUS_STORAGE_MOUNTPOINTS")
fi

kubectl create secret generic "clustergit-backend-env-$BRANCH" \
  "${SECRET_ARGS[@]}" \
  -n "preview-$BRANCH" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f "$OUTPUT"
kubectl rollout restart deployment clustergit-backend -n "preview-$BRANCH" || true

echo ""
echo "Preview deployed:"
echo "https://$BRANCH.clustergit.com"
