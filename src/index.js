const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const MARKER = "<!-- repo-policy-gate -->";

function normalizeSeverity(s) {
    return s === "warn" || s === "warning" ? "warn" : "error";
}

function severityRank(sev) {
    return normalizeSeverity(sev) === "warn" ? 1 : 2; // warn < error
}

function applySeverityOverrides(config, violations) {
    const overrides = config?.severity_overrides || {};
    for (const v of violations) {
        if (overrides[v.ruleId]) {
            v.severity = normalizeSeverity(overrides[v.ruleId]);
        }
    }
    return violations;
}

function shouldFail(config, violations) {
    const failOn = normalizeSeverity(config?.fail_on || "error"); // default error
    const threshold = severityRank(failOn);
    return violations.some(v => severityRank(v.severity) >= threshold);
}

function safeLoadConfig(configPath) {
    const fullPath = path.resolve(process.cwd(), configPath);
    if (!fs.existsSync(fullPath)) return { config: null, found: false };
    const raw = fs.readFileSync(fullPath, "utf8");
    return { config: yaml.load(raw) || {}, found: true };
}

function fileExists(relPath) {
    // workspace root is available because workflow uses actions/checkout
    const full = path.resolve(process.cwd(), relPath);
    return fs.existsSync(full);
}

function renderMarkdown({ status, violations, configPath, meta }) {
    const icon = status === "pass" ? "✅" : status === "warn" ? "⚠️" : "❌";
    const title =
        status === "pass"
            ? `${icon} Repo Policy Gate: passed`
            : status === "warn"
                ? `${icon} Repo Policy Gate: warnings`
                : `${icon} Repo Policy Gate: failed`;

    const lines = [];
    lines.push(MARKER);
    lines.push(`### ${title}`);
    lines.push("");
    lines.push(`**Config:** \`${configPath}\``);
    lines.push(`**Fail threshold:** \`${meta.failOn}\``);
    lines.push("");

    if (!violations.length) {
        lines.push("All configured checks passed.");
        return lines.join("\n");
    }

    const errors = violations.filter(v => v.severity === "error");
    const warns = violations.filter(v => v.severity === "warn");

    if (errors.length) {
        lines.push("#### Errors");
        for (const v of errors) {
            lines.push(`- **${v.ruleId}**: ${v.message}`);
            if (v.howToFix) lines.push(`  - _Fix_: ${v.howToFix}`);
        }
        lines.push("");
    }

    if (warns.length) {
        lines.push("#### Warnings");
        for (const v of warns) {
            lines.push(`- **${v.ruleId}**: ${v.message}`);
            if (v.howToFix) lines.push(`  - _Fix_: ${v.howToFix}`);
        }
        lines.push("");
    }

    return lines.join("\n");
}

async function upsertComment(octokit, ctx, body) {
    const { owner, repo } = ctx.repo;
    const issue_number = ctx.payload.pull_request.number;

    const { data: comments } = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number,
        per_page: 100
    });

    const existing = comments.find(c => (c.body || "").includes(MARKER));
    if (existing) {
        await octokit.rest.issues.updateComment({
            owner,
            repo,
            comment_id: existing.id,
            body
        });
    } else {
        await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number,
            body
        });
    }
}

function compileViolations({ config, prTitle }) {
    const violations = [];

    if (!config) {
        violations.push({
            ruleId: "config_missing",
            severity: "warn",
            message: "No policy config found. This run did not enforce any rules.",
            howToFix: "Add a .repo-policy.yml file to the repo root (or set input config_path)."
        });
        return violations;
    }

    // --- PR title regex rule ---
    const titleRegex = config?.pull_request?.title_regex;
    if (titleRegex) {
        let re;
        try {
            re = new RegExp(titleRegex);
        } catch (e) {
            violations.push({
                ruleId: "title_regex_invalid",
                severity: "error",
                message: `Configured pull_request.title_regex is not a valid RegExp: \`${titleRegex}\``,
                howToFix: "Fix the regex in .repo-policy.yml (JS RegExp syntax, without surrounding / /)."
            });
            return violations;
        }

        if (!re.test(prTitle || "")) {
            violations.push({
                ruleId: "pr_title_regex",
                severity: "error",
                message: `PR title did not match \`${titleRegex}\`. Current title: “${prTitle}”`,
                howToFix: "Rename the PR to match the required pattern."
            });
        }
    }

    // --- Required files rule ---
    const requiredFiles = config?.repo?.required_files;
    if (Array.isArray(requiredFiles) && requiredFiles.length) {
        const missing = requiredFiles.filter(f => !fileExists(f));
        if (missing.length) {
            violations.push({
                ruleId: "required_files",
                severity: "error",
                message: `Missing required file(s): ${missing.map(m => `\`${m}\``).join(", ")}`,
                howToFix: "Add the missing files at the repo root, or remove them from repo.required_files."
            });
        }
    }

    return applySeverityOverrides(config, violations);
}


async function run() {
    try {
        const token = process.env.GITHUB_TOKEN;
        if (!token) throw new Error("GITHUB_TOKEN missing");

        const ctx = github.context;
        if (!ctx.payload.pull_request) {
            core.info("Not a pull_request event; skipping.");
            return;
        }

        const configPath = core.getInput("config_path") || ".repo-policy.yml";
        const { config } = safeLoadConfig(configPath);

        const prTitle = ctx.payload.pull_request.title || "";
        const octokit = github.getOctokit(token);

        const violations = compileViolations({ config, prTitle });
        const hasErrors = violations.some(v => v.severity === "error");
        const hasWarns = violations.some(v => v.severity === "warn");

        const failing = config ? shouldFail(config, violations) : false;

        const status = failing ? "fail" : hasErrors || hasWarns ? "warn" : "pass";

        const failOn = config?.fail_on || "error";

        const body = renderMarkdown({
            status,
            violations,
            configPath,
            meta: { failOn }
        });
        await upsertComment(octokit, ctx, body);

        if (failing) core.setFailed("Repo Policy Gate failed due to policy violations.");
    } catch (err) {
        core.setFailed(err && err.stack ? err.stack : String(err));
    }
}

run();
