#!/bin/bash
# Start the Brain Fresh frontend dev server
cd "$(dirname "$0")"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

npx vite --host
