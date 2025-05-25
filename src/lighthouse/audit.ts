/**
 * Lighthouse audit functionality for running single audits
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import chalk from "chalk";
import { getReportDir, LighthouseReport } from "../utils/fileUtils.js";
import lighthouse, { Config, Flags, Result, RunnerResult } from "lighthouse";
import { BrowserContext } from "puppeteer";

/**
 * Authentication step configuration
 */
export type AuthStep =
    | {
          type: "type";
          locator: string;
          input: string;
      }
    | {
          type: "click";
          locator: string;
      };

/**
 * Authentication configuration
 */
export interface AuthConfig {
    url: string;
    steps: AuthStep[];
}

/**
 * Options for running a Lighthouse audit
 */
export interface LighthouseAuditOptions {
    quietMode?: boolean;
    configPath?: string;
}

/**
 * Creates and returns a new authenticated browser context for Lighthouse audits.
 *
 * @param context - The `BrowserContext` instance to authenticate.
 * @param authConfigPath - Path to a JSON file containing authentication configuration.
 * @returns A promise that resolves once authentication is applied.
 */
export async function authenticateLighthouse(
    context: BrowserContext,
    authConfigPath: string,
): Promise<void> {
    const page = await context.newPage();
    try {
        const authConfig = JSON.parse(readFileSync(authConfigPath, "utf-8")) as AuthConfig;

        if (!authConfig.url || !Array.isArray(authConfig.steps)) {
            console.warn(
                chalk.yellow(
                    `Warning: Auth config file is invalid. It must contain a 'url' and 'steps' array.`,
                ),
            );
            return;
        }

        console.log(
            chalk.blue(`Running authentication sequence from config at: ${authConfigPath}`),
        );

        // Navigate to the auth URL
        await page.goto(authConfig.url, { waitUntil: "networkidle0" });

        // Execute each authentication step
        for (const step of authConfig.steps) {
            if (step.type === "type") {
                await page.type(step.locator, step.input);
            } else if (step.type === "click" && step.locator) {
                await Promise.all([
                    page.waitForNavigation({ waitUntil: "networkidle0" }),
                    page.click(step.locator),
                ]);
            }
        }

        console.log(chalk.green("Authentication completed successfully"));
    } catch (error) {
        console.error(chalk.red(`Error during authentication: ${(error as Error).message}`));
        throw error;
    } finally {
        await page.close();
    }
}

/**
 * Run lighthouse on a specific URL
 */
export async function runLighthouseAudit(
    context: BrowserContext,
    port: number,
    url: string,
    routePath: string,
    options: LighthouseAuditOptions = {},
): Promise<LighthouseReport> {
    const { quietMode = false, configPath } = options;

    const reportDir = getReportDir();

    // Ensure we have a valid route path by using a safe default for empty paths
    const routeToUse = routePath === "/" ? "root" : routePath;

    const sanitizedPath = routeToUse
        .replace(/^\//, "") // Remove leading slash
        .replace(/\//g, "-") // Replace slashes with dashes
        .replace(/[^a-zA-Z0-9-_]/g, "_"); // Replace invalid chars with underscores

    // No need for a fallback to "root" anymore since we handled it earlier
    const filename = sanitizedPath;
    const outputPath = path.join(reportDir, filename);

    console.log(chalk.blue(`Running Lighthouse on ${url}...`));

    const flags: Flags = {
        port,
        output: ["html"],
        disableStorageReset: true, // Disable storage reset to keep cookies and local storage
        logLevel: quietMode ? "error" : "info",
    };

    if (configPath && !existsSync(configPath)) {
        console.warn(chalk.yellow(`Warning: Config file ${configPath} does not exist.`));
    }
    const config =
        configPath && existsSync(configPath)
            ? (JSON.parse(readFileSync(configPath, "utf-8")) as Config)
            : undefined;

    let result: RunnerResult | undefined;
    const page = await context.newPage();
    try {
        await page.goto(url, { waitUntil: "networkidle0" });
        result = await lighthouse(url, flags, config, page);
        console.log(chalk.green(`Lighthouse run completed for ${url}`));
    } catch (error) {
        console.error(chalk.red(`Error running Lighthouse on ${url}: ${(error as Error).message}`));
        throw error;
    } finally {
        await page.close();
    }

    if (!result) {
        throw new Error(`Lighthouse run failed for ${url}`);
    }

    // Save the HTML report
    const htmlReportPath = `${outputPath}.report.html`;
    const htmlReport = result.report[0] || "";
    writeFileSync(htmlReportPath, htmlReport);

    if (!checkAllCategories(result.lhr.categories)) {
        throw new Error(
            `One or more required categories are missing in the Lighthouse report for ${url}`,
        );
    }

    const scores = {
        performance: result.lhr.categories.performance.score || 0,
        accessibility: result.lhr.categories.accessibility.score || 0,
        bestPractices: result.lhr.categories["best-practices"].score || 0,
        seo: result.lhr.categories.seo.score || 0,
    };

    const auditReport: LighthouseReport = {
        outputPath: htmlReportPath,
        route: routePath,
        url,
        scores,
    };

    return auditReport;
}

function checkAllCategories(categories: Record<string, Result.Category>): boolean {
    const requiredCategories = ["performance", "accessibility", "best-practices", "seo"];
    for (const category of requiredCategories) {
        if (!checkForCategory(categories, category)) {
            return false;
        }
    }
    return true;
}

function checkForCategory(
    categories: Record<string, Result.Category>,
    categoryId: string,
): boolean {
    if (!Object.keys(categories).includes(categoryId)) {
        console.error(chalk.red(`Category "${categoryId}" not found in Lighthouse report.`));
        return false;
    }
    return true;
}
