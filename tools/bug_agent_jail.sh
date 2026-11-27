#!/usr/bin/env bash
# The bug agent's jail (.github/workflows/bug-agent.yml): an unprivileged user whose processes reach
#   api    the Anthropic API and nothing else (the proxy's user, which holds the key: tools/bug_agent_proxy.mjs);
#          api.anthropic.com is pinned in /etc/hosts to an address inside Anthropic's published range
#   local  loopback only (the agent's user: it reaches the API only through the proxy on 127.0.0.1)
#   none   loopback only, for the verify job, where the patch's own code runs and no proxy is started
# The rules match the user's id in the kernel's OUTPUT chain, in a chain of the user's own, so the runner itself keeps its
# network, and every process the user starts, the agent, its shell and the code it writes, is held by them. The user has
# no sudo, no docker group and no GitHub token, and DNS is closed to it.
#
#   sudo bash tools/bug_agent_jail.sh <user> api|local|none
#
# Running it again replaces the rules (tests/bug-agent-jail.test.mjs switches between the two modes).
set -euo pipefail

user=${1:-}
mode=${2:-}
case "$user" in [a-z]*) ;; *) echo "usage: bug_agent_jail.sh <user> api|local|none" >&2; exit 2 ;; esac
case "$user" in *[!a-z0-9_-]*) echo "the user name must be lower case letters, digits, _ or -" >&2; exit 2 ;; esac
case "$mode" in api|local|none) ;; *) echo "usage: bug_agent_jail.sh <user> api|local|none" >&2; exit 2 ;; esac
[ "$(id -u)" = 0 ] || { echo "bug_agent_jail.sh runs as root" >&2; exit 2; }

# Anthropic's published inbound range for the API (docs: "IP addresses")
range=160.79.104.0/23

id -u "$user" > /dev/null 2>&1 || useradd --create-home --user-group --shell /usr/sbin/nologin "$user"
uid=$(id -u "$user")
if [ "$uid" -lt 1000 ] || id -nG "$user" | tr ' ' '\n' | grep -qxE 'sudo|admin|adm|docker|root|wheel'; then
  echo "$user is a system user or holds a privileged group" >&2; exit 1
fi

if [ "$mode" = api ]; then
  sed -i '/[[:space:]]api\.anthropic\.com$/d' /etc/hosts
  ip=$(getent ahostsv4 api.anthropic.com | awk 'NR == 1 { print $1 }')
  python3 -I -c 'import ipaddress, sys; sys.exit(0 if ipaddress.ip_address(sys.argv[1]) in ipaddress.ip_network(sys.argv[2]) else 1)' \
    "${ip:-0.0.0.0}" "$range" || { echo "api.anthropic.com resolves to ${ip:-nothing}, outside $range" >&2; exit 1; }
  printf '%s api.anthropic.com\n' "$ip" >> /etc/hosts
fi

chain="BUG_AGENT_$uid"
for t in iptables ip6tables; do
  "$t" -w -N "$chain" 2> /dev/null || "$t" -w -F "$chain"
  "$t" -w -C OUTPUT -m owner --uid-owner "$uid" -j "$chain" 2> /dev/null || "$t" -w -I OUTPUT 1 -m owner --uid-owner "$uid" -j "$chain"
  "$t" -w -A "$chain" -p udp --dport 53 -j REJECT
  "$t" -w -A "$chain" -p tcp --dport 53 -j REJECT
  "$t" -w -A "$chain" -o lo -j ACCEPT
done
if [ "$mode" = api ]; then iptables -w -A "$chain" -p tcp -d "$range" --dport 443 -j ACCEPT; fi
iptables -w -A "$chain" -j REJECT
ip6tables -w -A "$chain" -j REJECT
echo "jail: $user ($uid), network: $mode"
