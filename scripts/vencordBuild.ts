/* Copyright Elysia © 2025 */

import { spawn } from "child_process";
import path from "path";
import process from "process";
import { existsSync, renameSync, rmSync, readFileSync, writeFileSync } from "fs";

function runCommand(cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd: opts.cwd ?? process.cwd(),
            stdio: "inherit",
            shell: false,
        });

        child.on("error", err => reject(err));
        child.on("close", (code, signal) => {
            if (signal) {
                return reject(new Error(`Command terminated by signal ${signal}`));
            }
            if (code !== 0) {
                return reject(new Error(`Command exited with code ${code}`));
            }
            resolve();
        });
    });
}

async function buildVencord() {
    const root = process.cwd();
    const vencordDir = path.join(root, "Vencord");

    console.log("➡️  Building Vencord (web) ...");
    await runCommand(
        process.execPath,
        ["--require", "./scripts/suppressExperimentalWarnings.js", "scripts/build/buildWeb.mjs"],
        {
            cwd: vencordDir,
        },
    );
    console.log("✅ Vencord build finished.");
}

/**
 * Safari / WebKit Parse-Time Safety Pass:
 * Rewrites any regex literal `/.../flags` containing `(?<` (such as V8-only backreferences inside lookbehinds
 * in optional Vencord plugins like BetterSettings / FakeNitro) into `__vcRx("...", "flags")` so WebKit never
 * throws a parse-time SyntaxError that aborts the entire Vencord.js bundle!
 */
function rewriteLookbehindRegexLiterals(code: string): { output: string; replacedCount: number } {
    const out: string[] = [];
    const len = code.length;
    let i = 0;
    let replacedCount = 0;
    let prevNonWsChar = "";
    let prevWord = "";
    const templateBraceDepthStack: number[] = [];
    let braceDepth = 0;

    const regexPrecedeKeywords = new Set([
        "return",
        "case",
        "throw",
        "in",
        "of",
        "typeof",
        "void",
        "delete",
        "await",
        "yield",
        "else",
        "do",
    ]);

    const canStartRegex = () => {
        if (!prevNonWsChar) return true;
        if ("([{:;,=!?&|+-*%^~<>".includes(prevNonWsChar)) return true;
        if (prevWord && regexPrecedeKeywords.has(prevWord)) return true;
        return false;
    };

    const scanTemplateChunk = () => {
        while (i < len) {
            if (code[i] === "\\") {
                out.push(code.slice(i, i + 2));
                i += 2;
                continue;
            }
            if (code[i] === "$" && code[i + 1] === "{") {
                out.push("${");
                i += 2;
                templateBraceDepthStack.push(braceDepth);
                braceDepth++;
                prevNonWsChar = "{";
                prevWord = "";
                return;
            }
            if (code[i] === "`") {
                out.push("`");
                i++;
                prevNonWsChar = "`";
                prevWord = "";
                return;
            }
            out.push(code[i]);
            i++;
        }
    };

    while (i < len) {
        const ch = code[i];

        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
            out.push(ch);
            i++;
            continue;
        }

        if (ch === "/" && code[i + 1] === "/") {
            const start = i;
            i += 2;
            while (i < len && code[i] !== "\n") i++;
            out.push(code.slice(start, i));
            continue;
        }

        if (ch === "/" && code[i + 1] === "*") {
            const start = i;
            i += 2;
            while (i < len && !(code[i] === "*" && code[i + 1] === "/")) i++;
            i += 2;
            out.push(code.slice(start, i));
            continue;
        }

        if (ch === "'" || ch === '"') {
            const quote = ch;
            const start = i;
            i++;
            while (i < len) {
                if (code[i] === "\\") {
                    i += 2;
                    continue;
                }
                if (code[i] === quote) {
                    i++;
                    break;
                }
                i++;
            }
            out.push(code.slice(start, i));
            prevNonWsChar = quote;
            prevWord = "";
            continue;
        }

        if (ch === "`") {
            out.push("`");
            i++;
            scanTemplateChunk();
            continue;
        }

        if (ch === "{") {
            braceDepth++;
            out.push("{");
            prevNonWsChar = "{";
            prevWord = "";
            i++;
            continue;
        }

        if (ch === "}") {
            braceDepth--;
            out.push("}");
            i++;
            if (
                templateBraceDepthStack.length > 0 &&
                templateBraceDepthStack[templateBraceDepthStack.length - 1] === braceDepth
            ) {
                templateBraceDepthStack.pop();
                scanTemplateChunk();
                continue;
            }
            prevNonWsChar = "}";
            prevWord = "";
            continue;
        }

        if (ch === "/" && canStartRegex()) {
            let j = i + 1;
            let inCharClass = false;
            let validRegex = false;
            while (j < len) {
                const c = code[j];
                if (c === "\n" || c === "\r") {
                    validRegex = false;
                    break;
                }
                if (c === "\\") {
                    j += 2;
                    continue;
                }
                if (c === "[") {
                    inCharClass = true;
                    j++;
                    continue;
                }
                if (c === "]") {
                    inCharClass = false;
                    j++;
                    continue;
                }
                if (c === "/" && !inCharClass) {
                    validRegex = true;
                    break;
                }
                j++;
            }

            if (validRegex) {
                const body = code.slice(i + 1, j);
                let k = j + 1;
                while (k < len && /[dgimsuvy]/.test(code[k])) k++;
                const flags = code.slice(j + 1, k);

                if (body.includes("(?<")) {
                    out.push(`__vcRx(${JSON.stringify(body)},${JSON.stringify(flags)})`);
                    replacedCount++;
                } else {
                    out.push(code.slice(i, k));
                }
                i = k;
                prevNonWsChar = ")";
                prevWord = "";
                continue;
            }
        }

        if (/[A-Za-z_$]/.test(ch)) {
            const start = i;
            i++;
            while (i < len && /[A-Za-z0-9_$]/.test(code[i])) i++;
            const word = code.slice(start, i);
            out.push(word);
            prevNonWsChar = word[word.length - 1];
            prevWord = word;
            continue;
        }

        out.push(ch);
        prevNonWsChar = ch;
        prevWord = "";
        i++;
    }

    const helper =
        'function __vcRx(s,f){try{return new RegExp(s,f)}catch(e){var r=/(?:$^)/;try{Object.defineProperty(r,"source",{value:s,configurable:!0});Object.defineProperty(r,"flags",{value:f||"",configurable:!0})}catch(_){}r.toString=function(){return"/"+s+"/"+(f||"")};return r}}\n';

    return { output: helper + out.join(""), replacedCount };
}

function copyAndPatch() {
    const root = process.cwd();
    const finalFolder = path.resolve(root, "VencordExtension");

    if (existsSync(finalFolder)) {
        rmSync(finalFolder, { recursive: true });
        console.info("Removed the old Vencord Extension folder:", finalFolder);
    }

    const vencordBuildPath = path.resolve(root, "Vencord", "dist", "chromium-unpacked");
    renameSync(vencordBuildPath, finalFolder);

    rmSync(path.resolve(root, "Vencord", "dist"), { recursive: true });
    console.info("Moved the newly built Vencord Extension folder to", finalFolder);

    // Patch Vencord.js
    const vencordPath = path.resolve(finalFolder, "dist", "Vencord.js");
    const vencordContent = readFileSync(vencordPath, "utf-8");

    const patchedVencord = vencordContent.replace(
        "getInfoRows(){",
        "getInfoRows(){let rows = this.getInfoRowsDefault();rows.unshift(`${window.BotClientNative.getBotClientName()} ${window.BotClientNative.getBotClientVersion()}`);return rows},getInfoRowsDefault(){",
    );

    if (patchedVencord === vencordContent) {
        console.info("Vencord.js is already patched / Cannot patch Vencord.js");
        console.info("Please check if the file is already patched or if the patch is correct.");
        throw new Error("Cannot apply the DBC patch to Vencord.js; inspect the pinned Vencord revision.");
    }

    const { output: safariSafeVencord, replacedCount } = rewriteLookbehindRegexLiterals(patchedVencord);
    console.info(`Rewrote ${replacedCount} lookbehind regex literals into Safari-safe __vcRx() calls.`);

    writeFileSync(vencordPath, safariSafeVencord);
    console.info("Patched Vencord.js successfully");
}

async function main() {
    try {
        await buildVencord();
        copyAndPatch();
        console.log("🎉 All done.");
    } catch (err) {
        console.error("❌ Build failed:", err);
        process.exitCode = 1;
    }
}

main();
