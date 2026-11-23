#!/usr/bin/env bash
set -euo pipefail

network="${1:-}"
operation="${2:-}"
if [[ "$network" != "testnet" && "$network" != "mainnet" ]]; then
  echo "usage: ./script/run-network-script.sh <testnet|mainnet> <deploy|safe|timelock|prepare-handover|verify-handover|prepare-accounting|prepare-accounting-schedule|create-initial-pool>" >&2
  exit 1
fi
if [[ "$operation" != "deploy" && "$operation" != "safe" && "$operation" != "timelock" && "$operation" != "prepare-handover" && "$operation" != "verify-handover" && "$operation" != "prepare-accounting" && "$operation" != "prepare-accounting-schedule" && "$operation" != "create-initial-pool" ]]; then
  echo "unsupported deployment operation" >&2
  exit 1
fi
contracts_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workspace_root="$(cd "$contracts_root/../.." && pwd)"
env_file="$workspace_root/.env.$network"
if [[ ! -f "$env_file" ]]; then
  echo "missing selected network env file" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a
if [[ "${APP_NETWORK:-}" != "$network" ]]; then
  echo "APP_NETWORK does not match the selected env file" >&2
  exit 1
fi
if [[ -z "${RPC_URL:-}" ]]; then
  echo "RPC_URL is required" >&2
  exit 1
fi
export ETH_RPC_URL="$RPC_URL"
export FOUNDRY_ETH_RPC_URL="$RPC_URL"

cd "$contracts_root"
case "$operation" in
  deploy)
    ./script/preflight-deployment.sh
    forge script script/Deploy.s.sol:Deploy --sender "$DEPLOYER_ADDRESS" --broadcast
    ;;
  safe)
    forge script script/DeployGovernanceSafe.s.sol:DeployGovernanceSafe --sender "$DEPLOYER_ADDRESS" --broadcast
    ;;
  timelock)
    forge script script/DeployTimelock.s.sol:DeployTimelock --sender "$DEPLOYER_ADDRESS" --broadcast
    ;;
  prepare-handover)
    forge script script/PrepareGovernanceHandover.s.sol:PrepareGovernanceHandover
    ;;
  verify-handover)
    forge script script/VerifyGovernanceHandover.s.sol:VerifyGovernanceHandover
    ;;
  prepare-accounting)
    forge script script/PrepareAccountingUpgrade.s.sol:PrepareAccountingUpgrade --sender "$DEPLOYER_ADDRESS" --broadcast
    ;;
  prepare-accounting-schedule)
    forge script script/PrepareAccountingSchedule.s.sol:PrepareAccountingSchedule
    ;;
  create-initial-pool)
    forge script script/CreateInitialPool.s.sol:CreateInitialPool --sender "$DEPLOYER_ADDRESS" --broadcast
    ;;
esac
