/**
 * Utility functions for SvelteKit route extraction and URL manipulation
 */
import fs from "fs";
import path from "path";
import chalk from "chalk";
import { normalizeUrlPath } from "./fileUtils.js";

export const ROUTES_DIR: string = path.join(process.cwd(), "src", "routes");

/**
 * Parameter values dictionary interface
 */
export interface ParamValues {
    [key: string]: string;
}

/**
 * Extracts route paths from the routes directory structure.
 * SvelteKit uses a file-based routing system.
 */
export async function getRoutes(
    dir: string = ROUTES_DIR,
    basePath: string = "",
): Promise<string[]> {
    const routes: string[] = [];

    if (!fs.existsSync(dir)) {
        console.warn(chalk.yellow(`Warning: Routes directory ${dir} does not exist.`));
        return routes;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (entry.name.startsWith(".")) continue;

            if (entry.name.startsWith("(") && entry.name.endsWith(")")) {
                routes.push(...(await getRoutes(entryPath, basePath)));
            } else if (entry.name.startsWith("[") && entry.name.endsWith("]")) {
                const paramName = entry.name.slice(1, -1);
                const paramPath = normalizeUrlPath([basePath, `:${paramName}`]);
                routes.push(...(await getRoutes(entryPath, paramPath)));
            } else {
                const newBasePath = normalizeUrlPath([basePath, entry.name]);
                routes.push(...(await getRoutes(entryPath, newBasePath)));
            }
        } else if (entry.name === "+page.svelte") {
            routes.push(basePath || "/");
        }
    }

    return routes;
}

/**
 * Ensures that the base URL and path are properly joined with a single forward slash
 */
export function joinUrl(baseUrl: string, path: string): string {
    const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${cleanBaseUrl}${cleanPath}`;
}

/**
 * Extracts all unique parameter names from routes
 */
export function extractUniqueParams(routes: string[]): string[] {
    const uniqueParams = new Set<string>();

    for (const route of routes) {
        const parts = route.split("/");
        for (const part of parts) {
            if (part.startsWith(":")) {
                uniqueParams.add(part.substring(1));
            }
        }
    }

    return Array.from(uniqueParams);
}

/**
 * Apply collected parameter values to a route
 */
export function applyParamValues(route: string, paramValues: ParamValues): string {
    const parts = route.split("/");
    const processedParts = parts.map((part) => {
        if (part.startsWith(":")) {
            const paramName = part.substring(1);
            return paramValues[paramName] || part;
        }
        return part;
    });

    return processedParts.join("/");
}

/**
 * Process routes with custom subdirectory
 */
export function processRoutesWithSubDir(routes: string[], customSubDir: string): string[] {
    if (!customSubDir) return routes;

    return routes.map((route) => {
        if (route === "/") {
            return customSubDir;
        }
        return normalizeUrlPath([customSubDir, route]);
    });
}
