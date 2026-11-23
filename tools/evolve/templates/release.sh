#!/bin/bash
# Release template (the pinned strategy's C8, A4.3 to A4.6, mapped to umlimator's CI release in .github/workflows/check.yml).
# Merges a release PR once it and main's runs are green, then watches CI's release, smoke and promote jobs.
# Run it from the repository root after the release agent's two reviews passed (A4.3); it does not review.
# usage: release.sh PR            (env: PUSH_USER, the account whose gh token is used; REPO, default zintaen/umlimator;
#                                  APPROVED=1 once the maintainer approved a minor or major release on the PR)
# Exit 0 released; 1 red CI or a failed check; 2 the merge failed; 3 the release waits for the maintainer; 4 kill switch set.
set -u
p=${1:?usage: release.sh PR}
R=${REPO:-zintaen/umlimator}
export GH_TOKEN="$(gh auth token --user "${PUSH_USER:-zintaen}")"
red() { grep -q -E 'failure|cancelled|timed_out|startup_failure' <<<"$1"; }   # a cancelled or timed-out run is red too

# C3 step 3 and A7.4: the kill switch is checked before every release step; set, only a pending hotfix or release pull may go on
git fetch -q origin
if ! node tools/evolve/killswitch.mjs --ref origin/main; then [ "${HOTFIX:-}" = 1 ] || { echo "kill switch set: no release"; exit 4; }; fi

# C8 approval: a patch ships once its two reviews pass and CI is green; minor and major wait for the maintainer (silence is never approval)
head=$(gh pr view "$p" --repo "$R" --json headRefOid --jq .headRefOid)
new=$(git show "$head:package.json" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).version))') || { git fetch -q origin "$head"; new=$(git show "$head:package.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).version))'); }
old=$(git show origin/main:package.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).version))')
kind=$(node -e 'const [a,b]=process.argv.slice(1).map(v=>v.split(".").map(Number));console.log(b[0]!==a[0]?"major":b[1]!==a[1]?"minor":b[2]!==a[2]?"patch":"none")' "$old" "$new")
echo "release $old -> $new ($kind) from PR #$p at $head"
[ "$kind" = none ] && { echo "the PR does not bump package.json's version"; exit 1; }
if [ "$kind" != patch ] && [ "${APPROVED:-}" != 1 ]; then echo "a $kind release waits for the maintainer's approval on PR #$p (A4.3)"; exit 3; fi

while :; do
  m=$(gh run list --repo "$R" --branch main --limit 5 --json status,conclusion,headSha --jq '.[]|"\(.status) \(.conclusion) \(.headSha[0:7])"')
  sha=$(gh pr view "$p" --repo "$R" --json headRefOid --jq .headRefOid)
  s=$(gh run list --repo "$R" --commit "$sha" --json status,conclusion --jq '.[]|"\(.status) \(.conclusion)"')
  if ! grep -v '^completed' <<<"$m" | grep -q . && [ -n "$s" ] && ! grep -v '^completed' <<<"$s" | grep -q .; then break; fi; sleep 30; done
echo "main:"; echo "$m"; echo "#$p: $s"
[ "$sha" = "$head" ] || { echo "the PR moved from $head to $sha after it was checked: approvals bind to one head (A4.3); run again"; exit 1; }
latest=$(head -1 <<<"$m"); red "$latest$s" && { echo RED; exit 1; }

# A4.5: the release is the audited commit plus only the release changes. CI tags the merge commit (umlimator's delivery
# mapping), so the merge must add nothing to the PR head: main must already be in the head, the merge is bound to the
# checked head, and the trees are compared after it.
git merge-base --is-ancestor origin/main "$head" || { echo "main has commits the release PR lacks: its merge commit would ship unaudited changes; move the PR to a newer audited commit (A4.5)"; exit 1; }
gh pr merge "$p" --repo "$R" --merge --match-head-commit "$head" || exit 2
M=$(gh pr view "$p" --repo "$R" --json mergeCommit --jq .mergeCommit.oid); echo "merged $M"
git fetch -q origin
if [ "$(git rev-parse "$M^{tree}")" != "$(git rev-parse "$head^{tree}")" ]; then
  echo "the merge commit $M does not have the PR head's tree: main moved after the release PR was audited; CI will tag $M. Stop the release jobs and ask the maintainer (A4.1, A4.5)"; exit 1
fi
sleep 30; while :; do s=$(gh run list --repo "$R" --commit "$M" --json status,conclusion --jq '.[]|"\(.status) \(.conclusion)"'); [ -n "$s" ] && ! grep -v '^completed' <<<"$s" | grep -q . && break; sleep 30; done
echo "$s"; gh release list --repo "$R" --limit 1; sleep 120; npm view umlimator dist-tags --prefer-online
red "$s" && { echo "a release job failed: the version stays on next and latest is unchanged; see CONTRIBUTING.md, Releases"; exit 1; }
exit 0
