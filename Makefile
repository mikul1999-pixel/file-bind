.PHONY: install update uninstall build package

build:
	npm install
	npm run compile

package: build
	npx @vscode/vsce package

install: package
	code --install-extension file-bind-0.1.0.vsix

update:
	git pull
	npm install
	npx @vscode/vsce package
	code --install-extension file-bind-0.1.0.vsix --force

uninstall:
	code --uninstall-extension file-bind