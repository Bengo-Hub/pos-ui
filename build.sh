#!/usr/bin/env bash
# =============================================================================
# POS UI Build and Deploy Script
# =============================================================================
# Purpose: Builds Docker image, pushes to registry, and updates Helm values
# Usage:
#   ./build.sh                     # Build only
#   DEPLOY=true ./build.sh         # Build and deploy
# =============================================================================

set -euo pipefail

# Helper functions for logging
info()    { echo -e "\033[0;34m[INFO]\033[0m $1"; }
success() { echo -e "\033[0;32m[SUCCESS]\033[0m $1"; }
warn()    { echo -e "\033[1;33m[WARN]\033[0m $1"; }
error()   { echo -e "\033[0;31m[ERROR]\033[0m $1"; }

# Configuration
APP_NAME=${APP_NAME:-"pos-ui"}
NAMESPACE=${NAMESPACE:-"pos"}
DEPLOY=${DEPLOY:-false}

# Registry configuration
REGISTRY_SERVER=${REGISTRY_SERVER:-docker.io}
REGISTRY_NAMESPACE=${REGISTRY_NAMESPACE:-codevertex}
IMAGE_REPO="${REGISTRY_SERVER}/${REGISTRY_NAMESPACE}/${APP_NAME}"

# DevOps repository configuration
DEVOPS_REPO=${DEVOPS_REPO:-"Bengo-Hub/devops-k8s"}
DEVOPS_DIR=${DEVOPS_DIR:-"$HOME/devops-k8s"}

GIT_EMAIL=${GIT_EMAIL:-"dev@bengobox.com"}
GIT_USER=${GIT_USER:-"POS UI Bot"}

# Determine Git commit ID
if [[ -z ${GITHUB_SHA:-} ]]; then
  GIT_COMMIT_ID=$(git rev-parse --short=8 HEAD || echo "localbuild")
else
  GIT_COMMIT_ID=${GITHUB_SHA::8}
fi

# Handle KUBE_CONFIG fallback for B64 variant
KUBE_CONFIG=${KUBE_CONFIG:-${KUBE_CONFIG_B64:-}}

# Build-time env (POS UI uses API + NOTIFICATIONS only in values; can override via Secrets)
NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-"https://posapi.codevertexitsolutions.com"}
NEXT_PUBLIC_NOTIFICATIONS_URL=${NEXT_PUBLIC_NOTIFICATIONS_URL:-"https://notifications.codevertexitsolutions.com"}

info "Building ${APP_NAME}:${GIT_COMMIT_ID}"

# =============================================================================
# SECRET SYNC
# =============================================================================
if [[ ${DEPLOY} == "true" ]]; then
  info "Checking and syncing required secrets from devops-k8s..."
  SYNC_SCRIPT=$(mktemp)
  if curl -fsSL "https://raw.githubusercontent.com/${DEVOPS_REPO}/main/scripts/tools/check-and-sync-secrets.sh" -o "$SYNC_SCRIPT" 2>/dev/null; then
    source "$SYNC_SCRIPT"
    check_and_sync_secrets "REGISTRY_USERNAME" "REGISTRY_PASSWORD" "KUBE_CONFIG" || warn "Secret sync failed"
    rm -f "$SYNC_SCRIPT"
  else
    warn "Unable to download secret sync script"
  fi
fi

# =============================================================================
# BUILD
# =============================================================================
info "Building Docker image"
DOCKER_BUILDKIT=1 docker build . -t "${IMAGE_REPO}:${GIT_COMMIT_ID}" \
  --build-arg NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
  --build-arg NEXT_PUBLIC_NOTIFICATIONS_URL="$NEXT_PUBLIC_NOTIFICATIONS_URL"
success "Docker build complete"

# =============================================================================
# PUSH
# =============================================================================
if [[ ${DEPLOY} == "true" ]]; then
  if [[ -n ${REGISTRY_USERNAME:-} && -n ${REGISTRY_PASSWORD:-} ]]; then
    echo "$REGISTRY_PASSWORD" | docker login "$REGISTRY_SERVER" -u "$REGISTRY_USERNAME" --password-stdin
  fi
  docker push "${IMAGE_REPO}:${GIT_COMMIT_ID}"
  success "Image pushed"
fi

# =============================================================================
# KUBERNETES SETUP
# =============================================================================
if [[ ${DEPLOY} == "true" ]]; then
  if [[ -n ${KUBE_CONFIG:-} ]]; then
    mkdir -p ~/.kube
    echo "$KUBE_CONFIG" | base64 -d > ~/.kube/config 2>/dev/null || echo "$KUBE_CONFIG" > ~/.kube/config
    chmod 600 ~/.kube/config
    export KUBECONFIG=~/.kube/config
  fi

  # Ensure devops-k8s is available
  if [[ ! -d "$DEVOPS_DIR" ]]; then
    info "DevOps directory not found. Cloning ${DEVOPS_REPO}..."
    TOKEN="${GH_PAT:-${GIT_SECRET:-${GITHUB_TOKEN:-}}}"
    CLONE_URL="https://github.com/${DEVOPS_REPO}.git"
    [[ -n $TOKEN ]] && CLONE_URL="https://x-access-token:${TOKEN}@github.com/${DEVOPS_REPO}.git"
    git clone "$CLONE_URL" "$DEVOPS_DIR" || warn "Unable to clone devops-k8s"
  fi

  # Source centralized Helm values update script
  source "${DEVOPS_DIR}/scripts/helm/update-values.sh" 2>/dev/null || {
    warn "Centralized helm update script not available at ${DEVOPS_DIR}/scripts/helm/update-values.sh"
  }

  # Update Helm values
  if declare -f update_helm_values >/dev/null 2>&1; then
    info "Updating Helm values in devops repo..."
    export GIT_EMAIL="$GIT_EMAIL"
    export GIT_USER="$GIT_USER"
    update_helm_values "$APP_NAME" "$GIT_COMMIT_ID" "$IMAGE_REPO" || warn "Helm update failed"
  else
    UPDATE_HELM_BINARY="${DEVOPS_DIR}/scripts/tools/update-helm-values.sh"
    if [[ -f "$UPDATE_HELM_BINARY" ]]; then
      chmod +x "$UPDATE_HELM_BINARY"
      "$UPDATE_HELM_BINARY" "$APP_NAME" "$GIT_COMMIT_ID" || warn "Helm binary update failed"
    fi
  fi
fi

success "Done!"
