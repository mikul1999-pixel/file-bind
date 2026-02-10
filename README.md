# file-bind

vscode extension for project-specific keybinds. Switch between the same 2-3 files in the cwd without fuzzy finding, scrolling through recents, clicking, etc.

> [!WARNING]
>
> This extension is a personal project, so ongoing support may not be provided

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
- ```command palette -> "File Bind: Configure Slots"``` 
    - manually edit slots. or copy/paste bindings
    - set "mode". setting to save a specific line number or teleport to where you left off

```bash
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
- "File Bind: Configure Keybindings" --> Customize Keybindings to replace ```Alt+1/2/3```
- "File Bind: Show Bound Files" --> Show dropdown panel with bound slots & files (can trigger by clicking on status bar)
- "File Bind: Clear Slot 1/2/3" --> Delete the bind setting for a given slot
