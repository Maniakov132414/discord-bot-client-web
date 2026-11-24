/* Copyright Elysia © 2025. All rights reserved */
/**
 * Web Compatibility Polyfill for Electron APIs (net, app, nativeImage)
 * Allows DiscordBotClient's 80+ APIServer routes and utilities to run directly in Node.js without Electron.
 */

import http from "http";
import https from "https";
import os from "os";
import path from "path";
import { URL } from "url";

const APP_ROOT = path.resolve(__dirname, "..");
const WRITABLE_BASE = process.env.VERCEL ? path.join(os.tmpdir(), "dbc-userdata") : path.join(APP_ROOT, ".userdata");

const pkgPath = path.resolve(APP_ROOT, "package.json");
let appVersion = "3.10.7";
let appName = "DiscordBotClient";
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require(pkgPath);
    appVersion = pkg.version || appVersion;
    appName = pkg.productName || pkg.name || appName;
} catch {
    // fallback defaults
}

export const app = {
    getAppPath: () => APP_ROOT,
    getPath: (name: string) => path.resolve(WRITABLE_BASE, name),
    getVersion: () => appVersion,
    getName: () => appName,
    isReady: () => true,
    isPackaged: false,
};

export const nativeImage = {
    createFromPath: (_p: string) => ({
        resize: (_opts: { width?: number; height?: number }) => ({}),
    }),
};

export const dialog = {
    showErrorBox: (title: string, content: string) => {
        console.warn(`[Dialog ErrorBox] ${title}: ${content}`);
    },
};

export const net = {
    fetch: (input: string | URL | Request, init?: RequestInit) => {
        return globalThis.fetch(input, init);
    },
    request: (options: {
        method?: string;
        url: string;
        redirect?: string;
        useSessionCookies?: boolean;
    }) => {
        const parsedUrl = new URL(options.url);
        const isHttps = parsedUrl.protocol === "https:";
        const transport = isHttps ? https : http;

        const headers: Record<string, string> = {};
        let reqInstance: http.ClientRequest | null = null;
        const responseListeners: Array<(res: any) => void> = [];
        const errorListeners: Array<(err: Error) => void> = [];
        const bodyChunks: Buffer[] = [];
        let ended = false;

        const ensureRequest = () => {
            if (reqInstance) return reqInstance;
            reqInstance = transport.request(
                parsedUrl,
                {
                    method: options.method || "GET",
                    headers,
                },
                (nodeRes) => {
                    const wrappedRes = Object.assign(nodeRes, {
                        statusCode: nodeRes.statusCode || 200,
                        headers: nodeRes.headers,
                    });
                    responseListeners.forEach((cb) => cb(wrappedRes));
                },
            );
            reqInstance.on("error", (err) => {
                errorListeners.forEach((cb) => cb(err));
            });
            return reqInstance;
        };

        interface ElectronNetResponse {
            statusCode: number;
            headers: Record<string, string | string[]>;
            on(ev: "data", cb: (chunk: Buffer) => void): void;
            on(ev: "end", cb: () => void): void;
            on(ev: "error", cb: (err: Error) => void): void;
        }

        interface ElectronNetRequest {
            chunkedEncoding: boolean;
            setHeader(key: string, value: string): void;
            on(event: "response", listener: (res: ElectronNetResponse) => void): ElectronNetRequest;
            on(event: "error", listener: (err: Error) => void): ElectronNetRequest;
            write(chunk: Buffer | string): boolean;
            end(chunk?: Buffer | string): void;
            once(event: string, listener: (...args: any[]) => void): ElectronNetRequest;
            emit(event: string, ...args: any[]): boolean;
            removeListener(event: string, listener: (...args: any[]) => void): ElectronNetRequest;
            writable: boolean;
        }

        const wrapper: ElectronNetRequest = {
            chunkedEncoding: false,
            setHeader(key: string, value: string) {
                headers[key] = value;
            },
            on(event: "response" | "error", listener: any) {
                if (event === "response") {
                    responseListeners.push(listener);
                } else if (event === "error") {
                    errorListeners.push(listener);
                }
                return wrapper;
            },
            write(chunk: Buffer | string) {
                const r = ensureRequest();
                return r.write(chunk);
            },
            end(chunk?: Buffer | string) {
                if (ended) return;
                ended = true;
                const r = ensureRequest();
                if (bodyChunks.length > 0) {
                    for (const c of bodyChunks) r.write(c);
                }
                if (chunk) r.end(chunk);
                else r.end();
            },
            // Support req.pipe(electronReq) from Express
            once(event: string, listener: (...args: any[]) => void) {
                const r = ensureRequest();
                r.once(event, listener);
                return wrapper;
            },
            emit(event: string, ...args: any[]) {
                const r = ensureRequest();
                return r.emit(event, ...args);
            },
            removeListener(event: string, listener: (...args: any[]) => void) {
                const r = ensureRequest();
                r.removeListener(event, listener);
                return wrapper;
            },
             writable: true,
        };

        return wrapper;
    },
};

export type IpcMainEvent = any;
export type IpcMainInvokeEvent = any;
export type WebContents = any;
export type BrowserWindow = any;
