#!/usr/bin/env bash
##
## Request a predicate evaluation for the Centrifuge router `deposit` call.
##
## Required environment variables:
##   PREDICATE_API_KEY          Predicate API key (x-api-key header).
##   PREDICATE_FROM_ADDRESS     Account that will submit the tx (msg.sender).
##   PREDICATE_ROUTER_ADDRESS   PredicateRouter contract address.
##
## Optional overrides:
##   PREDICATE_ASSETS           Asset amount passed to `deposit` (default: 1000000).
##   PREDICATE_VAULT_ADDRESS    Centrifuge vault address (default: 0x0000...0001).
##   PREDICATE_RECEIVER_ADDRESS Receiver of shares (default: from address).
##   PREDICATE_OWNER_ADDRESS    Asset owner (default: from address).
##   PREDICATE_CHAIN_ID         Numeric chain id (default: 11155111 / Sepolia).
##
## Example:
##   export PREDICATE_API_KEY=...
##   export PREDICATE_FROM_ADDRESS=0x...
##   export PREDICATE_ROUTER_ADDRESS=0x...
##   script/2_QueryPredicateApi.sh | jq
##
set -euo pipefail

require_env() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    echo "Missing $name env var" >&2
    exit 1
  fi
}

require_env PREDICATE_API_KEY
require_env PREDICATE_FROM_ADDRESS
require_env PREDICATE_ROUTER_ADDRESS

ASSETS=${PREDICATE_ASSETS:-1000000}
VAULT_ADDRESS=${PREDICATE_VAULT_ADDRESS:-0x0000000000000000000000000000000000000001}
RECEIVER=${PREDICATE_RECEIVER_ADDRESS:-$PREDICATE_FROM_ADDRESS}
OWNER=${PREDICATE_OWNER_ADDRESS:-$PREDICATE_FROM_ADDRESS}
CHAIN_ID=${PREDICATE_CHAIN_ID:-11155111}

# Encode the PredicateRouter.deposit call signature with the supplied parameters.
CALldata=$(cast calldata "deposit(address,uint256,address,address)" \
  "$VAULT_ADDRESS" \
  "$ASSETS" \
  "$RECEIVER" \
  "$OWNER")

echo "Querying Predicate API for msg.sender=$PREDICATE_FROM_ADDRESS, router=$PREDICATE_ROUTER_ADDRESS" >&2
curl -sS -X POST https://api.predicate.io/v1/task \
  -H "Content-Type: application/json" \
  -H "x-api-key: $PREDICATE_API_KEY" \
  -d "{\"from\": \"$PREDICATE_FROM_ADDRESS\", \"to\": \"$PREDICATE_ROUTER_ADDRESS\", \"data\": \"$CALldata\", \"msg_value\": \"0\", \"chain_id\": \"$CHAIN_ID\"}"
