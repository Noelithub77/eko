# Contributing to Eko

Thanks for helping improve Eko. The project is still early, so small, focused pull requests are especially useful.

## Collaboration model

Eko uses a fork-and-pull-request workflow:

1. Fork `Noelithub77/eko` to your own GitHub account.
2. Clone your fork and keep the upstream repository as a second remote.
3. Create a short-lived branch on your fork, such as `fix/android-reconnect`.
4. Make and test your change.
5. Push the branch to your fork.
6. Open a pull request from your fork into `Noelithub77/eko:main`.

Do not create contributor branches directly on the upstream repository. Maintainers keep the upstream branches for project work, release work, and protected automation.

Example setup:

```powershell
git clone https://github.com/YOUR_USERNAME/eko.git
cd eko
git remote add upstream https://github.com/Noelithub77/eko.git
git switch -c fix/short-description
```

Before starting new work:

```powershell
git fetch upstream
git switch main
git merge --ff-only upstream/main
git switch -c fix/short-description
```

## Before opening a pull request

- Keep the change focused and explain the user problem it solves.
- Update documentation when behavior or setup changes.
- Do not commit secrets, tokens, private keys, pairing links, real audio, personal data, or generated build output.
- Do not add manual IP entry, open device access, or automatic approval paths.
- Keep the desktop as the authority for approval and session access.
- Run the checks relevant to the files you changed.
- Add or update tests for behavior that can be tested without a physical device.
- Call out anything that still needs real Android or network testing.

Baseline checks:

```powershell
pnpm test:types
pnpm lint
pnpm test:core
cd rust
cargo check
```

## Pull request expectations

Pull requests should include:

- A short problem statement.
- A summary of the change.
- Tests that passed and tests that were not run.
- Attach screenshots that show the relevant behavior, test output, or documentation preview when useful.
- Device, operating-system, and network details for pairing or streaming changes.
- Any security or privacy impact.

Maintainers may ask for a smaller change, clearer tests, or a follow-up issue before merging. Please keep review discussion focused on the code and the user experience.

## Commit and branch names

Use simple, descriptive names. Examples:

- `fix: recover Android playback after reconnect`
- `docs: explain fork workflow`
- `test: cover session approval timeout`

Use a branch name that describes the work, such as `fix/android-reconnect` or `docs/setup-windows`.

## License

By contributing, you agree that your contribution is provided under the [GNU Affero General Public License v3.0 or later](../LICENSE). Forks and modified versions must preserve the same AGPL license terms.
