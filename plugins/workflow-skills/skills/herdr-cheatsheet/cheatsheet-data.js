window.HERDR_CHEATSHEET = {
  "herdrVersion": "0.9.5",
  "sections": [
    {
      "id": "first",
      "title": "Learn these five first",
      "kind": "keys",
      "blurb": "These cover most daily movement. The mouse covers everything else.",
      "items": [
        {
          "keys": [
            "prefix",
            "c"
          ],
          "desc": "New tab"
        },
        {
          "keys": [
            "prefix",
            "v",
            "/",
            "prefix",
            "minus"
          ],
          "desc": "Split right / split down"
        },
        {
          "keys": [
            "prefix",
            "h/j/k/l"
          ],
          "desc": "Move between panes"
        },
        {
          "keys": [
            "prefix",
            "w"
          ],
          "desc": "Workspace navigation"
        },
        {
          "keys": [
            "prefix",
            "q"
          ],
          "desc": "Detach — everything keeps running"
        }
      ]
    },
    {
      "id": "mouse",
      "title": "Mouse",
      "kind": "mouse",
      "blurb": "Herdr is mouse-first. No bindings needed to get around.",
      "items": [
        {
          "keys": [
            "click"
          ],
          "desc": "Focus a pane, tab, workspace, or agent row"
        },
        {
          "keys": [
            "drag border"
          ],
          "desc": "Resize a split"
        },
        {
          "keys": [
            "right-click"
          ],
          "desc": "Context menu (split, close, rename…)"
        },
        {
          "keys": [
            "drag-select"
          ],
          "desc": "Copy text (copy_on_select is on by default)"
        },
        {
          "keys": [
            "wheel"
          ],
          "desc": "Scroll pane scrollback (3 lines per notch)"
        }
      ]
    },
    {
      "id": "panes",
      "title": "Panes",
      "kind": "keys",
      "items": [
        {
          "keys": [
            "prefix",
            "v"
          ],
          "desc": "Split right"
        },
        {
          "keys": [
            "prefix",
            "minus"
          ],
          "desc": "Split down"
        },
        {
          "keys": [
            "prefix",
            "h/j/k/l"
          ],
          "desc": "Focus left / down / up / right"
        },
        {
          "keys": [
            "prefix",
            "tab"
          ],
          "desc": "Cycle to next pane"
        },
        {
          "keys": [
            "prefix",
            "shift+tab"
          ],
          "desc": "Cycle to previous pane"
        },
        {
          "keys": [
            "prefix",
            "shift+h/j/k/l"
          ],
          "desc": "Swap pane in that direction"
        },
        {
          "keys": [
            "prefix",
            "z"
          ],
          "desc": "Zoom (fullscreen) focused pane"
        },
        {
          "keys": [
            "prefix",
            "r"
          ],
          "desc": "Resize mode"
        },
        {
          "keys": [
            "prefix",
            "x"
          ],
          "desc": "Close pane"
        },
        {
          "keys": [
            "prefix",
            "shift+p"
          ],
          "desc": "Rename pane"
        },
        {
          "keys": [
            "prefix",
            "e"
          ],
          "desc": "Edit scrollback in your editor"
        },
        {
          "keys": [
            "prefix",
            "["
          ],
          "desc": "Copy mode"
        }
      ]
    },
    {
      "id": "tabs",
      "title": "Tabs",
      "kind": "keys",
      "items": [
        {
          "keys": [
            "prefix",
            "c"
          ],
          "desc": "New tab"
        },
        {
          "keys": [
            "prefix",
            "n",
            "/",
            "prefix",
            "p"
          ],
          "desc": "Next / previous tab"
        },
        {
          "keys": [
            "prefix",
            "1..9"
          ],
          "desc": "Jump to tab 1–9"
        },
        {
          "keys": [
            "prefix",
            "shift+t"
          ],
          "desc": "Rename tab"
        },
        {
          "keys": [
            "prefix",
            "shift+x"
          ],
          "desc": "Close tab"
        }
      ]
    },
    {
      "id": "workspaces",
      "title": "Workspaces & session",
      "kind": "keys",
      "items": [
        {
          "keys": [
            "prefix",
            "w"
          ],
          "desc": "Workspace picker / navigation"
        },
        {
          "keys": [
            "prefix",
            "g"
          ],
          "desc": "Goto picker — every agent & terminal"
        },
        {
          "keys": [
            "prefix",
            "shift+n"
          ],
          "desc": "New workspace"
        },
        {
          "keys": [
            "prefix",
            "shift+g"
          ],
          "desc": "New git worktree workspace"
        },
        {
          "keys": [
            "prefix",
            "shift+w"
          ],
          "desc": "Rename workspace"
        },
        {
          "keys": [
            "prefix",
            "shift+d"
          ],
          "desc": "Close workspace"
        },
        {
          "keys": [
            "prefix",
            "b"
          ],
          "desc": "Toggle sidebar"
        },
        {
          "keys": [
            "prefix",
            "o"
          ],
          "desc": "Jump to notification's target"
        },
        {
          "keys": [
            "prefix",
            "s"
          ],
          "desc": "Settings"
        },
        {
          "keys": [
            "prefix",
            "shift+r"
          ],
          "desc": "Reload config"
        },
        {
          "keys": [
            "prefix",
            "?"
          ],
          "desc": "Show all active bindings (/ to filter)"
        },
        {
          "keys": [
            "prefix",
            "q"
          ],
          "desc": "Detach"
        }
      ]
    },
    {
      "id": "goto",
      "title": "Goto picker (prefix g)",
      "kind": "keys",
      "blurb": "Lists each agent or terminal on its own row, grouped by workspace.",
      "items": [
        {
          "keys": [
            "enter"
          ],
          "desc": "Jump to selected row (or click it)"
        },
        {
          "keys": [
            "/"
          ],
          "desc": "Search names, agent kinds, tabs, branches, paths"
        },
        {
          "keys": [
            "j/k",
            "/",
            "up/down"
          ],
          "desc": "Move between rows"
        },
        {
          "keys": [
            "left/right"
          ],
          "desc": "Previous / next workspace section"
        },
        {
          "keys": [
            "b",
            "w",
            "i",
            "d"
          ],
          "desc": "Filter blocked / working / idle / done"
        },
        {
          "keys": [
            "a"
          ],
          "desc": "Show all terminals again"
        },
        {
          "keys": [
            "esc"
          ],
          "desc": "Leave (also ctrl+[)"
        }
      ]
    },
    {
      "id": "navigate",
      "title": "Navigate mode",
      "kind": "keys",
      "blurb": "Local shortcuts that win while navigate mode is open.",
      "items": [
        {
          "keys": [
            "up/down"
          ],
          "desc": "Previous / next workspace"
        },
        {
          "keys": [
            "h/j/k/l"
          ],
          "desc": "Focus pane left / down / up / right"
        },
        {
          "keys": [
            "←/→"
          ],
          "desc": "Arrow keys always focus left / right pane"
        }
      ]
    },
    {
      "id": "copy",
      "title": "Copy mode (prefix [)",
      "kind": "keys",
      "blurb": "Output stays live while you're in copy mode.",
      "items": [
        {
          "keys": [
            "h/j/k/l"
          ],
          "desc": "Move cursor"
        },
        {
          "keys": [
            "w/b/e",
            "W/B/E"
          ],
          "desc": "Word / big-word motions"
        },
        {
          "keys": [
            "{",
            "}"
          ],
          "desc": "Paragraph up / down"
        },
        {
          "keys": [
            "ctrl+u",
            "ctrl+d"
          ],
          "desc": "Half page up / down"
        },
        {
          "keys": [
            "pgup",
            "pgdn"
          ],
          "desc": "Page up / down (also ctrl+f)"
        },
        {
          "keys": [
            "/",
            "?"
          ],
          "desc": "Search forward / backward"
        },
        {
          "keys": [
            "n",
            "N"
          ],
          "desc": "Repeat search same / opposite way"
        },
        {
          "keys": [
            "v",
            "space"
          ],
          "desc": "Start selection"
        },
        {
          "keys": [
            "y",
            "enter"
          ],
          "desc": "Copy selection"
        },
        {
          "keys": [
            "q",
            "esc"
          ],
          "desc": "Leave without copying"
        }
      ]
    },
    {
      "id": "fields",
      "title": "Editing Herdr text fields",
      "kind": "keys",
      "blurb": "Naming dialogs, filters, branch fields. Not the shell inside a pane.",
      "items": [
        {
          "keys": [
            "ctrl+a",
            "ctrl+e"
          ],
          "desc": "Start / end of line"
        },
        {
          "keys": [
            "alt+b",
            "alt+f"
          ],
          "desc": "Back / forward one word"
        },
        {
          "keys": [
            "ctrl+u",
            "ctrl+k"
          ],
          "desc": "Cut to start / end"
        },
        {
          "keys": [
            "ctrl+w"
          ],
          "desc": "Cut previous word"
        },
        {
          "keys": [
            "ctrl+y"
          ],
          "desc": "Paste last cut"
        }
      ]
    },
    {
      "id": "states",
      "title": "Agent states",
      "kind": "concepts",
      "blurb": "Shown in the sidebar per agent and rolled up per workspace.",
      "items": [
        {
          "state": "working",
          "desc": "Agent is busy running"
        },
        {
          "state": "blocked",
          "desc": "Waiting on you — needs input or approval"
        },
        {
          "state": "done",
          "desc": "Finished its turn"
        },
        {
          "state": "idle",
          "desc": "Running but quiet"
        },
        {
          "state": "unknown",
          "desc": "Herdr can't classify it yet"
        }
      ]
    },
    {
      "id": "concepts",
      "title": "Concepts",
      "kind": "concepts",
      "items": [
        {
          "term": "Session",
          "desc": "Background server namespace. `herdr` attaches to the default one."
        },
        {
          "term": "Workspace",
          "desc": "One per repo or task. Owns tabs and panes."
        },
        {
          "term": "Tab",
          "desc": "A layout inside a workspace (agents, logs, server…)."
        },
        {
          "term": "Pane",
          "desc": "A real terminal. Survives detach."
        },
        {
          "term": "Agent",
          "desc": "A coding agent Herdr detects inside a pane."
        },
        {
          "term": "Modes",
          "desc": "Terminal (keys → pane), prefix (one key → Herdr), navigate."
        }
      ]
    },
    {
      "id": "basics",
      "title": "Everyday CLI",
      "kind": "cli",
      "items": [
        {
          "cmd": "herdr",
          "desc": "Launch or attach to the default session"
        },
        {
          "cmd": "herdr session attach work",
          "desc": "Use a separate named session"
        },
        {
          "cmd": "herdr session list",
          "desc": "List named sessions"
        },
        {
          "cmd": "herdr status",
          "desc": "Client + server status summary"
        },
        {
          "cmd": "herdr server stop",
          "desc": "Actually stop everything"
        },
        {
          "cmd": "herdr server reload-config",
          "desc": "Apply config.toml edits live"
        },
        {
          "cmd": "herdr update",
          "desc": "Install the latest version"
        },
        {
          "cmd": "herdr --version",
          "desc": "Print version"
        }
      ]
    },
    {
      "id": "agents-cli",
      "title": "Agents CLI",
      "kind": "cli",
      "blurb": "Targets accept unique agent names or pane ids hosting an agent.",
      "items": [
        {
          "cmd": "herdr agent list",
          "desc": "Every agent Herdr sees, with state"
        },
        {
          "cmd": "herdr agent read <target> --lines 50",
          "desc": "Read an agent's recent output"
        },
        {
          "cmd": "herdr agent prompt <target> \"text\" --wait",
          "desc": "Send a prompt and wait for it to finish"
        },
        {
          "cmd": "herdr agent wait <target> --until done",
          "desc": "Block until an agent reaches a state"
        },
        {
          "cmd": "herdr agent start <name> --kind claude --pane <pane_id>",
          "desc": "Start an agent in a pane"
        },
        {
          "cmd": "herdr agent focus <target>",
          "desc": "Jump to an agent's pane"
        },
        {
          "cmd": "herdr agent rename <target> <name>",
          "desc": "Give an agent a friendly name"
        },
        {
          "cmd": "herdr agent explain <target> --json",
          "desc": "Why the detector picked this state"
        }
      ]
    },
    {
      "id": "panes-cli",
      "title": "Panes CLI",
      "kind": "cli",
      "items": [
        {
          "cmd": "herdr pane list",
          "desc": "List panes"
        },
        {
          "cmd": "herdr pane current",
          "desc": "Show the pane you're in"
        },
        {
          "cmd": "herdr pane split --current --direction right --no-focus",
          "desc": "Split without stealing focus"
        },
        {
          "cmd": "herdr pane run <pane_id> \"npm test\"",
          "desc": "Run a command in another pane"
        },
        {
          "cmd": "herdr pane read <pane_id> --source recent --lines 100",
          "desc": "Read a pane's output"
        },
        {
          "cmd": "herdr pane wait-output <pane_id> --match \"ready\" --timeout 30000",
          "desc": "Wait for text to appear"
        },
        {
          "cmd": "herdr pane send-keys <pane_id> ctrl+c",
          "desc": "Send keys to a pane"
        },
        {
          "cmd": "herdr pane zoom --current --toggle",
          "desc": "Toggle zoom"
        },
        {
          "cmd": "herdr pane move <pane_id> --new-tab",
          "desc": "Move a pane to its own tab"
        },
        {
          "cmd": "herdr pane close <pane_id>",
          "desc": "Close a pane"
        }
      ]
    },
    {
      "id": "ws-cli",
      "title": "Workspaces, tabs & worktrees CLI",
      "kind": "cli",
      "items": [
        {
          "cmd": "herdr workspace list",
          "desc": "List workspaces"
        },
        {
          "cmd": "herdr workspace create --cwd ~/Code/kranz-tv --label kranz-tv --focus",
          "desc": "New workspace for a repo"
        },
        {
          "cmd": "herdr workspace rename <workspace_id> <label>",
          "desc": "Rename workspace"
        },
        {
          "cmd": "herdr tab create --label logs --no-focus",
          "desc": "New tab in the background"
        },
        {
          "cmd": "herdr tab list",
          "desc": "List tabs"
        },
        {
          "cmd": "herdr worktree create --branch feat/x --focus",
          "desc": "New git worktree as its own workspace"
        },
        {
          "cmd": "herdr worktree list",
          "desc": "List worktrees"
        },
        {
          "cmd": "herdr worktree remove --workspace <workspace_id>",
          "desc": "Remove a worktree workspace"
        },
        {
          "cmd": "herdr notification show \"Build done\" --sound done",
          "desc": "Pop a notification (great in scripts)"
        }
      ]
    },
    {
      "id": "remote",
      "title": "Remote & machines",
      "kind": "cli",
      "items": [
        {
          "cmd": "herdr --remote <ssh-target>",
          "desc": "Attach to a remote Herdr as a thin local client"
        },
        {
          "cmd": "herdr machine add <ssh-target> --label pi",
          "desc": "Save an SSH machine"
        },
        {
          "cmd": "herdr machine list",
          "desc": "List saved machines"
        },
        {
          "cmd": "herdr --machine pi agent list",
          "desc": "Run any API command on a saved machine"
        }
      ]
    },
    {
      "id": "integrations",
      "title": "Integrations",
      "kind": "cli",
      "blurb": "Add lifecycle state and/or native session restore for an agent.",
      "items": [
        {
          "cmd": "herdr integration status",
          "desc": "What's installed and current"
        },
        {
          "cmd": "herdr integration status --outdated-only",
          "desc": "Only show integrations needing an update"
        },
        {
          "cmd": "herdr integration install claude",
          "desc": "Claude Code session restore"
        },
        {
          "cmd": "herdr integration install codex",
          "desc": "Codex integration"
        },
        {
          "cmd": "herdr --skill",
          "desc": "Print the agent skill file"
        }
      ]
    },
    {
      "id": "config",
      "title": "Config",
      "kind": "config",
      "blurb": "~/.config/herdr/config.toml — Herdr works without one.",
      "items": [
        {
          "cmd": "herdr --default-config",
          "desc": "Print every option with comments"
        },
        {
          "cmd": "herdr config check",
          "desc": "Validate config.toml"
        },
        {
          "cmd": "herdr config reset-keys",
          "desc": "Back up config, drop custom keybindings"
        },
        {
          "cmd": "[keys]\nprefix = \"ctrl+a\"",
          "desc": "Change the prefix",
          "plain": true
        },
        {
          "cmd": "[theme]\nname = \"tokyo-night\"",
          "desc": "Themes: catppuccin, tokyo-night, dracula, nord, gruvbox, one-dark, solarized, kanagawa, rose-pine, vesper, terminal",
          "plain": true
        },
        {
          "cmd": "[ui.toast]\ndelivery = \"system\"",
          "desc": "Desktop notifications when agents change state (off by default)",
          "plain": true
        },
        {
          "cmd": "[[keys.command]]\nkey = \"prefix+alt+g\"\ntype = \"popup\"\ncommand = \"lazygit\"\nwidth = \"80%\"\nheight = \"80%\"",
          "desc": "Bind a key to a popup command",
          "plain": true
        }
      ]
    },
    {
      "id": "prefixfree",
      "title": "Going prefix-free",
      "kind": "config",
      "blurb": "ctrl+alt chords are free in almost every terminal. Keeps prefix bindings too.",
      "items": [
        {
          "cmd": "[keys]\nfocus_pane_left  = [\"prefix+h\", \"ctrl+alt+h\"]\nfocus_pane_down  = [\"prefix+j\", \"ctrl+alt+j\"]\nfocus_pane_up    = [\"prefix+k\", \"ctrl+alt+k\"]\nfocus_pane_right = [\"prefix+l\", \"ctrl+alt+l\"]\nprevious_tab     = [\"prefix+p\", \"ctrl+alt+[\"]\nnext_tab         = [\"prefix+n\", \"ctrl+alt+]\"]\nnew_tab          = [\"prefix+c\", \"ctrl+alt+c\"]\nsplit_vertical   = [\"prefix+v\", \"ctrl+alt+d\"]\nsplit_horizontal = [\"prefix+minus\", \"ctrl+alt+shift+d\"]\nzoom             = [\"prefix+z\", \"ctrl+alt+z\"]",
          "desc": "Vetted setup from the Herdr docs",
          "plain": true
        }
      ]
    },
    {
      "id": "trouble",
      "title": "Troubleshooting",
      "kind": "trouble",
      "items": [
        {
          "cmd": "herdr agent list",
          "desc": "Agent missing or wrong state? See what Herdr sees"
        },
        {
          "cmd": "herdr agent explain <target> --json",
          "desc": "…then see why it classified it that way"
        },
        {
          "cmd": "herdr status server",
          "desc": "Startup or socket problems"
        },
        {
          "cmd": "tail -n 100 ~/.config/herdr/herdr-server.log",
          "desc": "Server log (client log sits next to it)"
        },
        {
          "cmd": "herdr config check",
          "desc": "Bad config after an edit"
        },
        {
          "keys": [
            "chord does nothing"
          ],
          "desc": "Your terminal or OS consumed it first. Free it there or pick another chord."
        },
        {
          "keys": [
            "nested herdr"
          ],
          "desc": "Herdr blocks launching herdr inside a Herdr pane by design."
        }
      ]
    }
  ]
};
