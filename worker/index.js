// Worker: se conecta al coordinator por WebSocket, se registra y envía pulsos.
// Expone su estado por HTTP y sirve su dashboard en http://localhost:<WORKER_PORT>.
//
// Configuración (en orden de prioridad):
//   1. Parámetros:  npm run worker -- --port 4001 --coordinator ws://localhost:3001 --public-url http://localhost:4001
//                   npm run worker 4001 ws://localhost:3001     (atajo: puerto y coordinator)
//   2. Variables de entorno, cargadas desde .env (ver .env.example)
//   3. Valores por defecto

const path = require("node:path");
const { parseArgs } = require("node:util");
const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");
const crypto = require("node:crypto");

const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        port: { type: "string" },
        coordinator: { type: "string" },
        "public-url": { type: "string" },
    },
});

const PORT = Number(args.port || positionals[0] || process.env.WORKER_PORT || 4000);
const PUBLIC_URL = args["public-url"] || process.env.WORKER_PUBLIC_URL || `http://localhost:${PORT}`;
const PULSE_INTERVAL = Number(process.env.PULSE_INTERVAL || 2000);
const RECONNECT_DELAY = Number(process.env.RECONNECT_DELAY || 3000);
const id = crypto.randomUUID();

let coordinatorUrl = args.coordinator || positionals[1] || process.env.COORDINATOR_URL || "ws://localhost:3000";
let ws;

// Últimos mensajes con el coordinator, para mostrarlos en el dashboard
const messages = [];

function record(arrow, text) {
    messages.push({ time: Date.now(), arrow, text });
    if (messages.length > 200) messages.shift();
}

// ---------- WebSocket ----------
function connect() {
    console.log(`Conectando a coordinator ${coordinatorUrl}`);
    ws = new WebSocket(coordinatorUrl);

    ws.on("open", () => {
        console.log("Conectado al coordinator");
        record("•", `conectado a ${coordinatorUrl}`);
        send("register", { id, url: PUBLIC_URL });
    });

    ws.on("message", (raw) => {
        record("↓", raw.toString());
        const msg = JSON.parse(raw);
        if (msg.type !== "pulse_received") console.log("Coordinator dice:", msg);
    });

    // Si se cae la conexión (o el coordinator aún no arranca), reintenta
    ws.on("close", () => {
        console.log(`Conexión cerrada, reintentando en ${RECONNECT_DELAY / 1000}s`);
        record("•", "conexión cerrada");
        setTimeout(connect, RECONNECT_DELAY);
    });

    ws.on("error", (err) => console.error("Error WS:", err.message || err.code));
}

// Todos los mensajes tienen la forma { type, data }
function send(type, data) {
    if (ws.readyState !== WebSocket.OPEN) return;
    const text = JSON.stringify({ type, data });
    ws.send(text);
    record("↑", text);
}

setInterval(() => send("pulse", { id }), PULSE_INTERVAL);

// ---------- HTTP ----------
const app = express();
app.use(cors()); // el dashboard del coordinator (otro origen) llama a este worker desde el navegador
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // dashboard
app.use(express.static(path.join(__dirname, "..", "dashboard"))); // estilos y JS compartidos

app.get("/status", (req, res) => {
    res.json({
        id,
        url: PUBLIC_URL,
        status: "alive",
        connected: ws.readyState === WebSocket.OPEN,
        coordinator: coordinatorUrl,
        timestamp: Date.now(),
    });
});

app.get("/messages", (req, res) => {
    res.json(messages);
});

// Envía un mensaje al coordinator por el WebSocket de este worker
app.post("/send", (req, res) => {
    const { type, data } = req.body || {};
    if (!type) return res.status(400).json({ error: "type is required" });
    if (ws.readyState !== WebSocket.OPEN) return res.status(409).json({ error: "not connected to coordinator" });

    send(type, data);
    res.json({ sent: { type, data } });
});

app.post("/change-coordinator", (req, res) => {
    const { newCoordinatorUrl } = req.body || {};
    if (!newCoordinatorUrl) return res.status(400).json({ error: "newCoordinatorUrl is required" });

    console.log(`Cambiando coordinator de ${coordinatorUrl} a ${newCoordinatorUrl}`);
    coordinatorUrl = newCoordinatorUrl;
    ws.close(); // el handler de "close" reconecta a la nueva URL

    res.json({ message: "Coordinator cambiado", currentCoordinator: coordinatorUrl });
});

app.listen(PORT, (err) => {
    if (err) throw err; // p. ej. puerto ocupado: no registrarse con una URL que no es nuestra
    console.log(`Worker ${id} en http://localhost:${PORT}`);
    connect();
});
