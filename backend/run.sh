#!/bin/bash
# Start the Brain Fresh backend server
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:$PATH"

if [ ! -d ".venv" ]; then
    echo "Setting up virtual environment..."
    uv venv
    uv pip install -e .
fi

source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
