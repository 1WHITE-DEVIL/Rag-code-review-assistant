#!/bin/bash

# RAG Code Review Assistant - Quick Start Script
# This script sets up both backend and frontend for local development

set -e

echo "🚀 RAG Code Review Assistant - Setup Script"
echo "=============================================="

# Check prerequisites
echo "📋 Checking prerequisites..."

command -v python3 >/dev/null 2>&1 || { echo "❌ Python 3 is required but not installed. Aborting."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed. Aborting."; exit 1; }
command -v git >/dev/null 2>&1 || { echo "❌ Git is required but not installed. Aborting."; exit 1; }

echo "✅ All prerequisites met!"

# Backend setup
echo ""
echo "🐍 Setting up Backend..."
cd backend

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing Python dependencies..."
pip install -q --upgrade pip
pip install -q -r requirements.txt

if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo "⚠️  IMPORTANT: Edit backend/.env and add your OPENAI_API_KEY"
    echo "Get your API key from: https://platform.openai.com/api-keys"
fi

echo "✅ Backend setup complete!"

# Frontend setup
echo ""
echo "⚛️  Setting up Frontend..."
cd ../frontend

if [ ! -d "node_modules" ]; then
    echo "Installing Node dependencies..."
    npm install
fi

echo "✅ Frontend setup complete!"

# Final instructions
echo ""
echo "=============================================="
echo "✅ Setup Complete!"
echo "=============================================="
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Add your OpenAI API key to backend/.env"
echo "   OPENAI_API_KEY=sk-your-key-here"
echo ""
echo "2. Start the Backend:"
echo "   cd backend"
echo "   source venv/bin/activate  # On Windows: venv\\Scripts\\activate"
echo "   python main.py"
echo ""
echo "3. In a NEW terminal, start the Frontend:"
echo "   cd frontend"
echo "   npm run dev"
echo ""
echo "4. Open http://localhost:3000 in your browser"
echo ""
echo "🎉 Happy Coding!"
