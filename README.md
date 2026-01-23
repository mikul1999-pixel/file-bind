# file-bind

vscode extension for project-specific keybinds. If you use the same 2-3 files in your project, bind & jump without fuzzy finding, clicking, etc.

## Installation

```bash
git clone https://github.com/mikul1999-pixel/file-bind.git
cd file-bind
make install
```

Then reload VS Code.

## Usage
- Pin up to 3 files to slots
- Pin files with ```Alt+Shift+1/2/3```
- Jump between files with ```Alt+1/2/3```

After config --> binds saved in .vscode/settings.json:
```bash
"file-bind.slots": {
    "1": "package.json",
    "2": "src/extension.ts",
    "3": "Makefile"
}
```

## Other commands
From the command palette (ctrl+shift+p): <br>
- "File Bind: Configure Keybindings" --> Customizing Keybindings to replace ```Alt+1/2/3```
- "File Bind: Show Bound Files" --> Shows info panel with bound slots & files