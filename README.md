# JoinUs

A Zoom-style video meeting web app with custom WebRTC signaling. Create a meeting, share a link, admit guests from a waiting room and talk face to face in your browser.

Built without third-party media SDKs: peer connections use raw WebRTC and signaling runs on a hand-written Socket.io protocol.

**Live app:** [joinus-flame.vercel.app](https://joinus-flame.vercel.app) · **API health:** [joinus-vobk.onrender.com/api/health](https://joinus-vobk.onrender.com/api/health)

> The API runs on a free Render instance that sleeps when idle, so the first request after a pause can take up to a minute.

## Project Name

JoinUs: secure, browser-based video meetings with host-controlled admission.

## Problem Statement

Small teams, classes and study groups need a simple way to meet online without heavyweight platforms. JoinUs provides link-based meetings with host-controlled admission and reliable audio/video, even behind strict NATs.

## Target Users

- **Hosts:** teachers, team leads and organizers who schedule meetings and control who joins.
- **Participants:** anyone joining from a link on a desktop or mobile browser.

## Solution

A Node/Express + Socket.io server owns the business rules and relays signaling messages. A thin React client renders the state. Audio and video flow peer-to-peer (mesh, up to 6 participants) with STUN/TURN for NAT traversal.

The server is API-first and client-agnostic: authentication uses `Authorization: Bearer` tokens and the signaling layer is a plain JSON event protocol, so a mobile app can reuse the same backend.

## Key Features

Available now:

- Register and log in with JWT authentication
- Instant and scheduled meetings with shareable codes (e.g. `abc-defg-hij`)
- Dashboard with upcoming and past meetings, join by code or link, and one-click invite links
- Responsive, touch-friendly UI

Planned:

- Waiting room with host admit/deny controls
- Multi-party audio and video with mute, camera toggle and screen share
- In-meeting chat and meeting history
- Automatic reconnects, device switching and a connection-quality indicator

## Tech Stack

| Layer | Technology |
| --- | --- |
| Client | React 19, Vite, React Router |
| Server | Node.js, Express, Socket.io |
| Database | MongoDB, Mongoose |
| Realtime media | WebRTC (P2P mesh), STUN + TURN |
| Auth and validation | JWT, bcryptjs, zod |
| Security | helmet, CORS allow-list |
| Testing | Jest, Supertest, mongodb-memory-server |
| Hosting | Vercel (client), Render (server), MongoDB Atlas (database) |

## Architecture

```mermaid
flowchart LR
    A[Browser A] -- REST + Socket.io --> S[Express + Socket.io server]
    B[Browser B] -- REST + Socket.io --> S
    S --> DB[(MongoDB)]
    A <-. P2P audio/video .-> B
```

```
joinus/
├── client/              # React + Vite web client
│   └── src/
│       ├── api/         # fetch client that attaches the bearer token
│       ├── components/  # shared UI pieces
│       ├── context/     # AuthContext (session restore, login, logout)
│       ├── lib/         # pure helpers (dates, invite links)
│       └── pages/       # route-level screens
├── server/              # Express + Socket.io backend
│   ├── src/
│   │   ├── config/      # env validation, database connection
│   │   ├── controllers/ # request handlers
│   │   ├── middleware/  # auth, validation, error handling
│   │   ├── models/      # Mongoose models
│   │   ├── routes/      # route definitions
│   │   ├── schemas/     # zod request schemas
│   │   └── utils/       # tokens, meeting codes, errors
│   └── tests/           # Jest + Supertest suites
└── README.md
```

## API Reference

All errors share one shape: `{ "error": { "code": "...", "message": "...", "details": [...] } }`.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | none | Service health |
| POST | `/api/auth/register` | none | Create an account, returns `user` and `token` |
| POST | `/api/auth/login` | none | Log in, returns `user` and `token` |
| GET | `/api/auth/me` | Bearer | Current user |
| POST | `/api/meetings` | Bearer | Create an instant or scheduled meeting |
| GET | `/api/meetings?filter=upcoming\|past\|all` | Bearer | List your meetings |
| GET | `/api/meetings/:code` | none | Minimal public info for an invite page |
| PATCH | `/api/meetings/:code` | Host | Edit title or scheduled time |
| DELETE | `/api/meetings/:code` | Host | Cancel the meeting |

## Local Setup

Requires Node.js 20+ and MongoDB (local or Atlas).

```bash
git clone <your-repo-url> joinus
cd joinus

# Server
cd server
cp .env.example .env     # then fill in the values
npm install
npm run dev              # http://localhost:5000

# Client (new terminal)
cd client
cp .env.example .env
npm install
npm run dev              # http://localhost:5173
```

Generate a strong `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Testing

```bash
cd server
npm test
```

The suites run the real Express app against an in-memory MongoDB, so they never touch your database. The first run downloads a MongoDB binary and takes a little longer.

## Environment Variables

**`server/.env`**

| Variable | Description |
| --- | --- |
| `NODE_ENV` | `development`, `test` or `production` |
| `PORT` | API port (set automatically on Render) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for signing JWTs, at least 32 characters |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d` |
| `CLIENT_ORIGIN` | Allowed CORS origin(s), comma-separated, no paths |

**`client/.env`**

| Variable | Description |
| --- | --- |
| `VITE_API_URL` | Base URL of the API server |

The server validates its environment at startup and exits with a clear message if anything is missing or malformed.

## Deployment

| Component | Platform | URL |
| --- | --- | --- |
| Client | Vercel | https://joinus-flame.vercel.app |
| Server | Render | https://joinus-vobk.onrender.com |
| Database | MongoDB Atlas | private |

1. **MongoDB Atlas:** create an M0 cluster and a database user. Under Network Access allow `0.0.0.0/0` (Render's outbound IPs change). Copy the `mongodb+srv://` connection string and add `/joinus` as the database name.
2. **Render (server):** create a Web Service from this repository with root directory `server`, build command `npm install` and start command `npm start`. Set the health check path to `/api/health`. Add `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET` (a new random value), `JWT_EXPIRES_IN` and `CLIENT_ORIGIN`.
3. **Vercel (client):** import the repository with root directory `client` (Vite preset). Set `VITE_API_URL` to the Render URL. `client/vercel.json` rewrites all routes to `index.html` so invite links like `/m/abc-defg-hij` work on refresh.
4. Set `CLIENT_ORIGIN` on Render to the Vercel URL so CORS allows the client.

Both platforms provide HTTPS, which browsers require for camera and microphone access.