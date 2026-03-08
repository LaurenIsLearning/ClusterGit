#!/bin/bash

set -e

BRANCH=$(echo "$1" | tr '/' '-' | tr '[:upper:]' '[:lower:]')

echo "Deploying preview for branch: $BRANCH"

TEMPLATE="k8s/preview-template.yaml"
OUTPUT="/tmp/generated-preview.yaml"

sed "s/{{BRANCH}}/$BRANCH/g" $TEMPLATE > $OUTPUT

kubectl apply -f $OUTPUT
kubectl rollout restart deployment clustergit-backend -n preview-$BRANCH || true

echo ""
echo "Preview deployed:"
echo "https://$BRANCH.clustergit.com"