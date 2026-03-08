#!/bin/bash

set -e

# fail early if required env vars are missing
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY is required}"
: "${SUPABASE_SERVICE_KEY:?SUPABASE_SERVICE_KEY is required}"
: "${REPO_BASE_PATH:?REPO_BASE_PATH is required}"

#lowercases path bc linux
BRANCH=$(echo "$1" | tr '/' '-' | tr '[:upper:]' '[:lower:]')

echo "Deploying preview for branch: $BRANCH"

TEMPLATE="k8s/preview-template.yaml"
OUTPUT="/tmp/generated-preview.yaml"

sed "s/{{BRANCH}}/$BRANCH/g" $TEMPLATE > $OUTPUT

#create namespace if needed
kubectl create namespace preview-$BRANCH --dry-run=client -o yaml | kubectl apply -f -

# Create/update backend env secret from github
kubectl create secret generic clustergit-backend-env \
  --from-literal=PORT=80 \
  --from-literal=REPO_BASE_PATH="$REPO_BASE_PATH" \
  --from-literal=SUPABASE_URL="$SUPABASE_URL" \
  --from-literal=SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  --from-literal=SUPABASE_SERVICE_KEY="$SUPABASE_SERVICE_KEY" \
  -n preview-$BRANCH \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f $OUTPUT

kubectl rollout restart deployment clustergit-backend -n preview-$BRANCH || true

echo ""
echo "Preview deployed:"
echo "https://$BRANCH.clustergit.com"