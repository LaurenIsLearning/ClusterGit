#!/bin/bash

set -e

# fail early if required env vars are missing
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
: "${REPO_BASE_PATH:?REPO_BASE_PATH is required}"

#lowercases path bc linux
BRANCH=$(echo "$1" | tr '/' '-' | tr '[:upper:]' '[:lower:]')

# At the top after BRANCH= line, add:
if [[ "$BRANCH" == "main" || "$BRANCH" == "develop" ]]; then
  echo "Skipping preview deploy for protected branch: $BRANCH"
  exit 0
fi

echo "Deploying preview for branch: $BRANCH"

TEMPLATE="k8s/preview-template.yaml"
OUTPUT="/tmp/generated-preview.yaml"

sed "s/{{BRANCH}}/$BRANCH/g" $TEMPLATE > $OUTPUT

#create namespace if needed
kubectl create namespace preview-$BRANCH --dry-run=client -o yaml | kubectl apply -f -

# Create/update backend env secret from github
kubectl create secret generic clustergit-backend-env-$BRANCH \
  --from-literal=PORT=80 \
  --from-literal=REPO_BASE_PATH="$REPO_BASE_PATH" \
  --from-literal=SUPABASE_URL="$SUPABASE_URL" \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  -n preview-$BRANCH \
  --dry-run=client -o yaml | kubectl apply -f -
  
kubectl apply -f $OUTPUT

kubectl rollout restart deployment clustergit-backend -n preview-$BRANCH || true

echo ""
echo "Preview deployed:"
echo "https://$BRANCH.clustergit.com"