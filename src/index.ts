/**
 * Main module for running Lighthouse audits on SvelteKit applications
 */
import path from "path";
import readline from "readline";
import { Command } from "commander";
import chalk from "chalk";

// Import utility modules
import {
    ensureReportsDir,
    getReportDir,
    generateReportIndex,
    LighthouseReport,
} from "./utils/fileUtils.js";

import {
    ROUTES_DIR,
    getRoutes,
    joinUrl,
    extractUniqueParams,
    applyParamValues,
    processRoutesWithSubDir,
    ParamValues,
} from "./utils/routeUtils.js";

import { authenticateLighthouse, runLighthouseAudit } from "./lighthouse/audit.js";
import puppeteer, { BrowserContext } from "puppeteer";
import { existsSync } from "fs";

// Default base URL for audits
const BASE_URL = process.env.BASE_URL || "http://localhost:4173";

/**
 * CLI options interface
 */
interface CLIOptions {
    all?: boolean;
    dir?: string;
    quiet?: boolean;
    view?: boolean;
    url?: string;
    params?: string;
    config?: string;
    auth?: string;
    ignore?: string;
}

/**
 * Collect parameter values from the user upfront
 */
async function collectParameterValues(
    paramNames: string[],
    rl: readline.Interface,
): Promise<ParamValues> {
    const paramValues: ParamValues = {};

    console.log("\nPlease provide values for the following route parameters:");

    for (const paramName of paramNames) {
        const value = await new Promise<string>((resolve) => {
            rl.question(`Enter value for ${paramName}: `, (answer) => {
                resolve(answer.trim());
            });
        });

        paramValues[paramName] = value;
    }

    return paramValues;
}

/**
 * Main function to run Lighthouse audits
 */
async function runLighthouse(): Promise<void> {
    // Parse CLI arguments using Commander
    const program = new Command();
    program
        .name("sveltekit-lighthouse-runner")
        .description("Run Lighthouse audits on a SvelteKit application")
        .version("1.0.0")
        .option("-a, --all", "Run on all routes")
        .option("-d, --dir <directory>", "Only routes in specified directory (e.g., /settings)")
        .option("-q, --quiet", "Suppress detailed Lighthouse output")
        .option("-v, --view", "Open report in browser when completed")
        .option("-u, --url <url>", "Base URL for audits", BASE_URL)
        .option(
            "-p, --params <values>",
            'Parameter values in format "param1=value1,param2=value2" for CI environments',
        )
        .option("-c, --config <path>", "Custom path to lighthouse config file")
        .option(
            "-i, --ignore <patterns>",
            "Ignore routes matching these patterns (comma-separated)",
        )
        .option("--auth <path>", "Path to authentication JSON config file")
        .parse(process.argv);

    const options = program.opts<CLIOptions>();

    // Store options locally - no longer using global variables
    const runAll = options.all ?? false;
    const quietMode = options.quiet ?? false;
    const openReport = options.view ?? false;
    const customSubDir = options.dir;
    const baseUrl = options.url || BASE_URL;
    const paramString = options.params;
    const configPath = options.config;
    const authConfigPath = options.auth;
    const ignorePatterns = options.ignore
        ? options.ignore.split(",").map((pattern) => pattern.trim())
        : [];

    // Parse preset parameter values if provided
    const presetParamValues: ParamValues = {};
    if (paramString) {
        paramString.split(",").forEach((pair) => {
            const [key, value] = pair.split("=");
            if (key && value) {
                presetParamValues[key] = value;
                console.log(chalk.blue(`Using preset parameter: ${key}=${value}`));
            }
        });
    }

    // Create readline interface for user input (only if needed)
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    // Handle readline close
    rl.on("close", () => {
        console.log(chalk.green("Lighthouse audit(s) completed."));
        process.exit(0);
    });

    // Ensure reports directory exists
    ensureReportsDir();

    try {
        // Get the subdirectory to scan for routes
        const subDir = customSubDir ? path.join(ROUTES_DIR, customSubDir.substring(1)) : ROUTES_DIR;

        // Get routes from the specified directory
        let routes = await getRoutes(subDir);

        if (routes.length === 0) {
            throw new Error(
                `No routes found in ${subDir}. Make sure you're running this in a SvelteKit project with a routes directory.`,
            );
        }

        // Process ignored routes if specified
        if (ignorePatterns.length > 0) {
            const originalCount = routes.length;
            routes = routes.filter((route) => {
                return !ignorePatterns.some((pattern) => {
                    // Support glob-like * wildcards for simpler matching
                    const regexPattern = pattern.replace(/\*/g, ".*");
                    const regex = new RegExp(`^${regexPattern}$`);
                    return regex.test(route);
                });
            });
            console.log(
                chalk.blue(
                    `Ignored ${originalCount - routes.length} routes matching patterns: ${ignorePatterns.join(", ")}`,
                ),
            );
        }

        // Keep a copy of the original routes for display purposes
        const displayRoutes = [...routes];

        // Process routes with custom subdirectory
        if (customSubDir) {
            routes = processRoutesWithSubDir(routes, customSubDir);
        }

        console.log(chalk.green(`Found ${routes.length} routes in the project.`));

        // Process all routes
        if (runAll) {
            // Extract unique parameters from all routes
            const uniqueParams = extractUniqueParams(routes);

            // If we have parameters, collect their values upfront (if not provided via CLI)
            let paramValues: ParamValues = { ...presetParamValues }; // Start with preset values
            const missingParams = uniqueParams.filter((param) => !paramValues[param]);

            // Only ask for input if there are missing parameters and we're not in CI environment
            if (missingParams.length > 0 && Object.keys(presetParamValues).length === 0) {
                console.log(
                    chalk.blue(`Found ${missingParams.length} parameter(s) without preset values.`),
                );
                const userParamValues = await collectParameterValues(missingParams, rl);
                // Merge with any preset values
                paramValues = { ...paramValues, ...userParamValues };
                console.log(chalk.green("All parameter values collected. Ready to run tests."));
            } else if (missingParams.length > 0) {
                // Exit with error if parameters are missing when using --params (likely CI environment)
                console.error(
                    chalk.red(
                        `Error: Missing required parameter values: ${missingParams.join(", ")}`,
                    ),
                );
                console.error(
                    chalk.red(`Please provide values for all parameters using --params option.`),
                );
                console.error(
                    chalk.red(
                        `Example: --params="${missingParams.map((p) => `${p}=value`).join(",")}"`,
                    ),
                );
                rl.close();
                process.exit(1);
            } else if (uniqueParams.length > 0) {
                console.log(
                    chalk.green(
                        `Using ${Object.keys(paramValues).length} preset parameter values. Ready to run tests.`,
                    ),
                );
            }
            const reports = await runWithBrowserContext(async (context, port) => {
                const reports: LighthouseReport[] = [];
                for (let i = 1; i <= routes.length; i++) {
                    const route = routes[i - 1];
                    const processedRoute = applyParamValues(route, paramValues);
                    const url = joinUrl(baseUrl, processedRoute);

                    try {
                        const report = await runLighthouseAudit(
                            context,
                            port,
                            url,
                            processedRoute,
                            {
                                quietMode,
                                configPath,
                            },
                        );
                        if (report) {
                            reports.push(report);
                        }
                        console.log(
                            chalk.green(
                                `Progress: ${i}/${routes.length} routes completed (${Math.round((i / routes.length) * 100)}%)`,
                            ),
                        );
                    } catch (error) {
                        console.error(
                            chalk.red(
                                `Failed to process route ${processedRoute}: ${(error as Error).message}`,
                            ),
                        );
                    }
                }
                return reports;
            }, authConfigPath);

            console.log(chalk.green(`All ${routes.length} routes have been processed.`));

            // Generate report index if we have reports
            if (reports && reports.length > 0) {
                const reportDir = getReportDir();
                // Only open the final report index
                generateReportIndex(reports, reportDir, baseUrl, customSubDir, openReport);
            } else {
                console.error(chalk.red("No reports were found in the output directory."));
            }

            rl.close();
        }
        // Interactive mode - let user select a route
        else {
            console.log(chalk.blue("Available routes:"));

            displayRoutes.forEach((route, index) => {
                const displayPath = route === "/" && customSubDir ? "/" : route;
                console.log(chalk.cyan(`${index + 1}. ${displayPath}`));
            });

            rl.question(
                chalk.yellow('Select a route number to audit (or "q" to quit): '),
                async (answer) => {
                    if (answer.toLowerCase() === "q") {
                        rl.close();
                        return;
                    }

                    const routeIndex = parseInt(answer) - 1;
                    if (isNaN(routeIndex) || routeIndex < 0 || routeIndex >= routes.length) {
                        console.error(chalk.red("Invalid route number."));
                        rl.close();
                        return;
                    }

                    let routeToAudit = routes[routeIndex];

                    // Handle routes with parameters
                    if (routeToAudit.includes(":")) {
                        const uniqueParams = extractUniqueParams([routeToAudit]);
                        // Check if we already have preset values for all parameters
                        const missingParams = uniqueParams.filter(
                            (param) => !presetParamValues[param],
                        );

                        let paramValues: ParamValues = { ...presetParamValues }; // Start with preset values

                        // If we're using preset params (likely CI) and some are missing, exit with error
                        if (missingParams.length > 0 && Object.keys(presetParamValues).length > 0) {
                            console.error(
                                chalk.red(
                                    `Error: Missing required parameter values for route "${routeToAudit}": ${missingParams.join(", ")}`,
                                ),
                            );
                            console.error(
                                chalk.red(
                                    `Please provide values for all parameters using --params option.`,
                                ),
                            );
                            console.error(
                                chalk.red(
                                    `Example: --params="${missingParams.map((p) => `${p}=value`).join(",")}"`,
                                ),
                            );
                            rl.close();
                            process.exit(1);
                        }
                        // Only prompt for missing parameters if there are any
                        else if (missingParams.length > 0) {
                            const userParamValues = await collectParameterValues(missingParams, rl);
                            // Merge with preset values
                            paramValues = { ...paramValues, ...userParamValues };
                        }

                        routeToAudit = applyParamValues(routeToAudit, paramValues);
                    }

                    const url = joinUrl(baseUrl, routeToAudit);

                    // Run a single Lighthouse audit
                    try {
                        const result = await runWithBrowserContext(async (context, port) => {
                            return runLighthouseAudit(context, port, url, routeToAudit, {
                                quietMode,
                                configPath,
                            });
                        }, authConfigPath);

                        if (!result) {
                            throw new Error(`Lighthouse audit failed for ${url}`);
                        }

                        // Generate index for the single report - only place where we open the report
                        const reportDir = path.dirname(result.outputPath);
                        generateReportIndex([result], reportDir, baseUrl, customSubDir, openReport);
                    } catch (error) {
                        console.error(chalk.red(`Error: ${(error as Error).stack}`));
                    }

                    rl.close();
                },
            );
        }
    } catch (error) {
        console.error(chalk.red("Error running lighthouse audits:"), (error as Error).message);
        rl.close();
        process.exit(1);
    }
}

async function runWithBrowserContext<T>(
    fn: (context: BrowserContext, port: number) => Promise<T>,
    authConfigPath?: string,
) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const port = parseInt(new URL(browser.wsEndpoint()).port, 10);
    const context = await browser.createBrowserContext();

    if (authConfigPath) {
        if (!existsSync(authConfigPath)) {
            console.warn(
                chalk.yellow(`Warning: Auth config file ${authConfigPath} does not exist.`),
            );
        }

        await authenticateLighthouse(context, authConfigPath);
    }

    let result: T | undefined = undefined;
    try {
        result = await fn(context, port);
    } catch (error) {
        console.error(chalk.red(`Error during Lighthouse run: ${(error as Error).message}`));
    } finally {
        await browser.close();
    }

    return result;
}

export { runLighthouse };
