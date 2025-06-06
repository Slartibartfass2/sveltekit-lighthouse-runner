# SvelteKit Lighthouse Runner

Lighthouse runner for SvelteKit applications that automatically discovers your application routes and runs performance audits against them.

## Installation

```bash
# Install globally
npm install -g sveltekit-lighthouse-runner lighthouse

# Or as a dev dependency in your project
npm install --save-dev sveltekit-lighthouse-runner lighthouse
```

## Features

- Automatically discovers all routes in your SvelteKit application
- Handles SvelteKit's file-based routing system, including layout groups and dynamic parameters
- Run audits on all routes or select specific routes interactively
- Generates HTML reports with performance metrics
- Creates an index page linking to all reports with category scores for each page
- Shows performance, accessibility, best practices, and SEO scores for each page
- Displays average scores across all audited pages
- Supports CI environments with parameter value configuration

## Usage

### Basic Usage

```bash
# Run interactively (select a route from the list)
npx sveltekit-lighthouse-runner

# Audit all routes
npx sveltekit-lighthouse-runner --all

# Only audit routes in a specific directory
npx sveltekit-lighthouse-runner --dir=/settings

# Ignore specific routes when running audits
npx sveltekit-lighthouse-runner --all --ignore=/api/*,/admin

# Run with a custom base URL
npx sveltekit-lighthouse-runner --url=https://example.com

# Run with a custom Lighthouse configuration file
npx sveltekit-lighthouse-runner --config=./my-lighthouse-config.js
```

### Options

| Option                    | Description                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `-a, --all`               | Run on all routes                                                                   |
| `-d, --dir <directory>`   | Only routes in the specified directory (e.g., `/settings`)                          |
| `-q, --quiet`             | Suppress detailed Lighthouse output                                                 |
| `-v, --view`              | Open report in browser when completed                                               |
| `-u, --url <url>`         | Base URL for audits (default: `http://localhost:5173`)                              |
| `-p, --params <values>`   | Parameter values in format `param1=value1,param2=value2` for routes with parameters |
| `-c, --config <path>`     | Custom path to lighthouse config file                                               |
| `-i, --ignore <patterns>` | Ignore routes matching these patterns (comma-separated, supports \* wildcard)       |
| `-A, --auth <path>`       | Path to authentication JSON config file                                             |

### Authentication Configuration

For sites requiring authentication, you can provide a JSON file with authentication steps:

```bash
npx sveltekit-lighthouse-runner --all --auth=./auth-config.json
```

The authentication JSON file should have the following structure:

```json
{
  "url": "http://localhost:4173/signin",
  "steps": [
    {
      "type": "type",
      "locator": "input[id='email-input']",
      "input": "john.doe@example.com"
    },
    {
      "type": "type",
      "locator": "input[id='password-input']",
      "input": "password123"
    },
    {
      "type": "click",
      "locator": "button[type='submit']"
    }
  ],
  "requiredCookies": ["session_id", "auth_token"]
}
```

The file contains:

- `url`: The authentication page URL
- `steps`: An array of actions to perform, where each step can be:
  - `type`: Input text into a field (`locator` and `input` properties required)
  - `click`: Click on an element (`locator` property required)
- `requiredCookies`: An array of cookie names that must be set after authentication to proceed with audits

### CI Environment Usage

When running in a CI environment without user interaction, you need to provide values for all route parameters using the `--params` option. The application will exit with an error if any required parameters are missing, preventing reports from being generated with incorrect or default values.

```bash
# Audit all routes with parameters
npx sveltekit-lighthouse-runner --all --params="id=123,slug=example"

# Example GitHub Actions job
npx sveltekit-lighthouse-runner --all --quiet --params="userId=test-user,productId=sample-product"
```

If you encounter an error about missing parameters, the tool will tell you exactly which parameters are missing and need to be provided.

## Example GitHub Actions Workflow

```yaml
name: Lighthouse Performance Audit

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "18"

      - name: Install dependencies
        run: npm ci

      - name: Build site
        run: npm run build

      - name: Start preview server
        run: npm run preview &

      - name: Run Lighthouse audits
        run: npx sveltekit-lighthouse-runner --all --params="id=123,slug=example" --url=http://localhost:4173

      - name: Upload Lighthouse reports
        uses: actions/upload-artifact@v3
        with:
          name: lighthouse-reports
          path: lighthouse-reports/
```

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/Slartibartfass2/sveltekit-lighthouse-runner.git
cd sveltekit-lighthouse-runner

# Install dependencies
npm install
```

### Available Scripts

- `npm run build` - Compiles TypeScript files to JavaScript
- `npm run dev` - Watches for changes and recompiles (useful during development)
- `npm start` - Runs the CLI tool
- `npm run prepare` - Automatically runs before publishing (builds the project)

### Project Structure

```
├── bin/                  # CLI entry point
├── src/                  # TypeScript source code
│   ├── lighthouse/       # Lighthouse audit functionality
│   └── utils/            # Utility functions
└── dist/                 # Compiled JavaScript (generated)
```

### Release Procedure

When preparing a new release:

1. Update the version number in `package.json`
2. Update the version number in the CLI command in `src/index.ts`
3. Add the new version to the `CHANGELOG.md`
4. Build the project and verify it works:

   ```bash
   npm run build
   npm start
   ```

5. Commit changes with message "Release vx.y.z"
6. Create a new tag for the release:

   ```bash
   git tag -a vx.y.z -m "Version x.y.z"
   ```

7. Push changes and tags:

   ```bash
   git push
   git push --tags
   ```

8. Publish to npm:

   ```bash
   npm publish
   ```

## License

GPL-3.0
