# file-bind

vscode extension for project-specific keybinds. If you use the same 2-3 files in your project, bind & jump without fuzzy finding, scrolling through recents, clicking, etc.

## Installation

```bash
git clone https://github.com/mikul1999-pixel/file-bind.git
cd file-bind
make install
```

Then reload VS Code.

## Usage
- Pin up to 9 files to slots (default is 3)
- Pin files & cursor location with ```Alt+Shift+1/2/3```
- Jump between files with ```Alt+1/2/3```

After config --> binds saved in .vscode/settings.json:
```bash
"file-bind.slots": {
    "1": {
        "filePath": "package.json",
        "line": 154,
        "character": 9
    },
    "2": {
        "filePath": "src/extension.ts",
        "line": 47,
        "character": 20
    },
    "3": {
        "filePath": "Makefile",
        "line": 0,
        "character": 0
    }
}
```

## Other options
From the command palette (ctrl+shift+p): <br>
- "File Bind: Configure Keybindings" --> Customizing Keybindings to replace ```Alt+1/2/3```
- "File Bind: Show Bound Files" --> Shows dropdown panel with bound slots & files
- "File Bind: Clear Slot 1/2/3" --> Deletes the bind setting for a given slot

In the extension settings, you can edit "Slot Count" to enable up to 9 slots