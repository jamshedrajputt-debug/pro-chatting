# Run this script from the project root to initialize Git and push to GitHub.
# Replace <your-username> and <repo-name> before running.

git init
git add .
git commit -m "Initial project commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
