import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseMarkdownFrontmatter } from "./frontmatter.ts";
import { replaceClaudePluginRootReferences } from "./claude-plugin-root.ts";
import { materializePromptTemplates } from "./prompts.ts";
import { gitUrlForSource, syncMarketplaces, type Logger } from "./marketplace.ts";
import { readClaudeSettings } from "./claude-settings.ts";
import { findNativeSkillNames, isValidPiSkillName, normalizePiSkillName } from "./skills.ts";

const silentLog: Logger = () => {};
let passed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

async function main(): Promise<void> {
  // --- frontmatter --------------------------------------------------------
  await test("frontmatter parses flat scalars and bracketed argument-hint", () => {
    const md = ['---', 'description: Do a thing: carefully', 'argument-hint: [foo] [bar]', 'model: sonnet', '---', 'Body $1'].join(
      "\n",
    );
    const parsed = parseMarkdownFrontmatter(md);
    assert.equal(parsed.data.description, "Do a thing: carefully");
    assert.equal(parsed.data["argument-hint"], "[foo] [bar]");
    assert.equal(parsed.data.model, "sonnet");
    assert.equal(parsed.body.trim(), "Body $1");
  });

  await test("gitUrlForSource handles github, git+url, and directory sources", () => {
    assert.equal(
      gitUrlForSource({ source: "github", repo: "DataDog/claude-marketplace" }),
      "https://github.com/DataDog/claude-marketplace.git",
    );
    // Real Claude settings commonly use `source: git` with an explicit url.
    assert.equal(
      gitUrlForSource({ source: "git", url: "https://github.com/DataDog/claude-marketplace.git" }),
      "https://github.com/DataDog/claude-marketplace.git",
    );
    assert.equal(gitUrlForSource({ source: "url", url: "https://example.com/x.git" }), "https://example.com/x.git");
    assert.equal(gitUrlForSource({ source: "directory", path: "/tmp/x" }), null);
    assert.equal(gitUrlForSource({ source: "git" }), null);
  });

  await test("frontmatter with no block returns whole body", () => {
    const parsed = parseMarkdownFrontmatter("No frontmatter here");
    assert.deepEqual(parsed.data, {});
    assert.equal(parsed.body, "No frontmatter here");
  });

  await test("skill names are normalized to pi-compatible names", () => {
    assert.equal(normalizePiSkillName("atlas:go-test"), "atlas-go-test");
    assert.equal(normalizePiSkillName("DD:Sigma:Install_GBI"), "dd-sigma-install-gbi");
    assert.equal(isValidPiSkillName("atlas-go-test"), true);
    assert.equal(isValidPiSkillName("atlas:go-test"), false);
    assert.equal(isValidPiSkillName("bad--name"), false);
    assert.equal(isValidPiSkillName(normalizePiSkillName("x".repeat(80))), true);
  });

  // --- CLAUDE_PLUGIN_ROOT rewriting --------------------------------------
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-mkt-test-"));
  try {
    await fs.mkdir(path.join(tmp, "project", ".git"), { recursive: true });
    await fs.mkdir(path.join(tmp, "project", ".agents", "skills", "native-demo"), { recursive: true });
    await fs.writeFile(
      path.join(tmp, "project", ".agents", "skills", "native-demo", "SKILL.md"),
      "---\nname: native-demo\ndescription: Native demo\n---\n",
    );
    await test("native project skills are discovered for collision filtering", async () => {
      const names = await findNativeSkillNames(path.join(tmp, "project"));
      assert.equal(names.has("native-demo"), true);
    });

    const pluginDir = path.join(tmp, "marketplace", "dd");
    await fs.mkdir(path.join(pluginDir, "scripts"), { recursive: true });
    await fs.writeFile(path.join(pluginDir, "scripts", "run.sh"), "echo hi\n");

    await test("plugin-root rewrite resolves existing references", async () => {
      const out = await replaceClaudePluginRootReferences(
        "Run ${CLAUDE_PLUGIN_ROOT}/scripts/run.sh now",
        pluginDir,
      );
      assert.equal(out, `Run ${pluginDir}/scripts/run.sh now`);
    });

    await test("plugin-root rewrite leaves non-existent references untouched", async () => {
      const input = "Missing $CLAUDE_PLUGIN_ROOT/nope.sh";
      const out = await replaceClaudePluginRootReferences(input, pluginDir);
      assert.equal(out, input);
    });

    // --- end-to-end sync against a local directory marketplace -----------
    const marketplaceDir = path.join(tmp, "marketplace");
    await fs.mkdir(path.join(marketplaceDir, ".claude-plugin"), { recursive: true });
    await fs.writeFile(
      path.join(marketplaceDir, ".claude-plugin", "marketplace.json"),
      JSON.stringify({
        name: "datadog",
        plugins: [
          { name: "dd", source: "./dd" },
          // Newer marketplace manifests (e.g. claude-plugins-official) describe
          // external git plugins with an object source instead of a relative
          // path. The sync must skip these, not crash.
          { name: "external", source: { source: "url", url: "https://example.com/external.git", sha: "abc123" } },
        ],
      }),
    );
    // skills/
    await fs.mkdir(path.join(pluginDir, "skills", "demo"), { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, "skills", "demo", "SKILL.md"),
      "---\nname: dd:demo\ndescription: Demo skill\n---\nUse ${CLAUDE_PLUGIN_ROOT}/scripts/run.sh\n",
    );
    await fs.mkdir(path.join(pluginDir, "skills", "native-demo"), { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, "skills", "native-demo", "SKILL.md"),
      "---\nname: native-demo\ndescription: Duplicate native demo\n---\n",
    );
    // commands/
    await fs.mkdir(path.join(pluginDir, "commands", "pr"), { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, "commands", "pr", "review.md"),
      "---\ndescription: Review a PR\nargument-hint: [PR-URL]\n---\nReview $1 using ${CLAUDE_PLUGIN_ROOT}/scripts/run.sh\n",
    );
    await fs.writeFile(path.join(pluginDir, "commands", "README.md"), "ignored\n");
    // agents/
    await fs.mkdir(path.join(pluginDir, "agents", "foo"), { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, "agents", "oncall.md"),
      "---\ndescription: Oncall agent\n---\nUse $CLAUDE_PLUGIN_ROOT/scripts/run.sh for context\n",
    );
    await fs.writeFile(path.join(pluginDir, "agents", "foo", "bar.md"), "Nested agent\n");
    await fs.writeFile(path.join(pluginDir, "agents", "README.md"), "ignored\n");

    const settings = {
      extraKnownMarketplaces: { datadog: { source: { source: "directory", path: marketplaceDir } } },
      enabledPlugins: { "dd@datadog": true, "disabled@datadog": false, "external@datadog": true },
    };

    await test("syncMarketplaces resolves skills and commands from a local marketplace", async () => {
      const result = await syncMarketplaces(settings, {
        marketplacesRoot: path.join(tmp, "cache"),
        skillsStagingRoot: path.join(tmp, "staged-skills"),
        excludedSkillNames: new Set(["native-demo"]),
        skillsSync: true,
        commandsSync: true,
        agentsSync: true,
        log: silentLog,
      });

      assert.equal(result.marketplaceCount, 1);
      assert.equal(result.pluginCount, 1);
      assert.equal(result.skillPaths.length, 1);
      assert.notEqual(result.skillPaths[0], path.join(pluginDir, "skills"));
      assert.equal(path.basename(result.skillPaths[0]!), "demo");
      assert.equal(result.pluginRoots[0], pluginDir);
      const stagedSkill = await fs.readFile(path.join(result.skillPaths[0]!, "SKILL.md"), "utf8");
      assert.match(stagedSkill, /^name: dd-demo$/m);
      const sourceSkill = await fs.readFile(path.join(pluginDir, "skills", "demo", "SKILL.md"), "utf8");
      assert.match(sourceSkill, /^name: dd:demo$/m);
      const stagedPluginDir = path.dirname(path.dirname(result.skillPaths[0]!));
      assert.equal(await fs.readFile(path.join(stagedPluginDir, "scripts", "run.sh"), "utf8"), "echo hi\n");
      assert.equal(result.pluginRoots.includes(stagedPluginDir), true);

      assert.equal(result.commands.length, 1);
      const cmd = result.commands[0]!;
      assert.equal(cmd.name, "dd:pr:review");
      assert.equal(cmd.description, "Review a PR");
      assert.equal(cmd.argumentHint, "[PR-URL]");
      assert.equal(cmd.template, `Review $1 using ${pluginDir}/scripts/run.sh`);

      assert.deepEqual(
        result.agents.map((a) => a.name).sort(),
        ["dd:agent:foo:bar", "dd:agent:oncall"],
      );
      const agent = result.agents.find((a) => a.name === "dd:agent:oncall")!;
      assert.equal(agent.description, "Oncall agent");
      assert.equal(agent.template, `Use ${pluginDir}/scripts/run.sh for context`);
    });

    await test("object-source plugin entries are skipped without breaking the sync", async () => {
      const warnings: string[] = [];
      const collectingLog: Logger = (level, message) => {
        if (level === "warn") warnings.push(message);
      };
      const result = await syncMarketplaces(settings, {
        marketplacesRoot: path.join(tmp, "cache"),
        skillsStagingRoot: path.join(tmp, "staged-skills"),
        excludedSkillNames: new Set(["native-demo"]),
        skillsSync: true,
        commandsSync: true,
        agentsSync: true,
        log: collectingLog,
      });

      // The external plugin is skipped; the local plugin still syncs.
      assert.equal(result.pluginCount, 1);
      assert.deepEqual(result.commands.map((c) => c.name), ["dd:pr:review"]);
      assert.equal(
        warnings.some((w) => w.includes("external") && w.includes("external git source")),
        true,
      );
    });

    await test("materializePromptTemplates writes flat namespaced files", async () => {
      const staging = path.join(tmp, "prompts");
      await materializePromptTemplates(staging, [
        { name: "dd:pr:review", template: "Review $1", description: "Review a PR", argumentHint: "[PR-URL]" },
        { name: "dd:agent:oncall", template: "Handle oncall", description: "Oncall agent" },
      ]);
      const written = await fs.readFile(path.join(staging, "dd:pr:review.md"), "utf8");
      const agentWritten = await fs.readFile(path.join(staging, "dd:agent:oncall.md"), "utf8");
      assert.match(written, /description: "Review a PR"/);
      assert.match(written, /argument-hint: "\[PR-URL\]"/);
      assert.match(written, /Review \$1/);
      assert.match(agentWritten, /description: "Oncall agent"/);
      assert.match(agentWritten, /Handle oncall/);

      // Rebuild removes stale files.
      await materializePromptTemplates(staging, []);
      const remaining = await fs.readdir(staging);
      assert.deepEqual(remaining, []);
    });

    await test("commandsSync=false skips command discovery", async () => {
      const result = await syncMarketplaces(settings, {
        marketplacesRoot: path.join(tmp, "cache"),
        skillsStagingRoot: path.join(tmp, "staged-skills"),
        excludedSkillNames: new Set(["native-demo"]),
        skillsSync: true,
        commandsSync: false,
        agentsSync: true,
        log: silentLog,
      });
      assert.equal(result.commands.length, 0);
      assert.equal(result.agents.length, 2);
      assert.equal(result.skillPaths.length, 1);
    });

    await test("agentsSync=false skips agent discovery without changing commands", async () => {
      const result = await syncMarketplaces(settings, {
        marketplacesRoot: path.join(tmp, "cache"),
        skillsStagingRoot: path.join(tmp, "staged-skills"),
        excludedSkillNames: new Set(["native-demo"]),
        skillsSync: true,
        commandsSync: true,
        agentsSync: false,
        log: silentLog,
      });
      assert.equal(result.agents.length, 0);
      assert.deepEqual(result.commands.map((c) => c.name), ["dd:pr:review"]);
      assert.equal(result.skillPaths.length, 1);
    });

    // --- settings merge --------------------------------------------------
    await test("readClaudeSettings returns null when no settings exist", async () => {
      const emptyDir = path.join(tmp, "empty");
      await fs.mkdir(emptyDir, { recursive: true });
      const prevHome = process.env.HOME;
      process.env.HOME = emptyDir;
      try {
        const s = await readClaudeSettings(emptyDir);
        assert.equal(s, null);
      } finally {
        process.env.HOME = prevHome;
      }
    });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }

  console.log(`\n${passed} test(s) passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
