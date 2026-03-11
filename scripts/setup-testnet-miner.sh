#!/bin/bash
# ============================================================================
#  FORGE — OPNet Testnet Bitcoin Miner Setup
#
#  Builds OPNet's custom Bitcoin Core fork, syncs to testnet, and mines tBTC.
#  Run this in WSL (Ubuntu) on Windows, or natively on Linux.
#
#  Usage:
#    chmod +x setup-testnet-miner.sh
#    ./setup-testnet-miner.sh setup       # First time: install deps + build
#    ./setup-testnet-miner.sh start       # Start node + sync
#    ./setup-testnet-miner.sh mine [N]    # Mine N blocks (default: 10)
#    ./setup-testnet-miner.sh balance     # Check balance
#    ./setup-testnet-miner.sh status      # Node sync status
#    ./setup-testnet-miner.sh stop        # Stop the node
# ============================================================================

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────
REPO_URL="https://github.com/btc-vision/bitcoin-core-opnet-testnet.git"
INSTALL_DIR="$HOME/opnet-testnet-node"
DATA_DIR="$HOME/.opnet-testnet"
CONF_FILE="$DATA_DIR/bitcoin.conf"
RPC_PORT=11000
RPC_USER="forgeminer"
RPC_PASS="forgeminer$(date +%s | sha256sum | head -c 16)"

# Your mining address — REPLACE with your actual address
# This should be the underlying Bitcoin address for your OPNet wallet
MINE_ADDRESS="${MINE_ADDRESS:-}"

# CLI shortcut
cli() {
    "$INSTALL_DIR/build/bin/bitcoin-cli" -conf="$CONF_FILE" "$@"
}

# ── Colors ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[FORGE]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }

# ── Commands ───────────────────────────────────────────────────────────────

cmd_setup() {
    log "Setting up OPNet testnet Bitcoin Core..."

    # Install dependencies
    log "Installing build dependencies..."
    sudo apt-get update
    sudo apt-get install -y \
        build-essential cmake pkgconf python3 \
        libevent-dev libboost-dev libsqlite3-dev \
        libzmq3-dev git jq

    # Clone if not exists
    if [ -d "$INSTALL_DIR" ]; then
        warn "Directory $INSTALL_DIR already exists. Pulling latest..."
        cd "$INSTALL_DIR" && git pull
    else
        log "Cloning OPNet Bitcoin Core fork..."
        git clone "$REPO_URL" "$INSTALL_DIR"
    fi

    # Build
    cd "$INSTALL_DIR"
    log "Building Bitcoin Core (this takes 10-30 minutes)..."
    cmake -B build \
        -DBUILD_TESTING=OFF \
        -DBUILD_BENCH=OFF \
        -DWITH_BDB=OFF \
        -DENABLE_WALLET=ON \
        -DENABLE_IPC=OFF
    cmake --build build -j$(nproc)

    # Create data directory
    mkdir -p "$DATA_DIR"

    # Generate config if not exists
    if [ ! -f "$CONF_FILE" ]; then
        log "Creating bitcoin.conf..."
        cat > "$CONF_FILE" << EOF
# OPNet Testnet Configuration
opnet-testnet=1
server=1
daemon=1
txindex=1
acceptnonstdtxn=1

# Network
maxconnections=64
addnode=bootstrap.testnet.opnet.org

# Memory pool
maxmempool=4096
minrelaytxfee=0.000002

# RPC
rpcport=$RPC_PORT
rpcuser=$RPC_USER
rpcpassword=$RPC_PASS
rpcallowip=127.0.0.1

# Wallet (for mining)
wallet=miner

# Performance
dbcache=1024
par=$(nproc)
EOF
        log "Config written to $CONF_FILE"
        info "RPC credentials: $RPC_USER / $RPC_PASS"
        info "Save these! You'll need them to connect."
    else
        warn "Config already exists at $CONF_FILE"
        # Extract existing credentials
        RPC_USER=$(grep "^rpcuser=" "$CONF_FILE" | cut -d= -f2)
        RPC_PASS=$(grep "^rpcpassword=" "$CONF_FILE" | cut -d= -f2)
    fi

    echo ""
    log "✅ Setup complete!"
    echo ""
    info "Next steps:"
    info "  1. Set your mining address:  export MINE_ADDRESS='your_address_here'"
    info "  2. Start the node:           ./setup-testnet-miner.sh start"
    info "  3. Wait for sync:            ./setup-testnet-miner.sh status"
    info "  4. Mine blocks:              ./setup-testnet-miner.sh mine 10"
}

cmd_start() {
    log "Starting OPNet testnet node..."

    if [ ! -f "$INSTALL_DIR/build/bin/bitcoind" ]; then
        err "Bitcoin Core not built yet. Run: ./setup-testnet-miner.sh setup"
        exit 1
    fi

    # Check if already running
    if cli getblockchaininfo &>/dev/null; then
        warn "Node is already running!"
        cmd_status
        return
    fi

    # Start daemon
    "$INSTALL_DIR/build/bin/bitcoind" -conf="$CONF_FILE" -datadir="$DATA_DIR"

    log "Node started. Waiting for RPC to become available..."
    for i in $(seq 1 30); do
        if cli getblockchaininfo &>/dev/null; then
            log "✅ Node is running!"
            cmd_status
            return
        fi
        sleep 2
    done

    warn "Node started but RPC not responding yet. It may still be loading."
    info "Check logs: tail -f $DATA_DIR/debug.log"
}

cmd_status() {
    if ! cli getblockchaininfo &>/dev/null; then
        err "Node is not running. Start with: ./setup-testnet-miner.sh start"
        exit 1
    fi

    local info
    info=$(cli getblockchaininfo)

    local blocks headers progress
    blocks=$(echo "$info" | jq -r '.blocks')
    headers=$(echo "$info" | jq -r '.headers')
    progress=$(echo "$info" | jq -r '.verificationprogress')
    local pct=$(echo "$progress * 100" | bc -l 2>/dev/null | head -c 6 || echo "$progress")

    echo ""
    info "═══════════════════════════════════════"
    info "  OPNet Testnet Node Status"
    info "═══════════════════════════════════════"
    info "  Blocks:     $blocks / $headers"
    info "  Sync:       ${pct}%"
    info "  Chain:      $(echo "$info" | jq -r '.chain')"
    info "  Peers:      $(cli getconnectioncount 2>/dev/null || echo '?')"

    if [ "$blocks" = "$headers" ] && [ "$headers" != "0" ]; then
        log "  Status:     ✅ FULLY SYNCED — Ready to mine!"
    else
        warn "  Status:     ⏳ Syncing..."
    fi
    echo ""
}

cmd_mine() {
    local count=${1:-10}

    if ! cli getblockchaininfo &>/dev/null; then
        err "Node is not running. Start with: ./setup-testnet-miner.sh start"
        exit 1
    fi

    # Check sync status
    local info blocks headers
    info=$(cli getblockchaininfo)
    blocks=$(echo "$info" | jq -r '.blocks')
    headers=$(echo "$info" | jq -r '.headers')

    if [ "$blocks" != "$headers" ] || [ "$headers" = "0" ]; then
        warn "Node is still syncing ($blocks / $headers blocks)."
        warn "Mining while syncing may not work properly."
        read -p "Continue anyway? (y/N): " confirm
        [ "$confirm" = "y" ] || exit 0
    fi

    # Get mining address
    if [ -z "$MINE_ADDRESS" ]; then
        # Try to get address from wallet
        log "No MINE_ADDRESS set. Creating/loading wallet..."

        # Create wallet if it doesn't exist
        cli createwallet "miner" false false "" false false true false &>/dev/null || true
        cli loadwallet "miner" &>/dev/null || true

        MINE_ADDRESS=$(cli -rpcwallet=miner getnewaddress "mining" "bech32m" 2>/dev/null || true)

        if [ -z "$MINE_ADDRESS" ]; then
            err "Could not get mining address."
            err "Set it manually: export MINE_ADDRESS='your_address'"
            exit 1
        fi

        info "Generated mining address: $MINE_ADDRESS"
        warn "Save this address! Export it for future use:"
        warn "  export MINE_ADDRESS='$MINE_ADDRESS'"
        echo ""
    fi

    log "Mining $count blocks to $MINE_ADDRESS ..."
    echo ""

    # Get balance before
    local balance_before
    balance_before=$(cli -rpcwallet=miner getbalance 2>/dev/null || echo "0")

    # Mine!
    local result
    result=$(cli generatetoaddress "$count" "$MINE_ADDRESS" 2>&1)

    if [ $? -eq 0 ]; then
        local mined
        mined=$(echo "$result" | jq -r 'length' 2>/dev/null || echo "$count")

        # Get balance after (coinbase needs 100 confirmations to be spendable)
        local balance_after
        balance_after=$(cli -rpcwallet=miner getbalance 2>/dev/null || echo "unknown")
        local immature
        immature=$(cli -rpcwallet=miner getbalances 2>/dev/null | jq -r '.mine.immature // 0' || echo "unknown")

        echo ""
        log "✅ Mined $mined blocks!"
        echo ""
        info "═══════════════════════════════════════"
        info "  Mining Results"
        info "═══════════════════════════════════════"
        info "  Blocks mined:    $mined"
        info "  Reward per block: 50 tBTC"
        info "  Total mined:     $(( mined * 50 )) tBTC"
        info "  Spendable:       $balance_after tBTC"
        info "  Immature:        $immature tBTC"
        info ""
        info "  ⚠️  Coinbase rewards need 100 confirmations"
        info "     to become spendable. Mine 100+ blocks"
        info "     to unlock the first rewards immediately."
        info "═══════════════════════════════════════"
        echo ""

        if [ "$mined" -lt 100 ]; then
            warn "Tip: Mine 110+ blocks to make rewards spendable right away:"
            warn "  ./setup-testnet-miner.sh mine 110"
        fi
    else
        err "Mining failed: $result"
        exit 1
    fi
}

cmd_balance() {
    if ! cli getblockchaininfo &>/dev/null; then
        err "Node is not running."
        exit 1
    fi

    cli loadwallet "miner" &>/dev/null || true

    local balances
    balances=$(cli -rpcwallet=miner getbalances 2>/dev/null)

    if [ -n "$balances" ]; then
        local trusted untrusted immature
        trusted=$(echo "$balances" | jq -r '.mine.trusted // 0')
        untrusted=$(echo "$balances" | jq -r '.mine.untrusted_pending // 0')
        immature=$(echo "$balances" | jq -r '.mine.immature // 0')

        echo ""
        info "═══════════════════════════════════════"
        info "  Wallet Balance"
        info "═══════════════════════════════════════"
        info "  Spendable:    $trusted tBTC"
        info "  Pending:      $untrusted tBTC"
        info "  Immature:     $immature tBTC"
        info "═══════════════════════════════════════"
        echo ""

        if [ "$trusted" = "0" ] || [ "$trusted" = "0.00000000" ]; then
            warn "No spendable balance yet."
            warn "Immature coins need 100 confirmations."
            warn "Mine 110+ blocks: ./setup-testnet-miner.sh mine 110"
        fi
    else
        err "Could not read wallet balances."
    fi
}

cmd_send() {
    local to_addr=${1:-}
    local amount=${2:-}

    if [ -z "$to_addr" ] || [ -z "$amount" ]; then
        err "Usage: ./setup-testnet-miner.sh send <address> <amount_btc>"
        err "Example: ./setup-testnet-miner.sh send opt1pefyvu2q... 1.0"
        exit 1
    fi

    if ! cli getblockchaininfo &>/dev/null; then
        err "Node is not running."
        exit 1
    fi

    cli loadwallet "miner" &>/dev/null || true

    log "Sending $amount tBTC to $to_addr ..."
    local txid
    txid=$(cli -rpcwallet=miner sendtoaddress "$to_addr" "$amount" 2>&1)

    if [ $? -eq 0 ]; then
        log "✅ Sent! TXID: $txid"
    else
        err "Send failed: $txid"
    fi
}

cmd_stop() {
    log "Stopping OPNet testnet node..."
    cli stop 2>/dev/null && log "✅ Node stopped." || warn "Node was not running."
}

# ── Main ───────────────────────────────────────────────────────────────────

case "${1:-help}" in
    setup)   cmd_setup ;;
    start)   cmd_start ;;
    mine)    cmd_mine "${2:-10}" ;;
    balance) cmd_balance ;;
    status)  cmd_status ;;
    send)    cmd_send "${2:-}" "${3:-}" ;;
    stop)    cmd_stop ;;
    help|*)
        echo ""
        echo "  FORGE — OPNet Testnet Miner"
        echo ""
        echo "  Usage: ./setup-testnet-miner.sh <command>"
        echo ""
        echo "  Commands:"
        echo "    setup           Install deps, clone, build Bitcoin Core"
        echo "    start           Start the node daemon"
        echo "    status          Show sync progress + peer count"
        echo "    mine [N]        Mine N blocks (default: 10)"
        echo "    balance         Show wallet balance"
        echo "    send <addr> <N> Send N tBTC to an address"
        echo "    stop            Stop the node"
        echo ""
        echo "  First time:"
        echo "    ./setup-testnet-miner.sh setup"
        echo "    ./setup-testnet-miner.sh start"
        echo "    ./setup-testnet-miner.sh mine 110   # mine 110 blocks = 5500 tBTC"
        echo ""
        echo "  Environment:"
        echo "    MINE_ADDRESS    Set your mining address (optional, auto-generated if not set)"
        echo ""
        ;;
esac
