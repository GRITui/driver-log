#!/usr/bin/env bash
#
# portforward.sh — open router ports 80 + 443 to THIS machine via UPnP,
# so Caddy can serve https://api.driverlog.link.
#
# Requires: miniupnpc (`upnpc`) and your router to have UPnP/IGD enabled.
#   macOS:         brew install miniupnpc
#   Debian/Ubuntu: sudo apt-get install -y miniupnpc
#   Fedora:        sudo dnf install -y miniupnpc
#
# Usage:
#   ./portforward.sh add        # create the 80 + 443 mappings (default)
#   ./portforward.sh status     # list current mappings + external IP
#   ./portforward.sh remove     # delete the mappings
#   PORTS="80 443 8090" ./portforward.sh add    # custom port list
#
set -euo pipefail

PORTS=${PORTS:-"80 443"}
LEASE=${LEASE:-0}          # 0 = permanent (until removed/reboot). Some routers cap this.
ACTION=${1:-add}

# ── locate upnpc ─────────────────────────────────────────────────────────
if ! command -v upnpc >/dev/null 2>&1; then
  echo "ERROR: 'upnpc' not found. Install miniupnpc first:"
  echo "  macOS:  brew install miniupnpc"
  echo "  Ubuntu: sudo apt-get install -y miniupnpc"
  exit 1
fi

# ── detect this machine's LAN IP ─────────────────────────────────────────
detect_lan_ip() {
  local ip=""
  if command -v ipconfig >/dev/null 2>&1; then                 # macOS
    for i in en0 en1 en2; do ip=$(ipconfig getifaddr "$i" 2>/dev/null) && [ -n "$ip" ] && break; done
  fi
  if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then  # Linux
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
  if [ -z "$ip" ]; then                                        # fallback
    ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')
  fi
  echo "$ip"
}

LAN_IP=$(detect_lan_ip)
if [ -z "$LAN_IP" ]; then
  echo "ERROR: could not detect this machine's LAN IP. Set it manually: LAN_IP=192.168.1.x"
  exit 1
fi
echo "This machine (LAN): $LAN_IP"

case "$ACTION" in
  add)
    for p in $PORTS; do
      echo "→ mapping external :$p → $LAN_IP:$p (TCP)"
      # upnpc -a <internal_ip> <internal_port> <external_port> <proto> [lease]
      upnpc -e "DriverLog" -a "$LAN_IP" "$p" "$p" TCP "$LEASE" \
        && echo "  ✓ $p mapped" \
        || echo "  ✗ failed to map $p (router UPnP may be off — see note below)"
    done
    echo
    echo "External IP seen by router:"
    upnpc -s 2>/dev/null | awk -F'= ' '/ExternalIPAddress/{print "  "$2}'
    echo
    echo "Verify from OUTSIDE your network (e.g. phone on mobile data):"
    echo "  https://api.driverlog.link/api/health   → expect {\"code\":200,...}"
    ;;
  status)
    echo "Current UPnP port mappings on the router:"
    upnpc -l 2>/dev/null | sed -n '/i protocol/,$p' || upnpc -l
    ;;
  remove)
    for p in $PORTS; do
      echo "→ removing external :$p (TCP)"
      upnpc -d "$p" TCP && echo "  ✓ $p removed" || echo "  ✗ could not remove $p"
    done
    ;;
  *)
    echo "Usage: $0 {add|status|remove}"; exit 1;;
esac

cat <<'NOTE'

──────────────────────────────────────────────────────────────────────────
If mapping FAILED ("No IGD UPnP Device found" or similar):
  • Your router has UPnP disabled → enable it in the router admin
    (usually under Advanced / NAT / UPnP), then re-run.
  • Or add the forwards manually in the router: TCP 80→<this LAN IP>:80
    and TCP 443→<this LAN IP>:443.
  • If your ISP uses CGNAT or blocks inbound 80/443 (common on Thai
    residential plans), NO port-forward will work — use the Cloudflare
    Tunnel path in REVERSE-PROXY.md instead.
──────────────────────────────────────────────────────────────────────────
NOTE
