const WebSocket = require("ws");
const fs = require("fs");
const http = require("http");

const PORT = process.argv[2] || 3000;
const TIMEOUT = 5000;
const ID_PATH = "./id";
const ID = getOrCreateId();

const wss = new WebSocket.Server({ port: PORT });

let role = "UNKNOWN";
let servers = {};
let totalTimeouts = 0;

console.log(`Coordinator WS corriendo en puerto ${PORT} con ID ${ID}. HTTP en puerto ${Number(PORT)+1000}`);

// Manejo de mensajes
wss.on("connection", (ws) => {

    ws.on("message", (msg) => {

        let data;

        try {
            data = JSON.parse(msg);
        } catch {
            return ws.send(JSON.stringify({ error: "invalid json" }));
        }

        handleWorkerMessages(data.type);
    });

});

// Helpers
function isPrimary() {
    return role === "PRIMARY";
}

function getOrCreateId() {
    if (!fs.existsSync(ID_PATH)) {
        const id = Math.floor(Math.random() * 10000);
        fs.writeFileSync(ID_PATH, String(id));
        return id;
    }

    return Number(fs.readFileSync(ID_PATH, "utf-8").trim());
}

// Handlers
// Mensajes de workers
function handeWorkerMessages(type) {
    switch (data.type) {
        case "register":
            handleRegister(ws, data);
            break;

        case "pulse":
            handlePulse(ws, data);
            break;

        case "get_servers":
            handleGetServers(ws);
            break;

        case "get_metrics":
            handleGetMetrics(ws);
            break;
    }
}

// Registrar
function handleRegister(ws, data) {
    const { id, url } = data;

    if (!isPrimary()) {
        return ws.send(JSON.stringify({
            type: "error",
            data: { message: "server not primary" }
        }));
    }

    if (!id || !url) {
        return ws.send(JSON.stringify({
            type: "error",
            data: { message: "id and url required" }
        }));
    }

    servers[id] = {
        id,
        url,
        lastHeartbeat: Date.now()
    };

    console.log(`Servidor registrado: ${id} -> ${url}`);

    ws.send(JSON.stringify({
        type: "registered",
        id
    }));
}

// Recibir pulso
function handlePulse(ws, data) {
    const { id } = data;

    if (!isPrimary()) {
        return ws.send(JSON.stringify({
            type: "error",
            data: { message: "server not primary" }
        }));
    }

    if (!servers[id]) {
        return ws.send(JSON.stringify({
            type: "error",
            data: { message: "server not registered" }
        }));
    }

    servers[id].lastHeartbeat = Date.now();

    ws.send(JSON.stringify({
        type: "pulse_received",
        data: { id } 
    }));
}

// Lista de servidores
function handleGetServers(ws) {
    const now = Date.now();

    const activeServers = Object.values(servers).filter(
        server => now - server.lastHeartbeat <= TIMEOUT
    );

    ws.send(JSON.stringify({
        type: "servers",
        data: { activeServers }
    }));
}

// Métricas
function handleGetMetrics(ws) {
    ws.send(JSON.stringify({
        type: "metrics",
        data: {
            totalServersTracked: Object.keys(servers).length,
            totalTimeouts
        }
    }));
}

// Timeout de workers
setInterval(() => {
    const now = Date.now();

    for (let id in servers) {
        if (now - servers[id].lastHeartbeat > TIMEOUT) {
            console.log(`Servidor eliminado por timeout: ${id}`);
            delete servers[id];
            totalTimeouts++;
        }
    }
}, 2000);

// Server HTTP para peticiones internas
const server = http.createServer((req, res) => {
    // POST: /add-peer
    if (req.method === "POST" && req.url === "/add-peer") {
        return;
    }

    res.writeHead(404);
    res.end();
});

server.listen(String(Number(PORT)+1000));

// DEBUG
const DEBUG_INTERVAL = 5000;

function debugState() {
    console.log({
        ID,
        role
    });
}

setInterval(debugState, DEBUG_INTERVAL);