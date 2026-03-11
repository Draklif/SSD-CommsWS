const WebSocket = require("ws");

const PORT = 3000;
const TIMEOUT = 5000;

const wss = new WebSocket.Server({ port: PORT });

let servers = {};
let totalTimeouts = 0;

console.log(`Coordinator WS corriendo en puerto ${PORT}`);

wss.on("connection", (ws) => {

    ws.on("message", (msg) => {

        let data;

        try {
            data = JSON.parse(msg);
        } catch {
            return ws.send(JSON.stringify({ error: "invalid json" }));
        }

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

    });

});

// Registrar el servidor
function handleRegister(ws, data) {
    const { id, url } = data;

    if (!id || !url) {
        return ws.send(JSON.stringify({
            type: "error",
            message: "id and url required"
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

    if (!servers[id]) {
        return ws.send(JSON.stringify({
            type: "error",
            message: "server not registered"
        }));
    }

    servers[id].lastHeartbeat = Date.now();

    ws.send(JSON.stringify({
        type: "pulse_received",
        id
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
        data: activeServers
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

// Timeout
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