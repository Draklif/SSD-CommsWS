// Coordinator: recibe workers por WebSocket, expone su estado por HTTP
// y sirve el dashboard en http://localhost:<COORDINATOR_PORT>.
// HTTP y WebSocket comparten el mismo puerto.
//
// Configuración (en orden de prioridad):
//   1. Parámetros:  npm run coordinator -- --port 3001 --role PRIMARY
//                   npm run coordinator 3001          (atajo: solo el puerto)
//   2. Variables de entorno, cargadas desde .env (ver .env.example)
//   3. Valores por defecto

const path = require("node:path");
const { parseArgs } = require("node:util");
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");

const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        port: { type: "string" },
        role: { type: "string" },
    },
});

const PORT = Number(args.port || positionals[0] || process.env.COORDINATOR_PORT || 3000);
const TIMEOUT = Number(process.env.HEARTBEAT_TIMEOUT || 5000);
const ID = Math.floor(Math.random() * 10000);

let role = args.role || process.env.COORDINATOR_ROLE || "PRIMARY";
const servers = {}; // id -> { id, url, lastHeartbeat }
let totalTimeouts = 0;

// ---------- HTTP ----------
const app = express();
app.use(cors()); // el dashboard de cada worker (otro origen) consulta /status desde el navegador
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // dashboard
app.use(express.static(path.join(__dirname, "..", "dashboard"))); // estilos y JS compartidos

app.get("/status", (req, res) => {
    res.json({ id: ID, role, servers: Object.values(servers), totalTimeouts });
});

const server = app.listen(PORT, (err) => {
    if (err) throw err; // p. ej. puerto ocupado
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
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type, data }));
}

// Envía un mensaje a todos los clientes conectados (workers y dashboards).
// Esto es lo que HTTP no puede hacer: el servidor habla sin que le pregunten.
function broadcast(type, data) {
    for (const client of wss.clients) send(client, type, data);
}

const handlers = {
    register(ws, { id, url }) {
        if (role !== "PRIMARY") return send(ws, "error", { message: "server not primary" });
        if (!id || !url) return send(ws, "error", { message: "id and url required" });

        servers[id] = { id, url, lastHeartbeat: Date.now() };
        console.log(`Servidor registrado: ${id} -> ${url}`);
        send(ws, "registered", { id });
        broadcast("server_joined", { id, url });
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
            broadcast("server_left", { id });
        }
    }
}, 2000);
