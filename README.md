# Installation of PERN JuniorPASS

1. Install PostgreSQL V16.1
2. Install Node.js V16.16.0
3. Install git
4. IDE: Visual Studio Code, Sublime
5. Redis V2.8

# Run your project

1. Clone this repository to your local computer

1. Run this command to set up DB locally:

   ```
   psql -U postgres
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   \i [file where u cloned your project/juniorPASS/server/database.sql]
   ```

1. Open a terminal and run `python3 run_all.py` to get the apps running.

1. OR run these commands to run your FE on localhost:

   ```
   cd client
   npm install --force
   npm run dev
   ```

1. Start Redis

   **Windows**

   5.1 Install WSL (skip if installed):

   ```
   wsl --install
   ```

   5.2 Install Redis on WSL (skip if installed):

   ```
   sudo apt update
   sudo apt install redis-server
   ```

   5.3 Start the Redis server on WSL:

   ```
   wsl
   sudo service redis-server start
   ```

   ***

   **Mac**

   5.1 Install Redis

   ```
   brew install redis
   ```

   5.2 Start the redis server:

   ```
   brew services start redis
   ```

   5.3 Stop the redis server

   ```
   brew services stop redis
   ```

1. Open another terminal to run your BE on localhost:

   ```
   cd server
   npm install
   npx nodemon // for Mac
   nodemon // for Windows
   ```

1. App is up running on http://localhost:5173

1. Ensure that you have obtain the right `.env` files to get the database and other services up running
