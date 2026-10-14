// Coordinator: recibe workers por WebSocket y expone su estado por HTTP.
// HTTP y WebSocket comparten el mismo puerto.
//
// Uso: node coordinator/index.js [--port 3000] [--role PRIMARY]

const express = require("express");
const { WebSocketServer } = require("ws");
const { parseArgs } = require("node:util");

const { values: args } = parseArgs({
    options: {
        port: { type: "string", default: "3000" },
        role: { type: "string", default: "PRIMARY" },
    },
});

const PORT = Number(args.port);
const ID = Math.floor(Math.random() * 10000);
const TIMEOUT = 5000;

let role = args.role;
const servers = {}; // id -> { id, url, lastHeartbeat }
let totalTimeouts = 0;

// ---------- HTTP ----------
const app = express();
app.use(express.json());

app.get("/status", (req, res) => {
    res.json({ id: ID, role, servers: Object.values(servers), totalTimeouts });
});

const server = app.listen(PORT, () => {
    console.log(`Coordinator ${ID} (${role}) en http://localhost:${PORT} y ws://localhost:${PORT}`);
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch {
            return send(ws, "error", { message: "invalid json" });
        }

        const handler = handlers[msg.type];
        if (!handler) return send(ws, "error", { message: `unknown type: ${msg.type}` });

        handler(ws, msg.data || {});
    });
});

// Todos los mensajes tienen la forma { type, data }
function send(ws, type, data = {}) {
    ws.send(JSON.stringify({ type, data }));
}

const handlers = {
    register(ws, { id, url }) {
        if (role !== "PRIMARY") return send(ws, "error", { message: "server not primary" });
        if (!id || !url) return send(ws, "error", { message: "id and url required" });

        servers[id] = { id, url, lastHeartbeat: Date.now() };
        console.log(`Servidor registrado: ${id} -> ${url}`);
        send(ws, "registered", { id });
    },

    pulse(ws, { id }) {
        if (role !== "PRIMARY") return send(ws, "error", { message: "server not primary" });
        if (!servers[id]) return send(ws, "error", { message: "server not registered" });

        servers[id].lastHeartbeat = Date.now();
        send(ws, "pulse_received", { id });
    },

    get_servers(ws) {
        send(ws, "servers", { activeServers: Object.values(servers) });
    },

    get_metrics(ws) {
        send(ws, "metrics", { totalServersTracked: Object.keys(servers).length, totalTimeouts });
    },
};

// Elimina workers que dejaron de enviar pulsos
setInterval(() => {
    const now = Date.now();

    for (const id in servers) {
        if (now - servers[id].lastHeartbeat > TIMEOUT) {
            console.log(`Servidor eliminado por timeout: ${id}`);
            delete servers[id];
            totalTimeouts++;
        }
    }
}, 2000);
