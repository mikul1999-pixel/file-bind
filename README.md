# file-bind

vscode extension for project-specific keybinds. Switch between the same 2-3 files in the cwd without fuzzy finding, scrolling through recents, clicking, etc.

## Disclaimer
*This extension is a personal project, so ongoing support may not be provided*

## Usage
Intentionally minimal, not many fancy features
- Bind up to 9 files to slots (default is 3)
- Keybinding based on slot number (1-9)
- eg, Slot 1:
    - ```Alt+Shift+1``` to bind
    - ```Alt+1``` to teleport

## Extension settings
- `Slot Count` enables up to 9 slots
- `Status Preview Limit` limits number of slots shown on bottom status bar
- You can also edit virtual config files from the status quick pick:
    - `Manage Slot Sets` lets you save your file binds into sets and switch between them
    - `Edit Current Set` opens the active `slots.json`
    - `Edit All Sets` opens `config.json` to edit every saved binding in one place
    - set `mode` to save a specific line number or teleport to where you left off


Example `slots.json`
```json
{
    "1": {
        "filePath": "package.json",
        "line": 349,
        "character": 2,
        "mode": "auto"
    },
    "2": {
        "filePath": "src/extension.ts",
        "line": 11,
        "character": 0,
        "mode": "static"
    }
}
```

## Other commands
- `File Bind: Jump to Previous File` -> `Alt+Q` Go to last file and cursor position
- `File Bind: Cycle Slots Forward` -> `Alt+]` Go to next slot numerically, 1-9
- `File Bind: Cycle Slots Backward` -> `Alt+[` Go to previous slot numerically, 9-1
- `File Bind: Configure Keybindings` -> Customize keybindings to replace `Alt+1/2/3` ...
- `File Bind: Show Bound Files` -> Show dropdown panel with bound slots/files (click status bar)
- `File Bind: Open Full Config` -> Opens slot/set config file, config.json
- `File Bind: Clear Slot` -> Delete the bind setting for a given slot
