#!/bin/bash

set -e

#lowercases path bc linux
BRANCH=$(echo "$1" | tr '/' '-' | tr '[:upper:]' '[:lower:]')

echo "Deploying preview for branch: $BRANCH"

TEMPLATE="k8s/preview-template.yaml"
OUTPUT="/tmp/generated-preview.yaml"

sed "s/{{BRANCH}}/$BRANCH/g" $TEMPLATE > $OUTPUT

#create namespace if needed
kubectl create namespace preview-$BRANCH --dry-run=client -o yaml | kubectl apply -f -

# Create/update backend env secret
kubectl create secret generic clustergit-backend-env \
  --from-literal=PORT=80 \
  --from-literal=REPO_BASE_PATH=/repos \
  --from-literal=SUPABASE_URL=https://wvuvoyxxiakpfysscipw.supabase.co \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  -n preview-$BRANCH \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f $OUTPUT

kubectl rollout restart deployment clustergit-backend -n preview-$BRANCH || true

echo ""
echo "Preview deployed:"
echo "https://$BRANCH.clustergit.com"