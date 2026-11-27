# Repository Guidelines

## Project Structure

This repository starts with this guide. When adding the first module, document the locations of source code, tests, and any fixtures or assets in the README. Follow the chosen language's standard project layout so contributors can find the entry point and its tests. Keep test fixtures with the tests that use them.

## Build, Test, and Development

When introducing tooling, add the commands for installing dependencies, building, running locally, and testing to the README. Include the required runtime version and specify which directory to run each command from. Keep local verification commands aligned with CI once it is configured.

## Coding Style and Naming

Use the formatter and naming conventions of the language you introduce. If formatting or linting needs project-specific settings, check those settings in with the code and document how to run the tools. Name modules and files for their responsibilities. Keep formatting changes scoped to the code you touch.

## Testing

Add tests for new behavior and include a regression test when fixing a bug that the test suite can reproduce. Name tests for the behavior and condition they verify. For example, a test for configuration loading could be named `rejects_missing_required_config` if the framework supports that convention. Document how to run the full suite and a single test when the first test framework is added.

## Commits and Pull Requests

Use short, imperative commit subjects such as “Document local setup.” In pull requests, describe the change and why it was made, list the verification you ran, and link a related issue when one exists. Include screenshots when a change affects the user interface.
