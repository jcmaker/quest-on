#!/bin/bash
# Setup staging Vercel environment variables
# Usage: vercel login (to apple021104-5774 account first), then run this script
# Run from project root: bash scripts/setup-staging-env.sh

set -e

if ! command -v vercel &> /dev/null; then
  echo "Error: vercel CLI not found. Install with: npm i -g vercel"
  exit 1
fi

echo "=== Setting up staging environment variables ==="
echo "Make sure you are logged in to the staging Vercel account (apple021104-5774)"
echo ""

# Read values from .env.local
ENV_FILE=".env.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found. Run from project root."
  exit 1
fi

get_env() {
  grep "^$1=" "$ENV_FILE" | head -1 | cut -d'=' -f2-
}

# Function to set env var for all environments (production, preview, development)
set_env() {
  local key="$1"
  local value="$2"

  if [ -z "$value" ]; then
    echo "SKIP: $key (empty value)"
    return
  fi

  for env in production preview development; do
    echo "$value" | vercel env add "$key" "$env" --force 2>/dev/null && \
      echo "  SET: $key ($env)" || \
      echo "  EXISTS: $key ($env)"
  done
}

echo "--- Required: Supabase ---"
set_env "NEXT_PUBLIC_SUPABASE_URL" "$(get_env NEXT_PUBLIC_SUPABASE_URL)"
set_env "NEXT_PUBLIC_SUPABASE_ANON_KEY" "$(get_env NEXT_PUBLIC_SUPABASE_ANON_KEY)"
set_env "SUPABASE_SERVICE_ROLE_KEY" "$(get_env SUPABASE_SERVICE_ROLE_KEY)"

echo ""
echo "--- Required: Clerk ---"
set_env "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" "$(get_env NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)"
set_env "CLERK_SECRET_KEY" "$(get_env CLERK_SECRET_KEY)"
set_env "NEXT_PUBLIC_CLERK_SIGN_IN_URL" "/sign-in"
set_env "NEXT_PUBLIC_CLERK_SIGN_UP_URL" "/sign-up"
set_env "NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL" "/"
set_env "NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL" "/onboarding"

echo ""
echo "--- Required: OpenAI & Admin ---"
set_env "OPENAI_API_KEY" "$(get_env OPENAI_API_KEY)"
set_env "ADMIN_USERNAME" "$(get_env ADMIN_USERNAME)"
set_env "ADMIN_PASSWORD" "$(get_env ADMIN_PASSWORD)"
set_env "ADMIN_JWT_SECRET" "$(get_env ADMIN_JWT_SECRET)"

echo ""
echo "--- Optional: Upstash Redis ---"
set_env "UPSTASH_REDIS_REST_URL" "$(get_env UPSTASH_REDIS_REST_URL)"
set_env "UPSTASH_REDIS_REST_TOKEN" "$(get_env UPSTASH_REDIS_REST_TOKEN)"

echo ""
echo "=== Done! Now redeploy: vercel --prod ==="
