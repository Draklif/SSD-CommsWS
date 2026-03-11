const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const WebSocket = require("ws");

const app = express();

const PORT = process.argv[2] || 4000;
const PUBLIC_URL = process.argv[4];
const PULSE_INTERVAL = 2000;
let coordinatorUrl = process.argv[3];

if (!coordinatorUrl || !PUBLIC_URL) {
    console.error("Usage: node index.js <PORT> <COORDINATOR_WS_URL> <PUBLIC_URL>");
    process.exit(1);
}

const id = crypto.randomUUID();

app.use(cors());
app.use(express.json());

let ws;

function connect() {
    console.log(`Conectando a coordinator ${coordinatorUrl}`);

    ws = new WebSocket(coordinatorUrl);

    ws.on("open", () => {
        console.log("Conectado al coordinator");
        register();
        setInterval(sendPulse, PULSE_INTERVAL);
    });

    ws.on("message", (msg) => {
        const data = JSON.parse(msg);
        console.log("Coordinator dice:", data);
    });

    ws.on("close", () => {
        console.log("Conexion cerrada con coordinator");
    });

    ws.on("error", (err) => {
        console.error("Error WS:", err.message);
    });
}

function register() {
    if (ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
        type: "register",
        id,
        url: PUBLIC_URL
    }));

    console.log(`Registrado en ${coordinatorUrl}`);
}

function sendPulse() {
    if (ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
        type: "pulse",
        id
    }));

    console.log(`Pulse enviado a ${coordinatorUrl}`);
}

app.get("/status", (req, res) => {
    res.json({
        id,
        status: "alive",
        coordinator: coordinatorUrl,
        timestamp: Date.now()
    });
});

app.post("/change-coordinator", async (req, res) => {
    const { newCoordinatorUrl } = req.body;

    if (!newCoordinatorUrl) {
        return res.status(400).json({ error: "new coordinator url is required" });
    }

    console.log(`Cambiando coordinator de ${coordinatorUrl} a ${newCoordinatorUrl}`);

    coordinatorUrl = newCoordinatorUrl;

    if (ws) {
        ws.close();
    }

    connect();

    res.json({
        message: "Coordinator cambiado correctamente",
        currentCoordinator: coordinatorUrl
    });
});

app.listen(PORT, () => {
    console.log(`Worker ${id} corriendo en puerto ${PORT}`);
    connect();
});