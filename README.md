# CC-Switch Web UI

A modern web-based user interface for managing [cc-switch-cli](https://github.com/SaladDay/cc-switch-cli). This application provides an intuitive GUI to manage AI providers, MCP servers, prompts, skills, and configurations for **Claude Code, Codex, Gemini, and Kilo Code / OpenCode** CLI applications.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)

> **GitHub Short Description:**
> Modern Web UI for CC-Switch & Kilo Code CLI: Manage AI Providers, MCP Servers, and Advanced Configurations (Claude, Gemini, Codex, OpenCode).

## 📋 Table of Contents

- [Prerequisites](#-prerequisites)
- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
- [Configuration](#-configuration)
- [API Reference](#-api-reference)
- [Development](#-development)
- [Project Structure](#-project-structure)
- [Contributing](#-contributing)
- [License](#-license)

## 🔧 Prerequisites

### Install cc-switch-cli (Required)

This web UI is a wrapper for the `cc-switch-cli` tool. You **must** install it first.

#### Linux (x64)

```bash
# Download
curl -LO https://github.com/saladday/cc-switch-cli/releases/latest/download/cc-switch-cli-linux-x64-musl.tar.gz

# Extract
tar -xzf cc-switch-cli-linux-x64-musl.tar.gz

# Add execute permission
chmod +x cc-switch

# Move to PATH
sudo mv cc-switch /usr/local/bin/
```

#### Linux (ARM64)

For Raspberry Pi or ARM servers:

```bash
# Download
curl -LO https://github.com/saladday/cc-switch-cli/releases/latest/download/cc-switch-cli-linux-arm64-musl.tar.gz

# Extract
tar -xzf cc-switch-cli-linux-arm64-musl.tar.gz

# Add execute permission
chmod +x cc-switch

# Move to PATH
sudo mv cc-switch /usr/local/bin/
```

#### Verify Installation

```bash
cc-switch --help
```

### System Requirements

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **sqlite3**: For direct database operations
- **cc-switch-cli**: Latest version (see installation above)

## ✨ Features

### Kilo Code / OpenCode Integration (New!)
- 🛠️ **Advanced Configuration Management**: Full support for editing `opencode.json`, `opencode.jsonc`, and `kilocode.json`.
- 🤖 **Multi-Model Provider Support**: Create and manage custom providers with support for multiple models per provider (e.g., DeepSeek, Gemini 2.5, etc.).
- 🔄 **Smart Config Merging**: Automatically detects and merges configurations from multiple files, prioritizing user preferences (e.g., `opencode.json` > `kilocode.json`).
- ⚡ **TUI Settings**: Configure CLI TUI options like `scroll_acceleration` directly from the UI.
- 📁 **Dynamic Path Resolution**: Automatically locates configuration files in standard user directories (`~/.config/kilo/`, `~/.config/opencode/`).

### Provider Management
- 📋 List all configured AI providers
- 🔄 Switch between providers instantly
- ➕ Add new custom providers
- ✏️ Edit existing provider configurations
- 📋 Duplicate providers
- 🗑️ Delete providers
- ⚡ Run speed tests to check provider latency

### MCP Server Management
- 📋 List all MCP (Model Context Protocol) servers
- ➕ Add new MCP servers with custom commands and environment variables
- ✏️ Edit MCP server configurations
- 🔄 Enable/disable servers per application
- 🗑️ Delete MCP servers
- 🔁 Sync MCP server configurations

### Prompts Management
- 📋 List all saved prompts
- ➕ Create new prompts with custom content
- ✏️ Edit existing prompts
- 🔄 Activate/deactivate prompts
- 🗑️ Delete prompts

### Skills Management
- 📋 List installed skills
- 🔍 Search for available skills
- 📦 Install new skills from repositories
- 🗑️ Uninstall skills
- 🔄 Enable/disable skills per application
- 📚 Manage skill repositories (add/remove)

### Environment Variables
- 📋 View all environment variables
- 🔍 See variable sources and locations
- 📊 Understand configuration hierarchy

### Configuration Management
- 📤 Export configuration to file
- 📥 Import configuration from file
- 💾 Create configuration backups
- 🔙 Restore from backups
- 📂 View configuration paths

### Additional Features
- 👤 Authentication with password protection
- 📊 Dashboard with status overview
- 📝 Activity logs
- 🎨 Modern, responsive UI with dark theme
- 🔒 Secure API with Bearer token authentication

## 🚀 Installation

### Clone the Repository

```bash
git clone https://github.com/yourusername/cc-switch-web-ui.git
cd cc-switch-web-ui
```

### Install Dependencies

```bash
npm install
```

### Configure Environment

```bash
cp .env.example .env
```

Edit the `.env` file with your preferred settings:

```env
# Server Configuration
PORT=33010
HOST=0.0.0.0
NODE_ENV=production

# Authentication (REQUIRED for production)
ADMIN_PASSWORD=your_secure_password_here

# CORS (set to your frontend URL in production)
CORS_ORIGIN=*

# Path to cc-switch binary (optional; auto-detects ~/.local/bin/cc-switch and PATH)
# CC_SWITCH_PATH=/usr/local/bin/cc-switch

# Optional: isolate data dir (required for write tests; leave unset for real ~/.cc-switch)
# CC_SWITCH_CONFIG_DIR=/tmp/cc-switch-web-sandbox
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for install, sandbox tests, and start commands.

## 🎮 Usage

### Start the Development Server

```bash
npm run dev
```

The application will start at `http://localhost:33010` (or the port you configured)

### Production Build

```bash
npm run build
npm start
```

### Access the Application

1. Open your browser and navigate to `http://localhost:33010`
2. Log in with the password you set in `ADMIN_PASSWORD`
3. Start managing your AI provider configurations!

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `33010` |
| `HOST` | Server host binding | `0.0.0.0` |
| `NODE_ENV` | Environment mode | `development` |
| `ADMIN_PASSWORD` | Password for API authentication | (none - auth disabled) |
| `CORS_ORIGIN` | Allowed CORS origins | `*` |
| `CC_SWITCH_PATH` | Custom path to cc-switch binary | `/usr/local/bin/cc-switch` |
| `DEBUG` | Enable debug logging | `false` |
| `LOG_LEVEL` | Logging level | `info` |

## 📚 API Reference

### Authentication

All API endpoints (except `/api/health` and `/api/auth/login`) require Bearer token authentication.

```bash
# Login
POST /api/auth/login
Body: { "password": "your_password" }
Response: { "success": true, "token": "..." }

# Use token in subsequent requests
Authorization: Bearer <token>
```

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/status` | GET | Get current provider/profile status |
| `/api/providers` | GET | List all providers |
| `/api/providers/switch` | POST | Switch to a provider |
| `/api/providers/add` | POST | Add new provider |
| `/api/providers/edit` | POST | Edit provider |
| `/api/providers/duplicate` | POST | Duplicate provider |
| `/api/providers/speedtest` | POST | Run speedtest on provider |
| `/api/providers/:id` | DELETE | Delete provider |
| `/api/mcp` | GET | List MCP servers |
| `/api/mcp` | POST | Add MCP server |
| `/api/mcp/toggle` | POST | Toggle MCP server |
| `/api/prompts` | GET | List prompts |
| `/api/prompts/create` | POST | Create prompt |
| `/api/prompts/:id/activate` | POST | Activate prompt |
| `/api/skills` | GET | List skills |
| `/api/skills/search` | GET | Search skills |
| `/api/skills/install` | POST | Install skill |
| `/api/env` | GET | List environment variables |
| `/api/config/export` | POST | Export configuration |
| `/api/config/import` | POST | Import configuration |
| `/api/config/backup` | POST | Create backup |
| `/api/logs` | GET | Get activity logs |

## 🛠️ Development

### Project Structure

```
cc-switch-web-ui/
├── src/
│   ├── main.tsx               # Frontend entry point
│   ├── App.tsx                # Main app component
│   ├── server/                # Backend server code
│   │   ├── index.ts           # Server entry point
│   │   ├── routes/            # API route handlers
│   │   │   ├── auth.ts        # Authentication routes
│   │   │   ├── config.ts      # Configuration management
│   │   │   ├── custom-tools.ts # Custom tools routes
│   │   │   ├── env.ts         # Environment variables
│   │   │   ├── logs.ts        # Activity logs
│   │   │   ├── mcp.ts         # MCP server management
│   │   │   ├── profiles.ts    # Profile management
│   │   │   ├── prompts.ts     # Prompts management
│   │   │   ├── providers.ts   # Provider management
│   │   │   ├── settings.ts    # Settings routes
│   │   │   └── skills.ts      # Skills management
│   │   ├── services/
│   │   │   ├── ccswitch-adapter.ts  # CLI wrapper service
│   │   │   ├── config-storage.ts    # Configuration storage
│   │   │   └── kilocode-service.ts  # Kilo/OpenCode Service (New!)
│   │   │   └── custom-cli-engine.ts # Custom CLI execution
│   │   ├── middleware/
│   │   │   └── auth.ts        # Authentication middleware
│   │   └── types/
│   │       ├── index.ts       # Type definitions
│   │       └── db.ts          # Database types
│   ├── components/            # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Header.tsx
│   │   ├── Layout.tsx
│   │   ├── Modal.tsx
│   │   ├── ProtectedRoute.tsx
│   │   ├── ProviderCard.tsx
│   │   ├── Sidebar.tsx
│   │   └── StatusBadge.tsx
│   ├── pages/                 # Page components
│   │   ├── Config.tsx
│   │   ├── CustomTools.tsx
│   │   ├── Dashboard.tsx
│   │   ├── EnvVars.tsx
│   │   ├── Login.tsx
│   │   ├── Logs.tsx
│   │   ├── McpServers.tsx
│   │   ├── Profiles.tsx
│   │   ├── Prompts.tsx
│   │   ├── Providers.tsx
│   │   ├── Settings.tsx
│   │   └── Skills.tsx
│   ├── services/
│   │   └── api.ts             # API client
│   ├── hooks/                 # Custom React hooks
│   │   ├── useApi.ts
│   │   └── useAuth.ts
│   ├── contexts/
│   │   └── AppContext.tsx     # Global state
│   └── types/
│       └── index.ts           # Type definitions
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json              # Frontend TypeScript config
└── tsconfig.server.json       # Server TypeScript config
```

### Available Scripts

```bash
npm run dev      # Start development server (single command)
npm run build    # Build for production (client + server)
npm start        # Start production server
npm run lint     # Run ESLint
npm run typecheck # Run TypeScript type checking
```

### Tech Stack

**Server:**
- Express.js - Web framework
- TypeScript - Type safety
- Helmet - Security headers
- CORS - Cross-origin support
- Vite middleware - Development server with HMR

**Frontend:**
- React 18 - UI library
- TypeScript - Type safety
- Vite - Build tool
- Tailwind CSS - Styling
- React Router - Routing
- Axios - HTTP client
- Lucide React - Icons

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [cc-switch-cli](https://github.com/SaladDay/cc-switch-cli) - The underlying CLI tool this web UI wraps
- All contributors and users of the project

## 📞 Support

If you encounter any issues or have questions, please [open an issue](https://github.com/yourusername/cc-switch-web-ui/issues) on GitHub.

---

**Note:** This project is a web UI wrapper for [cc-switch-cli](https://github.com/SaladDay/cc-switch-cli). Make sure to install the CLI tool first before using this web interface.
