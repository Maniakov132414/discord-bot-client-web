"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.traverseDirectorySync = traverseDirectorySync;
exports.registerRoutesSync = registerRoutesSync;
exports.registerRouteSync = registerRouteSync;
// The source code below is taken from the Lambert-server library.
// Credits to the original authors and contributors of Lambert-server for their work.
// Some parts may have been modified or adapted to fit this project’s structure and requirements.
// https://github.com/SamuelScheit/Lambert-server
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = require("path");
const DEFAULT_EXCLUDE_DIR = /^\./;
const DEFAULT_FILTER = /^([^.].*)(?<!\.d)\.(ts|js)$/;
function traverseDirectorySync(options) {
    if (!options.dirname.endsWith("/"))
        options.dirname += "/";
    if (!options.filter)
        options.filter = DEFAULT_FILTER;
    if (!options.excludeDirs)
        options.excludeDirs = DEFAULT_EXCLUDE_DIR;
    const routes = fs_1.default.readdirSync(options.dirname);
    const result = [];
    for (const file of routes.sort((a, b) => {
        const aIsParam = a.startsWith("#");
        const bIsParam = b.startsWith("#");
        // Static routes first, parameterized routes (#id) last
        if (aIsParam && !bIsParam)
            return 1;
        if (!aIsParam && bIsParam)
            return -1;
        return a.localeCompare(b);
    })) {
        const path = options.dirname + file;
        const stat = fs_1.default.lstatSync(path);
        if (path.match(options.excludeDirs))
            continue;
        if (path.match(options.filter) && stat.isFile()) {
            result.push(path);
        }
        else if (options.recursive && stat.isDirectory()) {
            result.push(...traverseDirectorySync({ ...options, dirname: path + "/" }));
        }
    }
    return result;
}
function registerRoutesSync(app, path, autoPrefix = []) {
    const route = (0, express_1.Router)({ mergeParams: true });
    const root = (0, path_1.resolve)(path);
    const files = traverseDirectorySync({
        dirname: root,
        recursive: true,
    });
    console.log(`[Server] Found ${files.length} route files in ${path}`);
    const result = [];
    for (const absolutePath of files) {
        // eslint-disable-next-line
        const module = require(absolutePath);
        const res = registerRouteSync(route, root, absolutePath, module);
        if (res)
            result.push(res);
    }
    for (const prefix of autoPrefix) {
        app.use(prefix, route);
    }
    app.use(route);
    return result;
}
function registerRouteSync(route, root, file, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router) {
    if (root.endsWith("/") || root.endsWith("\\"))
        root = root.slice(0, -1); // removes slash at the end of the root dir
    let path = file.replace(root, ""); // remove root from path and
    path = path.split(".").slice(0, -1).join("."); // trancate .js/.ts file extension of path
    path = path.replaceAll("#", ":").replaceAll("!", "?").replaceAll("\\", "/");
    if (path.endsWith("/index"))
        path = path.slice(0, -6); // delete index from path
    if (!path.length)
        path = "/"; // first root index.js file must have a / path
    try {
        if (router.router)
            router = router.router;
        if (router.default)
            router = router.default;
        if (!router || router?.prototype?.constructor?.name !== "router") {
            throw "File doesn't export any default router";
        }
        if (!path.startsWith("/"))
            path = "/" + path;
        route.use(path, router);
        // console.log(`[Server] Registered route ${path}`);
        return router;
    }
    catch (error) {
        console.error(new Error(`[Server] Failed to register route ${path}: ${error}`));
    }
}
//# sourceMappingURL=RegisterRoutes.js.map