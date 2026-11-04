<img width="1440" height="900" alt="屏幕截图 2026-11-05 005005" src="https://github.com/user-attachments/assets/3820c613-ad47-474c-b03a-549f24df20a9" />


💎 PrismDesk (Local FS Sync Edition)
A high-performance, purely local media asset management desktop application meticulously crafted for designers and creators. Built with Electron + React + Vite, it completely ditches bloated cloud synchronization and complex databases, syncing directly with your local disk sectors.

🌟 Core Features
📂 Pure Local File Synchronization (Local FS Sync)

Strictly synchronizes with local disk sectors using Node.js fs modules, completely avoiding IndexedDB so you retain total ownership of your files.

Fully supports sidebar dynamic tree-view stacking, free subfolder switching, and fs.watch automatic hot-reloading disk sync.

🚀 700MB+ Large Video Streaming & Zero-Memory Uploads

Engineered with a master-process asynchronous streaming copy queue supporting multi-task concurrency control. Import dozens of 400MB–700MB+ high-bitrate 4K videos smoothly without stuttering or crashes.

🍃 Extreme Performance: Smart Canvas Video Thumbnail Lazy Loading

Features an innovative Hover-to-Mount / Canvas Thumbnail architecture: lists render lightweight static thumbnails by default, locking memory usage stably around 300MB. Video player mounts dynamically only on hover and unmounts immediately upon mouse leave.

🗑️ OS-Level Safe Trash Deletion

Seamlessly hooks into native operating system mechanisms; all deletion requests safely route files into the Windows Recycle Bin via shell.trashItem, eliminating accidental data loss and fixing file-lock application flickering bugs.

🔒 Password-Protected Security Lock System

Includes a secure privacy lock screen providing robust password protection (default initial password 123456), safeguarding your local design assets.

🔍 Instant Global Search & Multi-View Layouts

Supports global cross-directory fuzzy search via top search bars alongside free layout switches between Compact, Standard, and Large view modes.

🛠️ Tech Stack
Desktop Framework: Electron

Frontend UI: React, Vite, Tailwind CSS / Modern CSS

Core Modules: Node.js fs, path, shell, chokidar (Local Watcher)

📦 Getting Started & Building
To run or build this project locally, follow these steps:

1. Clone the Repository
Bash
git clone https://github.com/dawdwadawdawdaw/PrismDesk-.git
cd PrismDesk-
2. Install Dependencies
Bash
npm install
3. Run Development Mode
Bash
npm run dev
4. Build Production Executable (.exe)
Bash
npm run build:exe
📄 License
This project is open-source under the MIT License.
