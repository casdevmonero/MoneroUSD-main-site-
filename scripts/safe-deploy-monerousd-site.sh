#!/usr/bin/env bash
# safe-deploy-monerousd-site.sh
#
# Hard guard against the v1.2.182 incident:
#   - I (Claude) ran `rsync` with a local `whitepaper.html` / `developers.html`
#     that was OLDER than what was on /var/www/monerousd-site/ on the VPS.
#     The local nav was missing "Ion Swap" / "Developers" / hamburger /
#     no-Open-Wallet edits the user had made directly on the VPS. The
#     deploy silently overwrote the user's edits.
#
# This script is the ONLY supported way to push *.html to
# /var/www/monerousd-site/ on the VPS. It enforces three guards:
#
#   1. **Backup-first**  — every target file is copied to a timestamped
#      backup at /var/www/monerousd-site/.deploy-backups/<file>.<ts>
#      BEFORE the new bytes land, so a regression is recoverable.
#
#   2. **Nav diff inspection** — counts <a href> entries inside the
#      <nav> block of the local vs. live file. If the local has FEWER
#      nav links, the deploy aborts unless `--allow-nav-shrink` is
#      explicitly passed.
#
#   3. **Explicit per-page confirmation** — the script REQUIRES
#      `--confirm-page=<filename>` for each file being deployed. There
#      is no `--all` flag. Every page is acknowledged individually.
#
# USAGE
# ─────
#   bash scripts/safe-deploy-monerousd-site.sh \
#       --src /local/path/whitepaper.html \
#       --confirm-page whitepaper.html \
#       [--allow-nav-shrink]
#
#   bash scripts/safe-deploy-monerousd-site.sh \
#       --src /local/path/index.html \
#       --confirm-page index.html
#
# The script REFUSES to:
#   - Run with `*` / glob expansion (one file per invocation)
#   - Run if the live file is newer than the local file (without --force-stale)
#   - Run if `--confirm-page` doesn't match the basename of `--src`

set -euo pipefail

VPS_HOST="${VPS_HOST:-root@148.163.122.39}"
VPS_TARGET_DIR="${VPS_TARGET_DIR:-/var/www/monerousd-site}"
BACKUP_DIR="${VPS_TARGET_DIR}/.deploy-backups"

SRC=""
CONFIRM=""
ALLOW_NAV_SHRINK=0
FORCE_STALE=0
ASSUME_YES=0

while [ $# -gt 0 ]; do
  case "$1" in
    --src) SRC="$2"; shift 2 ;;
    --confirm-page) CONFIRM="$2"; shift 2 ;;
    --allow-nav-shrink) ALLOW_NAV_SHRINK=1; shift ;;
    --force-stale) FORCE_STALE=1; shift ;;
    # --yes-i-already-typed-the-confirmation skips the interactive prompt.
    # Use this ONLY in scripted bulk deploys where every other guard has
    # already passed AND the operator has reviewed the diff up-front. The
    # flag is intentionally verbose so a careless `--yes` typo doesn't
    # bypass the safety net.
    --yes-i-already-typed-the-confirmation) ASSUME_YES=1; shift ;;
    -h|--help)
      sed -n '/^# USAGE/,/^# The script REFUSES/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "ERROR: unknown flag: $1" >&2
      exit 2
      ;;
  esac
done

if [ -z "$SRC" ] || [ -z "$CONFIRM" ]; then
  echo "ERROR: --src and --confirm-page are both required." >&2
  echo "Run with --help for usage." >&2
  exit 2
fi

if [ ! -f "$SRC" ]; then
  echo "ERROR: --src file not found: $SRC" >&2
  exit 2
fi

BASENAME="$(basename "$SRC")"
if [ "$BASENAME" != "$CONFIRM" ]; then
  echo "ERROR: --confirm-page ($CONFIRM) does not match basename of --src ($BASENAME)." >&2
  echo "       This guard prevents a tab-completed wrong filename from being deployed." >&2
  exit 2
fi

# Refuse multi-file glob expansion. If $SRC contains a literal '*', abort.
if echo "$SRC" | grep -q '[*?]'; then
  echo "ERROR: glob characters in --src are forbidden. One file per invocation." >&2
  exit 2
fi

echo "============================================================"
echo "  safe-deploy-monerousd-site.sh"
echo "  Source     : $SRC"
echo "  Target     : ${VPS_HOST}:${VPS_TARGET_DIR}/${BASENAME}"
echo "============================================================"

# ─── Guard 1: live-newer-than-local check ───────────────────────────
LOCAL_MTIME="$(stat -f %m "$SRC" 2>/dev/null || stat -c %Y "$SRC")"
LIVE_MTIME="$(ssh -o BatchMode=yes "$VPS_HOST" \
  "stat -c %Y '${VPS_TARGET_DIR}/${BASENAME}' 2>/dev/null || echo 0")"

if [ "$LIVE_MTIME" -gt "$LOCAL_MTIME" ]; then
  echo ""
  echo "WARN: live file is NEWER than local file."
  echo "      live  mtime: $(date -r "$LIVE_MTIME" 2>/dev/null || echo "$LIVE_MTIME")"
  echo "      local mtime: $(date -r "$LOCAL_MTIME" 2>/dev/null || echo "$LOCAL_MTIME")"
  echo ""
  echo "      This is exactly the v1.2.182 failure mode — a stale local copy"
  echo "      overwriting fresh user edits on the VPS."
  if [ "$FORCE_STALE" -ne 1 ]; then
    echo "      ABORT. Re-pull the live file first (rsync from VPS), or pass"
    echo "      --force-stale if you genuinely intend to overwrite newer bytes."
    exit 3
  fi
  echo "      --force-stale was passed; proceeding with EXPLICIT user override."
fi

# ─── Guard 2: nav-link count check ───────────────────────────────────
count_nav_links() {
  awk '/<nav>/,/<\/nav>/' "$1" | grep -c '<a href' || true
}

count_nav_links_live() {
  ssh -o BatchMode=yes "$VPS_HOST" "awk '/<nav>/,/<\\/nav>/' '${VPS_TARGET_DIR}/${BASENAME}' 2>/dev/null | grep -c '<a href' || true"
}

LOCAL_NAV_COUNT="$(count_nav_links "$SRC")"
LIVE_NAV_COUNT="$(count_nav_links_live)"

echo ""
echo "  local nav <a href> count: $LOCAL_NAV_COUNT"
echo "  live  nav <a href> count: $LIVE_NAV_COUNT"

if [ "$LOCAL_NAV_COUNT" -lt "$LIVE_NAV_COUNT" ] && [ "$ALLOW_NAV_SHRINK" -ne 1 ]; then
  echo ""
  echo "ERROR: local nav has FEWER links than live nav."
  echo "       This is the v1.2.182 failure-mode signature."
  echo "       ABORT. Pass --allow-nav-shrink ONLY if the user has explicitly"
  echo "       approved removing nav items in this exact deploy."
  echo ""
  echo "       Live nav links currently on ${BASENAME}:"
  ssh -o BatchMode=yes "$VPS_HOST" "awk '/<nav>/,/<\\/nav>/' '${VPS_TARGET_DIR}/${BASENAME}' 2>/dev/null | grep '<a href' | sed 's/^/         /'"
  exit 4
fi

# ─── Guard 3: timestamped backup ────────────────────────────────────
TS="$(date +%s)"
ssh -o BatchMode=yes "$VPS_HOST" "
  set -e
  mkdir -p '${BACKUP_DIR}'
  if [ -f '${VPS_TARGET_DIR}/${BASENAME}' ]; then
    cp -p '${VPS_TARGET_DIR}/${BASENAME}' '${BACKUP_DIR}/${BASENAME}.${TS}'
    echo '  Backed up live file to ${BACKUP_DIR}/${BASENAME}.${TS}'
  else
    echo '  (no existing live file at ${VPS_TARGET_DIR}/${BASENAME} — first deploy)'
  fi
"

# ─── Final confirmation prompt ──────────────────────────────────────
echo ""
echo "About to deploy:"
echo "    $SRC  →  ${VPS_HOST}:${VPS_TARGET_DIR}/${BASENAME}"
echo ""
if [ "$ASSUME_YES" -eq 1 ]; then
  echo "  --yes-i-already-typed-the-confirmation passed — skipping interactive prompt."
else
  echo "Type 'YES OVERWRITE ${BASENAME}' to proceed, anything else aborts:"
  read -r REPLY
  if [ "$REPLY" != "YES OVERWRITE ${BASENAME}" ]; then
    echo "  ABORTED by user."
    exit 5
  fi
fi

# ─── Deploy ─────────────────────────────────────────────────────────
rsync -avz "$SRC" "${VPS_HOST}:${VPS_TARGET_DIR}/${BASENAME}"

echo ""
echo "  ✓ Deployed."
echo "  ✓ Backup of previous live: ${BACKUP_DIR}/${BASENAME}.${TS}"
echo "  ✓ To roll back: ssh ${VPS_HOST} 'cp ${BACKUP_DIR}/${BASENAME}.${TS} ${VPS_TARGET_DIR}/${BASENAME}'"
