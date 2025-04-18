/**
 * Utility functions for file operations and browser interactions
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import chalk from "chalk";

export const REPORTS_DIR: string = path.join(process.cwd(), "lighthouse-reports");

/**
 * Interface for a Lighthouse report
 */
export interface LighthouseReport {
    outputPath: string;
    route: string;
    url: string;
}

/**
 * Open a file using the platform-specific approach
 * Uses execSync to ensure only one command runs at a time
 */
export function openFileInBrowser(filePath: string): boolean {
    console.log(chalk.blue(`Opening file in browser: ${filePath}`));

    try {
        // For Windows
        if (process.platform === "win32") {
            // Try the most reliable method first - the start command
            try {
                console.log("Using Windows start command...");
                execSync(`start "" "${filePath}"`, { stdio: "ignore" });
                return true;
            } catch {
                console.log(`Windows start command failed, trying alternative...`);
            }

            // If that fails, try explorer
            try {
                console.log("Using explorer command...");
                execSync(`explorer "${filePath}"`, { stdio: "ignore" });
                return true;
            } catch (err) {
                console.error(
                    chalk.red(`Failed to open file with explorer: ${(err as Error).message}`),
                );
            }
        }
        // For macOS
        else if (process.platform === "darwin") {
            execSync(`open "${filePath}"`, { stdio: "ignore" });
            return true;
        }
        // For Linux and others
        else {
            execSync(`xdg-open "${filePath}"`, { stdio: "ignore" });
            return true;
        }

        // If all attempts failed, return false
        return false;
    } catch (error) {
        console.error(chalk.red(`Error opening file: ${(error as Error).message}`));
        return false;
    }
}

// Track the current report directory
let currentReportDir: string | null = null;

/**
 * Get or create a timestamped directory for reports
 */
export function getReportDir(): string {
    if (!currentReportDir) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        currentReportDir = path.join(REPORTS_DIR, `report-${timestamp}`);

        if (!fs.existsSync(currentReportDir)) {
            fs.mkdirSync(currentReportDir, { recursive: true });
            console.log(`Created report directory: ${currentReportDir}`);
        }
    }

    return currentReportDir;
}

/**
 * Ensure the reports directory exists
 */
export function ensureReportsDir(): void {
    if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
}

/**
 * Normalize a file path to use forward slashes for URLs
 */
export function normalizeUrlPath(pathParts: string[]): string {
    let result = path.join(...pathParts);
    result = result.replace(/\\/g, "/");
    return result;
}

/**
 * Generate an HTML index file with links to all Lighthouse reports
 */
export function generateReportIndex(
    reports: LighthouseReport[],
    reportDir: string,
    baseUrl: string,
    customSubDir: string | undefined,
    openReport: boolean = false,
): string {
    const indexPath = path.join(reportDir, "index.html");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lighthouse Reports Index</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        h1 {
            border-bottom: 1px solid #eaecef;
            padding-bottom: 10px;
        }
        .report-list {
            list-style-type: none;
            padding: 0;
        }
        .report-item {
            margin: 10px 0;
            padding: 15px;
            background-color: #f6f8fa;
            border-radius: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .report-item:hover {
            background-color: #eef1f5;
        }
        .route {
            font-weight: bold;
            flex: 1;
        }
        a {
            color: #0366d6;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .meta-info {
            color: #666;
            font-size: 0.9em;
            margin-top: 30px;
            border-top: 1px solid #eaecef;
            padding-top: 10px;
        }
    </style>
</head>
<body>
    <h1>Lighthouse Reports</h1>
    <p>Generated on ${new Date().toLocaleString()}</p>
    <ul class="report-list">
        ${reports
            .map((report) => {
                // Get just the filename from the full path
                const reportFilename = path.basename(report.outputPath);
                return `
            <li class="report-item">
                <span class="route">${report.route}</span>
                <a href="./${reportFilename}" target="_blank">View Report</a>
            </li>`;
            })
            .join("")}
    </ul>
    <div class="meta-info">
        <p>Base URL: ${baseUrl}</p>
        <p>Subdirectory: ${customSubDir || "None"}</p>
        <p>Total reports: ${reports.length}</p>
    </div>
</body>
</html>`;

    fs.writeFileSync(indexPath, html);
    console.log(chalk.green(`\nIndex generated at: ${indexPath}`));

    const rootIndexPath = path.join(REPORTS_DIR, "index.html");
    const relativePath = path.relative(REPORTS_DIR, reportDir);

    const rootHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="0;url=${relativePath}/index.html">
    <title>Redirecting to latest Lighthouse reports</title>
</head>
<body>
    <p>Redirecting to the latest Lighthouse reports...</p>
    <p><a href="${relativePath}/index.html">Click here if you are not redirected</a></p>
</body>
</html>`;

    fs.writeFileSync(rootIndexPath, rootHtml);

    if (openReport) {
        console.log(chalk.blue(`Opening report index in browser...`));
        openFileInBrowser(indexPath);
    }

    return indexPath;
}
