# Local development: MongoDB + SSE

This project uses MongoDB for persistent responses and Server-Sent Events (SSE) for real-time updates.

If you don't have a remote MongoDB instance available, you can run a local MongoDB in Docker and start the server.

Quick steps:

1) Start a local MongoDB container (requires Docker):

```bash
cd server
npm run start:local-mongo
```

2) Build and start the TypeScript server (it will connect to `mongodb://localhost:27017` by default if `MONGODB_URI` is not set):

```bash
npm run build
npm run start
```

3) Start the frontend (in project root):

```bash
npm run dev
# Vite will start (likely at http://localhost:3001)
```

4) Test by sending a POST to `POST http://localhost:4000/api/responses` (the TS server requires JWT for this endpoint in production by default). For quick dev you can generate a dev token signed with `dev_secret` or temporarily add a dev-only route.

Notes:
- If Docker is unavailable in your environment, run a MongoDB instance you control and set `MONGODB_URI` and `MONGODB_DB` in the environment before starting the server.
- The server will fall back to a lightweight in-memory store only if it cannot connect to Mongo and cannot start an embedded Mongo. The in-memory store is not persisted and is only suitable for demos.
