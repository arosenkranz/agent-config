"""Offline tests for the shared installer's filesystem and CLI boundary."""

import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/install-matt-skills.py"
spec = importlib.util.spec_from_file_location("installer", SCRIPT)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.manifest = {
            "repository": "mattpocock/skills",
            "revision": "a" * 40,
            "skillsCliVersion": "1.7.4",
            "skills": ["ask-matt", "tdd"],
            "explicitOnly": ["ask-matt"],
        }
        self.runner = Mock(side_effect=self.fake_cli)

    def fake_cli(self, command, **kwargs):
        for name in self.manifest["skills"]:
            target = self.home / ".claude/skills" / name
            target.mkdir(parents=True)
            explicit = "disable-model-invocation: true\n" if name == "ask-matt" else ""
            (target / "SKILL.md").write_text(
                f"---\nname: {name}\ndescription: Test skill\n{explicit}---\nBody\n"
            )
            (target / "reference.md").write_text("A bundled reference\n")

    def install(self, check=False):
        return installer.install(self.manifest, self.home, check, self.runner)

    def test_pins_revision_cli_selection_and_claude_only(self):
        self.install()
        command = self.runner.call_args.args[0]
        self.assertEqual(command[:4], ["npx", "--yes", "skills@1.7.4", "add"])
        self.assertIn("https://github.com/mattpocock/skills/tree/" + "a" * 40, command)
        self.assertEqual(command[command.index("--agent") + 1], "claude-code")
        self.assertEqual(
            command[command.index("--skill") + 1 : -1], ["ask-matt", "tdd"]
        )
        self.assertEqual(command[-1], "--yes")
        self.assertIn("--global", command)
        self.assertIn("--copy", command)
        self.assertFalse((self.home / ".pi/agent/skills/tdd").exists())
        self.assertTrue(self.install(check=True))
        self.assertEqual(self.runner.call_count, 1)

    def test_reinstall_is_read_only(self):
        self.install()
        self.install()
        self.assertEqual(self.runner.call_count, 1)

    def test_refuses_existing_unmanaged_destinations_in_both_harnesses(self):
        for directory in [".agents/skills", ".claude/skills", ".pi/agent/skills"]:
            with self.subTest(directory=directory):
                target = self.home / directory / "tdd"
                target.mkdir(parents=True)
                with self.assertRaisesRegex(RuntimeError, "Refusing to overwrite"):
                    self.install()
                target.rmdir()
        self.runner.assert_not_called()

    def test_refuses_broken_link(self):
        target = self.home / ".claude/skills/tdd"
        target.parent.mkdir(parents=True)
        target.symlink_to(self.home / "missing")
        with self.assertRaisesRegex(RuntimeError, "Refusing to overwrite"):
            self.install()
        self.runner.assert_not_called()

    def test_refuses_enabled_plugin_duplicate(self):
        path = self.home / ".claude/settings.json"
        path.parent.mkdir()
        path.write_text(
            json.dumps({"enabledPlugins": {"mattpocock-skills@mattpocock": True}})
        )
        with self.assertRaisesRegex(RuntimeError, "plugin"):
            self.install()
        self.runner.assert_not_called()

    def test_detects_edits_to_bundled_files(self):
        self.install()
        (self.home / ".agents/skills/tdd/reference.md").write_text("Local edit")
        with self.assertRaisesRegex(RuntimeError, "changed"):
            self.install()
        self.assertEqual(self.runner.call_count, 1)

    def test_detects_changed_link(self):
        self.install()
        link = self.home / ".claude/skills/tdd"
        link.unlink()
        link.mkdir()
        with self.assertRaisesRegex(RuntimeError, "link"):
            self.install(check=True)

    def test_changed_revision_needs_explicit_migration(self):
        self.install()
        self.manifest["revision"] = "b" * 40
        with self.assertRaisesRegex(RuntimeError, "revision"):
            self.install()
        self.assertEqual(self.runner.call_count, 1)

    def test_partial_cli_failure_removes_only_new_targets(self):
        unrelated = self.home / ".agents/skills/keep/SKILL.md"
        unrelated.parent.mkdir(parents=True)
        unrelated.write_text("Keep me")

        def failure(command, **kwargs):
            self.fake_cli(command)
            raise subprocess.CalledProcessError(1, command)

        self.runner.side_effect = failure
        with self.assertRaises(subprocess.CalledProcessError):
            self.install()
        self.assertTrue(unrelated.exists())
        self.assertFalse((self.home / ".agents/skills/tdd").exists())
        self.assertFalse((self.home / ".claude/skills/tdd").is_symlink())
        self.assertFalse(installer.receipt_path(self.home).exists())

    def test_failed_install_restores_existing_cli_source_lock(self):
        lock = self.home / ".agents/.skill-lock.json"
        lock.parent.mkdir(parents=True)
        original = '{"version": 3, "skills": {"keep": {}}}\n'
        lock.write_text(original)

        def failure(command, **kwargs):
            self.fake_cli(command)
            lock.write_text('{"skills": {"tdd": {}}}')
            raise subprocess.CalledProcessError(1, command)

        self.runner.side_effect = failure
        with self.assertRaises(subprocess.CalledProcessError):
            self.install()
        self.assertEqual(lock.read_text(), original)

    def test_failed_install_removes_new_cli_source_lock(self):
        lock = self.home / ".agents/.skill-lock.json"

        def failure(command, **kwargs):
            self.fake_cli(command)
            lock.parent.mkdir(parents=True)
            lock.write_text('{"skills": {"tdd": {}}}')
            raise subprocess.CalledProcessError(1, command)

        self.runner.side_effect = failure
        with self.assertRaises(subprocess.CalledProcessError):
            self.install()
        self.assertFalse(lock.exists())

    def test_rejects_unexpected_cli_symlink(self):
        def linked(command, **kwargs):
            self.fake_cli(command)
            link = self.home / ".claude/skills/tdd"
            installer.remove(link)
            link.symlink_to(self.home / "missing")

        self.runner.side_effect = linked
        with self.assertRaisesRegex(RuntimeError, "copy before linking"):
            self.install()
        self.assertFalse((self.home / ".agents/skills/tdd").exists())

    def test_preserves_explicit_only_frontmatter(self):
        def altered(command, **kwargs):
            self.fake_cli(command)
            path = self.home / ".claude/skills/ask-matt/SKILL.md"
            path.write_text(
                path.read_text().replace("disable-model-invocation: true\n", "")
            )

        self.runner.side_effect = altered
        with self.assertRaisesRegex(RuntimeError, "invocation"):
            self.install()
        self.assertFalse(installer.receipt_path(self.home).exists())

    def test_check_requires_receipt(self):
        with self.assertRaisesRegex(RuntimeError, "not installed"):
            self.install(check=True)
        self.runner.assert_not_called()

    def test_rejects_unsafe_or_duplicate_names(self):
        for names in [["../escape"], ["tdd", "tdd"], []]:
            with self.subTest(names=names):
                self.manifest["skills"] = names
                with self.assertRaises(ValueError):
                    self.install()
        self.runner.assert_not_called()


if __name__ == "__main__":
    unittest.main()
