/**
 * Executor for running multiple Lighthouse audits concurrently
 */
import fs from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";
import { runLighthouseAudit, LighthouseAuditOptions } from "./audit.js";
import { getReportDir, LighthouseReport } from "../utils/fileUtils.js";
import { joinUrl, applyParamValues, ParamValues } from "../utils/routeUtils.js";

/**
 * Options for batch audit processing
 */
export interface BatchAuditOptions extends LighthouseAuditOptions {
    baseUrl: string;
}

/**
 * Processed route interface for tracking progress
 */
interface ProcessedRoute {
    originalRoute: string;
    processedRoute: string;
    completed: boolean;
    inProgress: boolean;
}

/**
 * Process a batch of routes with Lighthouse
 */
export async function processBatchAudits(
    routes: string[],
    paramValues: ParamValues,
    options: BatchAuditOptions,
): Promise<LighthouseReport[]> {
    const { baseUrl, quietMode, configPath } = options;

    // Set the concurrency limit based on available CPU cores
    const CONCURRENCY_LIMIT = Math.max(1, os.cpus().length - 1);
    console.log(chalk.blue(`Using concurrency limit of ${CONCURRENCY_LIMIT} parallel processes`));

    // Pre-process all routes to apply parameter values
    const processedRoutes: ProcessedRoute[] = routes.map((route) => ({
        originalRoute: route,
        processedRoute: applyParamValues(route, paramValues),
        completed: false,
        inProgress: false,
    }));

    // Track progress
    let completed = 0;
    const total = processedRoutes.length;

    console.log(chalk.blue(`Processing ${total} routes with dynamic scheduling...`));

    // Function to get the next route to process
    function getNextRoute(): ProcessedRoute | undefined {
        return processedRoutes.find((route) => !route.completed && !route.inProgress);
    }

    // Function to process a single route
    async function processRoute(route: ProcessedRoute): Promise<void> {
        route.inProgress = true;
        const url = joinUrl(baseUrl, route.processedRoute);

        try {
            await runLighthouseAudit(url, route.processedRoute, {
                quietMode,
                configPath,
            });

            completed++;
            console.log(
                chalk.green(
                    `Progress: ${completed}/${total} routes completed (${Math.round((completed / total) * 100)}%)`,
                ),
            );
        } catch (error) {
            console.error(
                chalk.red(
                    `Failed to process route ${route.processedRoute}: ${(error as Error).message}`,
                ),
            );
        }

        route.completed = true;
        route.inProgress = false;
    }

    // Function to execute work with dynamic scheduling
    async function executeWithDynamicScheduling(): Promise<void> {
        const running = new Set<Promise<void>>();

        // Initial filling of the worker pool
        for (let i = 0; i < CONCURRENCY_LIMIT; i++) {
            const route = getNextRoute();
            if (!route) break;

            const promise = processRoute(route).then(() => {
                running.delete(promise);
            });

            running.add(promise);
        }

        // Keep processing until all routes are completed
        while (running.size > 0) {
            // Wait for the first process to complete
            await Promise.race(running);

            // Fill the pool back up to concurrency limit
            while (running.size < CONCURRENCY_LIMIT) {
                const route = getNextRoute();
                if (!route) break;

                const promise = processRoute(route).then(() => {
                    running.delete(promise);
                });

                running.add(promise);
            }
        }
    }

    // Execute with dynamic scheduling
    await executeWithDynamicScheduling();
    console.log(chalk.green(`All ${total} routes have been processed.`));

    // Get the timestamp for this batch of reports
    const reportDir = getReportDir();

    // Collect reports
    return collectReports(processedRoutes, reportDir, baseUrl);
}

/**
 * Collect all reports from the processed routes
 */
function collectReports(
    processedRoutes: ProcessedRoute[],
    reportDir: string,
    baseUrl: string,
): LighthouseReport[] {
    const reports: LighthouseReport[] = [];

    // Collect all reports from the timestamped directory
    if (fs.existsSync(reportDir)) {
        const files = fs.readdirSync(reportDir);

        for (const route of processedRoutes) {
            // Ensure consistent path handling for root and regular routes
            const routeToUse = route.processedRoute === "/" ? "root" : route.processedRoute;

            const sanitizedPath = routeToUse
                .replace(/^\//, "") // Remove leading slash
                .replace(/\//g, "-") // Replace slashes with dashes
                .replace(/[^a-zA-Z0-9-_]/g, "_"); // Replace invalid chars with underscores

            // Look only for this specific route's report in the directory
            const reportFile = files.find((file) => file === `${sanitizedPath}.html`);

            if (reportFile) {
                reports.push({
                    outputPath: path.join(reportDir, reportFile),
                    route: route.processedRoute,
                    url: joinUrl(baseUrl, route.processedRoute),
                });
            }
        }
    }

    return reports;
}
