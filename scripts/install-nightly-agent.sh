#!/usr/bin/env bash
set -euo pipefail

# Put `local-nightly.sh` on a schedule, as a launchd **agent**.
#
# ## Agent, not daemon, and that is a decision
#
# A LaunchDaemon runs as root at boot and would survive the user being logged
# out. It also needs `sudo`, lives in `/Library/LaunchDaemons`, and cannot show
# a notification on anybody's screen. The two things this job must be able to do
# are read `~/.config/coditu/` and be *noticed* when it is unhappy, so it runs
# as the user, in the user's session.
#
# ## `StartCalendarInterval`, not `StartInterval`
#
# `StartInterval` counts seconds since load and drifts. A calendar interval
# fires at a wall-clock time, and — the part that matters on a laptop — launchd
# runs a missed calendar job **as soon as the machine wakes**. A Mac that was
# closed at 02:00 and opened at 09:00 backs up at 09:00 rather than skipping the
# night. That halves the failure this whole design is exposed to.
#
# It does not eliminate it, and it is not supposed to: a Mac that stays shut for
# two days misses two nights, healthchecks.io notices at the grace period, and
# **that visibility is the point**. This job is allowed to fail. It is not
# allowed to fail quietly.
#
# ## Usage
#
#   scripts/install-nightly-agent.sh            install and load
#   scripts/install-nightly-agent.sh --status   is it loaded, and when did it last run
#   scripts/install-nightly-agent.sh --remove   unload and delete

umask 077

agent_label="com.coditu.nightly"
agent_plist="$HOME/Library/LaunchAgents/$agent_label.plist"
agent_root=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
agent_log_dir=${CODITU_NIGHTLY_LOG_DIR:-$HOME/.local/state/coditu}
agent_uid=$(id -u)

fail() {
  printf 'install-nightly-agent: %s\n' "$*" >&2
  exit 1
}

case "${1:-install}" in
  --status)
    launchctl print "gui/$agent_uid/$agent_label" 2>/dev/null |
      grep -E 'state =|last exit code =|program =' || printf 'not loaded\n'
    printf '\nlast run:\n'
    tail -5 "$agent_log_dir/nightly.log" 2>/dev/null || printf '  no log yet\n'
    exit 0
    ;;
  --remove)
    launchctl bootout "gui/$agent_uid/$agent_label" 2>/dev/null || true
    rm -f "$agent_plist"
    printf 'removed %s\n' "$agent_plist"
    exit 0
    ;;
  install) ;;
  *) fail "usage: install-nightly-agent.sh [--status|--remove]" ;;
esac

[ "$(uname -s)" = "Darwin" ] || fail "launchd is macOS only"

# Refuse to schedule a job that cannot run. Installing a broken agent is how a
# backup ends up "automated" and absent at the same time — the failure this
# whole pass exists to stop.
"$agent_root/scripts/local-nightly.sh" --dry-run || \
  fail "the job is not runnable yet; fix the configuration above, then install"

mkdir -p "$HOME/Library/LaunchAgents" "$agent_log_dir"

# launchd gives a job almost no environment: no PATH beyond the system default,
# no Homebrew, no `gh`, no `supabase`, no `docker`. Every one of those is a tool
# `local-nightly.sh` checks for, so an agent with the default PATH fails on the
# first check — correctly, and pointlessly. The PATH is carried explicitly.
agent_path="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.docker/bin"

cat > "$agent_plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$agent_label</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>exec "$agent_root/scripts/local-nightly.sh"</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$agent_path</string>
    <key>HOME</key><string>$HOME</string>
  </dict>

  <!-- 02:00 local. Late enough that the day's work is in, early enough that a
       failure is on the screen before anybody starts. -->
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>2</integer>
    <key>Minute</key><integer>0</integer>
  </dict>

  <key>StandardOutPath</key><string>$agent_log_dir/nightly.log</string>
  <key>StandardErrorPath</key><string>$agent_log_dir/nightly.log</string>

  <key>WorkingDirectory</key><string>$agent_root</string>

  <!-- Deliberately absent: RunAtLoad. Installing the agent must not fire a
       backup, or every edit to this file writes a release. -->
</dict>
</plist>
PLIST

launchctl bootout "gui/$agent_uid/$agent_label" 2>/dev/null || true
launchctl bootstrap "gui/$agent_uid" "$agent_plist"

printf 'installed %s\n' "$agent_plist"
printf 'runs 02:00 local, and on the next wake if the Mac was asleep\n'
printf 'run it now:   launchctl kickstart -p gui/%s/%s\n' "$agent_uid" "$agent_label"
printf 'log:          %s/nightly.log\n' "$agent_log_dir"
