/**
 * Lighthouse audit functionality for running single audits
 */
import fs from "fs";
import path from "path";
import { fork, ChildProcess, execSync } from "child_process";
import chalk from "chalk";
import { getReportDir, LighthouseReport } from "../utils/fileUtils.js";

/**
 * Options for running a Lighthouse audit
 */
export interface LighthouseAuditOptions {
    quietMode?: boolean;
    configPath?: string;
}

/**
 * Check if Lighthouse is installed in the user's project
 */
function checkLighthouseInstallation(): string {
    try {
        // Try to find lighthouse CLI path by checking user's node_modules
        const userLighthousePath = path.join(
            process.cwd(),
            "node_modules",
            "lighthouse",
            "cli",
            "index.js",
        );

        if (fs.existsSync(userLighthousePath)) {
            return userLighthousePath;
        }

        // If not found in immediate node_modules, try to resolve it through npm
        try {
            const npmLsOutput = execSync("npm list lighthouse --json", { encoding: "utf8" });
            const npmLsData = JSON.parse(npmLsOutput);

            if (npmLsData.dependencies && npmLsData.dependencies.lighthouse) {
                // Lighthouse is installed but not in the immediate node_modules
                return "lighthouse"; // Use lighthouse command directly
            }
        } catch {
            // Ignore error, as it may not be installed
        }

        throw new Error("Lighthouse not found");
    } catch {
        console.error(
            chalk.red("Lighthouse is not installed in your project. Please install it with:"),
        );
        console.error(chalk.yellow("npm install lighthouse"));
        console.error(chalk.red("or"));
        console.error(chalk.yellow("yarn add lighthouse"));
        throw new Error(
            "Lighthouse is required but not installed. Please add it to your project dependencies.",
        );
    }
}

/**
 * Run lighthouse on a specific URL
 */
export function runLighthouseAudit(
    url: string,
    routePath: string,
    options: LighthouseAuditOptions = {},
): Promise<LighthouseReport> {
    const { quietMode = false, configPath } = options;

    return new Promise((resolve, reject) => {
        try {
            // Check if Lighthouse is installed
            const lighthousePath = checkLighthouseInstallation();

            const reportDir = getReportDir();

            // Ensure we have a valid route path by using a safe default for empty paths
            const routeToUse = routePath === "/" ? "root" : routePath;

            const sanitizedPath = routeToUse
                .replace(/^\//, "") // Remove leading slash
                .replace(/\//g, "-") // Replace slashes with dashes
                .replace(/[^a-zA-Z0-9-_]/g, "_"); // Replace invalid chars with underscores

            // No need for a fallback to "root" anymore since we handled it earlier
            const filename = sanitizedPath;
            const outputPath = path.join(reportDir, `${filename}.html`);

            console.log(chalk.blue(`Running Lighthouse on ${url}...`));

            // Only use config if explicitly provided
            const configArgument =
                configPath && fs.existsSync(configPath) ? ["--config-path", configPath] : [];

            const lighthouseArgs = [
                url,
                ...configArgument,
                "--output=html",
                `--output-path=${outputPath}`,
                '--chrome-flags="--headless --no-sandbox --disable-gpu"',
            ];

            if (quietMode) {
                lighthouseArgs.push("--quiet");
            }

            let lighthouseProcess: ChildProcess;

            if (lighthousePath === "lighthouse") {
                // Use lighthouse CLI command directly
                lighthouseProcess = fork(lighthousePath, lighthouseArgs, {
                    silent: true,
                });
            } else {
                // Use full path to lighthouse CLI
                lighthouseProcess = fork(lighthousePath, lighthouseArgs, {
                    silent: true,
                });
            }

            lighthouseProcess.on("exit", (code) => {
                if (code === 0) {
                    console.log(chalk.green(`Lighthouse audit completed for ${url}`));
                    console.log(chalk.green(`Report saved to ${outputPath}`));

                    resolve({
                        outputPath,
                        route: routePath,
                        url,
                    });
                } else {
                    console.error(
                        chalk.red(
                            `Lighthouse process exited with code ${code}. Ensure the frontend is running.`,
                        ),
                    );
                    reject(new Error(`Lighthouse failed with exit code ${code}`));
                }
            });

            lighthouseProcess.on("error", (err) => {
                console.error(chalk.red(`Error running Lighthouse: ${err.message}`));
                reject(err);
            });
        } catch (error) {
            reject(error);
        }
    });
}
