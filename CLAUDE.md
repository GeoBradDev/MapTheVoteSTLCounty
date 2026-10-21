# MapTheVoteSTLCounty

See `README.md` for commands, the CI gate and project rules.

## Git exception

For the `/work-issue` workflow only, Claude may run `git commit` and `git push` on the
`issue-<N>-*` branch that run created, open its pull request with `gh pr create`, and
squash-merge that pull request with `gh pr merge --squash --delete-branch` once every CI
check is green. This overrides the global "never commit or push" rule for that workflow in
this repo. It never covers pushing to `main`, force pushing to `main`, rewriting `main`'s
history, or merging a pull request with a failing or pending check.
