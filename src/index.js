const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const MARKER = "<!-- repo-policy-gate -->";

function safeLoadConfig(configPath) {
  const fullPath = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(fullPath)) return { config: null };
  return { config: yaml.load(fs.readFileSync(fullPath, "utf8")) || {} };
}

function render(body) {
  return `${MARKER}
### 🛡 Repo Policy Gate

${body}`;
}

async function upsertComment(octokit, ctx, body) {
  const { owner, repo } = ctx.repo;
  const issue_number = ctx.payload.pull_request.number;

  const { data } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number
  });

  const existing = data.find(c => c.body.includes(MARKER));
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

async function run() {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN missing");

    const ctx = github.context;
    if (!ctx.payload.pull_request) {
      core.info("Not a PR event");
      return;
    }

    const { config } = safeLoadConfig(core.getInput("config_path"));
    const octokit = github.getOctokit(token);

    let body = "✅ No rules enforced yet.";

    if (!config) {
      body = "⚠ No `.repo-policy.yml` found. Nothing enforced.";
    }

    await upsertComment(octokit, ctx, render(body));
  } catch (err) {
    core.setFailed(err.message);
  }
}

run();
