#!/usr/bin/env bash
set -euo pipefail

version=$(grep -m1 '"version"' manifest.json | sed -E 's/.*"([0-9.]+)".*/\1/')
zip="TikTok-Plus-$version.zip"

if [ -n "$(git status --porcelain)" ]; then
  echo "Commit your changes first." >&2
  exit 1
fi

git push
git archive --format=zip --prefix="TikTok-Plus/" -o "$zip" HEAD
notes=$(awk -v v="## $version" '$0 == v { found = 1; next } /^## / && found { exit } found' CHANGELOG.md)
gh release create "v$version" "$zip" --title "TikTok+ $version" --notes "${notes:-TikTok+ $version}"
rm "$zip"
echo "Released $version"
