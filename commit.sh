git add -A

if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git commit -m "Complete platform workflow and RFP feature foundations"
  git push -u origin main
fi
