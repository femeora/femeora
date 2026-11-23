#!/usr/bin/env bash
set -euo pipefail

network="${APP_NETWORK:-}"
rpc_url="${RPC_URL:-}"
deployer="${DEPLOYER_ADDRESS:-}"
deployer_private_key="${DEPLOYER_PRIVATE_KEY:-}"
admin="${CONTRACT_ADMIN_ADDRESS:-}"
upgrader="${CONTRACT_UPGRADER_ADDRESS:-}"
treasury="${TREASURY_ADDRESS:-}"
protocol_fee_share="${PROTOCOL_FEE_SHARE_PIPS:-}"
mainnet_approved="${MAINNET_DEPLOYMENT_APPROVED:-false}"
configured_chain_id="${CHAIN_ID:-}"
write_manifest="${WRITE_DEPLOYMENT_MANIFEST:-}"

if [[ "$network" != "testnet" && "$network" != "mainnet" ]]; then
  echo "APP_NETWORK must be testnet or mainnet" >&2
  exit 1
fi

if [[ -z "$rpc_url" ]]; then
  echo "RPC_URL is required" >&2
  exit 1
fi

# Cast/Forge consume the endpoint from the process environment so credential-bearing
# RPC URLs never need to appear in command arguments or shell history.
export ETH_RPC_URL="$rpc_url"

if [[ ! "$deployer_private_key" =~ ^(0x)?[0-9a-fA-F]{64}$ ]]; then
  echo "DEPLOYER_PRIVATE_KEY must be a 32-byte hex value supplied through the environment" >&2
  exit 1
fi

for value_name in deployer admin upgrader treasury; do
  value="${!value_name}"
  if [[ ! "$value" =~ ^0x[0-9a-fA-F]{40}$ || "$value" == "0x0000000000000000000000000000000000000000" ]]; then
    echo "$value_name must be a non-zero EVM address" >&2
    exit 1
  fi
done

if [[ ! "$protocol_fee_share" =~ ^[0-9]+$ ]] || (( protocol_fee_share > 1000000 )); then
  echo "PROTOCOL_FEE_SHARE_PIPS must be an integer from 0 to 1000000" >&2
  exit 1
fi

expected_chain_id=46630
if [[ "$network" == "mainnet" ]]; then
  expected_chain_id=4663
  if [[ "$mainnet_approved" != "true" ]]; then
    echo "mainnet deployment is locked until MAINNET_DEPLOYMENT_APPROVED=true after audit" >&2
    exit 1
  fi
fi


if [[ "$configured_chain_id" != "$expected_chain_id" ]]; then
  echo "CHAIN_ID does not match the selected network" >&2
  exit 1
fi

if [[ "$write_manifest" != "true" && "$write_manifest" != "false" ]]; then
  echo "WRITE_DEPLOYMENT_MANIFEST must be true or false" >&2
  exit 1
fi

actual_chain_id="$(cast chain-id)"
if [[ "$actual_chain_id" != "$expected_chain_id" ]]; then
  echo "RPC chain mismatch: expected $expected_chain_id, got $actual_chain_id" >&2
  exit 1
fi

balance="$(cast balance "$deployer")"
if [[ "$balance" == "0" ]]; then
  echo "deployer has no native ETH for gas" >&2
  exit 1
fi

echo "preflight ok: network=$network chainId=$actual_chain_id"
