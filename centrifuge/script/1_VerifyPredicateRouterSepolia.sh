#!/usr/bin/env bash
##
## Verify a deployed PredicateRouter on Sepolia via forge + Etherscan.
##
## The script consumes the environment variables defined in `.env`:
##   SEPOLIA_ROUTER_ADDRESS     Deployed router address.
##   SPOKE_ADDRESS              Spoke address passed to the constructor.
##   PREDICATE_MANAGER_ADDRESS  Predicate manager passed to the constructor.
##   POLICY_ID                  Policy ID (string) used in the constructor.
##   SEPOLIA_DEPLOYER_ADDRESS   Deployer account retaining auth on the router.
##   ETHERSCAN_API_KEY          API key with contract verification privileges.
##
## Example:
##   source .env
##   script/1_VerifyPredicateRouterSepolia.sh
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

require_env SEPOLIA_ROUTER_ADDRESS
require_env SPOKE_ADDRESS
require_env PREDICATE_MANAGER_ADDRESS
require_env POLICY_ID
require_env SEPOLIA_DEPLOYER_ADDRESS
require_env ETHERSCAN_API_KEY

CONSTRUCTOR_ARGS=$(cast abi-encode "constructor(address,address,string,address)" \
  "$SPOKE_ADDRESS" \
  "$PREDICATE_MANAGER_ADDRESS" \
  "$POLICY_ID" \
  "$SEPOLIA_DEPLOYER_ADDRESS")

echo "Submitting verification for router $SEPOLIA_ROUTER_ADDRESS on chain 11155111"
forge verify-contract \
  --chain-id 11155111 \
  "$SEPOLIA_ROUTER_ADDRESS" \
  src/PredicateRouter.sol:PredicateRouter \
  --constructor-args "$CONSTRUCTOR_ARGS" \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  --watch
