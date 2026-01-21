const test = require("node:test");
const assert = require("node:assert/strict");

const { compileViolations } = require("../src/index");

test("returns config_missing warning when config is null", () => {
    const violations = compileViolations({ config: null, prTitle: "feat: ok" });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].ruleId, "config_missing");
    assert.equal(violations[0].severity, "warn");
});

test("invalid title regex yields error", () => {
    const config = { pull_request: { title_regex: "(" } };
    const violations = compileViolations({ config, prTitle: "feat: ok" });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].ruleId, "title_regex_invalid");
    assert.equal(violations[0].severity, "error");
});

test("title regex mismatch yields error", () => {
    const config = { pull_request: { title_regex: "^feat:" } };
    const violations = compileViolations({ config, prTitle: "fix: nope" });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].ruleId, "pr_title_regex");
    assert.equal(violations[0].severity, "error");
});
