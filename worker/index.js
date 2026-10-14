// Worker: se conecta al coordinator por WebSocket, se registra y envía pulsos.
// Expone su estado por HTTP.
//
// Uso: node worker/index.js [--port 4000] [--coordinator ws://localhost:3000] [--public-url http://localhost:4000]

const express = require("express");
const WebSocket = require("ws");
const crypto = require("node:crypto");
const { parseArgs } = require("node:util");

const { values: args } = parseArgs({
    options: {
        port: { type: "string", default: "4000" },
        coordinator: { type: "string", default: "ws://localhost:3000" },
        "public-url": { type: "string" },
    },
});

const PORT = Number(args.port);
const PUBLIC_URL = args["public-url"] || `http://localhost:${PORT}`;
const PULSE_INTERVAL = 2000;
const RECONNECT_DELAY = 3000;
const id = crypto.randomUUID();

let coordinatorUrl = args.coordinator;
let ws;

// ---------- WebSocket ----------
function connect() {
    console.log(`Conectando a coordinator ${coordinatorUrl}`);
    ws = new WebSocket(coordinatorUrl);

    ws.on("open", () => {
        console.log("Conectado al coordinator");
        send("register", { id, url: PUBLIC_URL });
    });

    ws.on("message", (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type !== "pulse_received") console.log("Coordinator dice:", msg);
    });

    // Si se cae la conexión (o el coordinator aún no arranca), reintenta
    ws.on("close", () => {
        console.log(`Conexión cerrada, reintentando en ${RECONNECT_DELAY / 1000}s`);
        setTimeout(connect, RECONNECT_DELAY);
    });

    ws.on("error", (err) => console.error("Error WS:", err.message || err.code));
}

// Todos los mensajes tienen la forma { type, data }
function send(type, data) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, data }));
}

setInterval(() => send("pulse", { id }), PULSE_INTERVAL);

// ---------- HTTP ----------
const app = express();
app.use(express.json());

app.get("/status", (req, res) => {
    res.json({ id, status: "alive", coordinator: coordinatorUrl, timestamp: Date.now() });
});

app.post("/change-coordinator", (req, res) => {
    const { newCoordinatorUrl } = req.body || {};
    if (!newCoordinatorUrl) return res.status(400).json({ error: "newCoordinatorUrl is required" });

    console.log(`Cambiando coordinator de ${coordinatorUrl} a ${newCoordinatorUrl}`);
    coordinatorUrl = newCoordinatorUrl;
    ws.close(); // el handler de "close" reconecta a la nueva URL

    res.json({ message: "Coordinator cambiado", currentCoordinator: coordinatorUrl });
});

app.listen(PORT, () => {
    console.log(`Worker ${id} en http://localhost:${PORT}`);
    connect();
});
