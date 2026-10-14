// Utilidades compartidas por los dashboards del coordinator y del worker

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pretty = (text) => { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } };
const ago = (time) => `hace ${((Date.now() - time) / 1000).toFixed(1)} s`;
const time = (t = Date.now()) => new Date(t).toLocaleTimeString();

async function getJson(url) {
    const res = await fetch(url);
    return res.json();
}

// Tarjeta de un servidor. `actions` es HTML extra (botones o enlaces).
function card(title, url, online, fields, actions = "") {
    const rows = Object.entries(fields).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
    return `<div class="server">
        <strong>${title}</strong> <span class="pill ${online ? "ok" : "bad"}">${online ? "online" : "offline"}</span>
        <div class="muted">${esc(url)}</div><dl>${rows}</dl>
        ${actions && `<div class="row">${actions}</div>`}</div>`;
}

// Agrega un botón por cada entrada { nombre: onclick }
function addButtons(container, entries) {
    for (const [name, onclick] of Object.entries(entries)) {
        const button = document.createElement("button");
        button.textContent = name;
        button.onclick = onclick;
        container.append(button);
    }
}

// ---------- Consola HTTP (ids: http-method, http-url, http-body, http-send, http-response) ----------
function fillHttp(method, url, body) {
    $("http-method").value = method;
    $("http-url").value = url;
    $("http-body").value = body ? JSON.stringify(body, null, 2) : "";
}

// presets: { nombre: () => [method, url, body] }
function setupHttpConsole(presets) {
    const entries = Object.fromEntries(Object.entries(presets).map(([name, get]) => [name, () => fillHttp(...get())]));
    addButtons($("http-presets"), entries);

    $("http-send").onclick = async () => {
        const method = $("http-method").value;
        const options = { method };
        if (method !== "GET") {
            options.headers = { "Content-Type": "application/json" };
            options.body = $("http-body").value;
        }

        try {
            const res = await fetch($("http-url").value, options);
            $("http-response").textContent = `${res.status} ${res.statusText}\n\n${pretty(await res.text())}`;
        } catch (err) {
            $("http-response").textContent = `Error: ${err.message}`;
        }
    };

    Object.values(entries)[0](); // llena el formulario con el primer preset
}
