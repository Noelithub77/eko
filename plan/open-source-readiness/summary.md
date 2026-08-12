# Open-source readiness

## Goal

Prepare Eko for public collaboration under the GNU Affero General Public License v3.0 or later.

## Chosen decisions

- Use `AGPL-3.0-or-later` for the repository, package metadata, Rust crate, and contributor guidance.
- Use a fork-and-pull-request workflow for outside contributors.
- Keep the upstream repository's branches for maintainers and protected automation.
- Add clear issue, security, support, code-of-conduct, and pull-request guidance.
- Keep README claims limited to behavior already described by the project architecture and setup docs.

## Remaining release checks

- Confirm the repository is ready to change from private to public.
- Review all Git history for secrets, generated files, signing material, and private data before changing visibility.
- Add GitHub repository rulesets, branch protection, and Actions permissions.
- Confirm the final release assets, updater metadata, and signing process from a clean release run.
