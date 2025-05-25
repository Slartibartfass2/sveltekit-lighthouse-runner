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
    scores?: {
        performance?: number;
        accessibility?: number;
        bestPractices?: number;
        seo?: number;
    };
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
                execSync(`start "" "${filePath}"`, { stdio: "ignore" });
                return true;
            } catch {
                console.log(`Windows start command failed, trying alternative...`);
            }

            // If that fails, try explorer
            try {
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
 * Generate a summary of average scores across all reports
 */
function generateAverageScoresSummary(reports: LighthouseReport[]): string {
    // If no reports have scores, return empty string
    if (!reports.some((report) => report.scores)) {
        return "";
    }

    // Initialize score counters
    const totals: Record<string, { sum: number; count: number }> = {
        performance: { sum: 0, count: 0 },
        accessibility: { sum: 0, count: 0 },
        bestPractices: { sum: 0, count: 0 },
        seo: { sum: 0, count: 0 },
    };

    // Calculate totals
    reports.forEach((report) => {
        if (report.scores) {
            const typedScores = report.scores as Record<string, number | undefined>;

            Object.entries(typedScores).forEach(([key, value]) => {
                if (value !== undefined) {
                    totals[key].sum += value;
                    totals[key].count++;
                }
            });
        }
    });

    // Generate HTML for average scores
    let html = '<div class="average-scores">';
    html += "<h3>Average Scores</h3>";
    html += '<div class="scores">';

    const categories = [
        { name: "Performance", key: "performance" },
        { name: "Accessibility", key: "accessibility" },
        { name: "Best Practices", key: "bestPractices" },
        { name: "SEO", key: "seo" },
    ];

    categories.forEach((category) => {
        const { sum, count } = totals[category.key];
        if (count > 0) {
            const average = Math.floor((sum / count) * 100);
            let colorClass = "";
            if (average >= 90) colorClass = "score-good";
            else if (average >= 50) colorClass = "score-average";
            else colorClass = "score-poor";

            html += `<span class="score-badge ${colorClass}" title="Average ${category.name}: ${average}%">
                ${category.name}: ${average}%
            </span>`;
        }
    });

    html += "</div></div>";
    return html;
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
            flex-wrap: wrap;
        }
        .report-item:hover {
            background-color: #eef1f5;
        }
        .route {
            font-weight: bold;
            flex: 1;
            min-width: 150px;
            margin-right: 10px;
        }
        .scores {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            flex: 3;
        }
        .score-badge {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
            color: white;
            display: inline-block;
            text-align: center;
            white-space: nowrap;
        }
        .score-good {
            background-color: #0cce6b;
        }
        .score-average {
            background-color: #ffa400;
        }
        .score-poor {
            background-color: #ff4e42;
        }
        a {
            color: #0366d6;
            text-decoration: none;
            margin-left: 10px;
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
        .average-scores {
            margin-top: 20px;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 6px;
        }
        .average-scores h3 {
            margin-top: 0;
            margin-bottom: 10px;
            color: #333;
            font-size: 16px;
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

                // Generate score badges for each category
                let scoreHtml = "";
                if (report.scores) {
                    const categories = [
                        { name: "Performance", key: "performance" },
                        { name: "Accessibility", key: "accessibility" },
                        { name: "Best Practices", key: "bestPractices" },
                        { name: "SEO", key: "seo" },
                    ];

                    scoreHtml = `<div class="scores">
                        ${categories
                            .map((category) => {
                                // Only show score if it exists
                                // Type assertion to handle string index
                                const typedScores = report.scores as Record<
                                    string,
                                    number | undefined
                                >;

                                if (typedScores && typedScores[category.key] !== undefined) {
                                    const score = Math.floor(typedScores[category.key]! * 100);
                                    let colorClass = "";
                                    if (score >= 90) colorClass = "score-good";
                                    else if (score >= 50) colorClass = "score-average";
                                    else colorClass = "score-poor";

                                    return `<span class="score-badge ${colorClass}" title="${category.name}: ${score}%">
                                    ${category.name}: ${score}%
                                </span>`;
                                }
                                return "";
                            })
                            .join("")}
                    </div>`;
                }

                return `
            <li class="report-item">
                <span class="route">${report.route}</span>
                ${scoreHtml}
                <a href="./${reportFilename}" target="_blank">View Report</a>
            </li>`;
            })
            .join("")}
    </ul>
    <div class="meta-info">
        <p>Base URL: ${baseUrl}</p>
        <p>Subdirectory: ${customSubDir || "None"}</p>
        <p>Total reports: ${reports.length}</p>
        ${generateAverageScoresSummary(reports)}
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
