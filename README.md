# file-bind

vscode extension for project-specific keybinds. If you use the same 2-3 files in your cwd, hop back & forth without fuzzy finding, scrolling through recents, clicking, etc.

## Usage
Intentionally minimal, not many fancy features
- Bind up to 9 files to slots (default is 3)
- Keybinding based on slot number (1-9)
- eg, Slot 1:
    - ```Alt+Shift+1``` to bind
    - ```Alt+1``` to teleport

## Extension settings
- "Slot Count" enable up to 9 slots
- "Status Preview Limit" limit number of slots shown on bottom status bar
- ```.vscode/settings.json``` 
    - can manually edit or copy/paste bindings
    - config line number binding vs auto-remembering last line

```bash
"file-bind.slots": {
    "1": {
        "filePath": "src/extension.ts",
        "line": 627,
        "character": 3,
        "mode": "auto"
    },
    "2": {
        "filePath": "README.md",
        "line": 1,
        "character": 0,
        "mode": "static"
    }
}
```

## Other commands
From the command palette (ctrl+shift+p): <br>
- "File Bind: Configure Keybindings" --> Customize Keybindings to replace ```Alt+1/2/3```
- "File Bind: Show Bound Files" --> Show dropdown panel with bound slots & files (can trigger by clicking on status bar)
- "File Bind: Clear Slot 1/2/3" --> Delete the bind setting for a given slot
