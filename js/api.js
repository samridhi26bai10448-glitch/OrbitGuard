
const API_BASE_URL = "https://orbitguard-api-oud7.onrender.com";

// ======================================
// HELPER: FORMAT ORBITAL DATA
// ======================================

function calculateAltitude(position) {
    if (!position) return null;

    const radius = Math.sqrt(
        position.x ** 2 +
        position.y ** 2 +
        position.z ** 2
    );

    return radius - 6371;
}

function calculateVelocity(velocity) {
    if (!velocity) return null;

    return Math.sqrt(
        velocity.x ** 2 +
        velocity.y ** 2 +
        velocity.z ** 2
    );
}

function formatValue(value, suffix) {
    return Number.isFinite(value)
        ? value.toFixed(2) + suffix
        : "N/A";
}


// ======================================
// DASHBOARD STATISTICS
// ======================================

async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/stats`);

        if (!response.ok) {
            throw new Error("Could not fetch dashboard statistics");
        }

        const data = await response.json();

        document.getElementById("totalObjects").textContent =
            Number(data.total_objects ?? 0).toLocaleString();

        document.getElementById("activeSatellites").textContent =
            Number(data.active_satellites ?? 0).toLocaleString();

        document.getElementById("debrisObjects").textContent =
            Number(data.debris_objects ?? 0).toLocaleString();

        document.getElementById("closeApproaches").textContent =
            data.close_approaches == null
                ? "N/A"
                : Number(data.close_approaches).toLocaleString();

        document.getElementById("statsSource").textContent =
            data.data_type || "Reference estimates";

        console.log("Dashboard connected to OrbitGuard API!");

    } catch (error) {
        console.error("Dashboard API error:", error);

        document.getElementById("statsSource").textContent =
            "Backend connection unavailable";
    }
}


// ======================================
// CREATE TRACKER ROW
// ======================================

function createTrackerRow(object, type) {

    const row = document.createElement("tr");

    const altitude = calculateAltitude(
        object.position_teme_km
    );

    const velocity = calculateVelocity(
        object.velocity_teme_km_s
    );

    const values = [
        object.name || "Unknown Object",
        type,
        formatValue(altitude, " km"),
        formatValue(velocity, " km/s"),
        type === "Satellite" ? "Active" : "Monitoring"
    ];

    values.forEach(value => {

        const cell = document.createElement("td");

        cell.textContent = value;

        row.appendChild(cell);

    });

    return row;
}


// ======================================
// TRACKER LOADING STATE
// ======================================

function showLoadingMessage(tableBody) {

    tableBody.innerHTML = "";

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 5;
    cell.textContent = "Connecting to CelesTrak and loading orbital objects...";

    row.appendChild(cell);
    tableBody.appendChild(row);

}


// ======================================
// REAL SATELLITE DATA
// ======================================

async function loadLiveSatellites(tableBody) {

    try {

        const response = await fetch(
            `${API_BASE_URL}/live-satellites`,
            { cache: "no-store" }
        );

        if (!response.ok) {
            throw new Error("Satellite API request failed");
        }

        const data = await response.json();

        data.satellites.forEach(satellite => {

            tableBody.appendChild(
                createTrackerRow(satellite, "Satellite")
            );

        });

        console.log(
            "Real satellites loaded:",
            data.satellites.length
        );

        document.dispatchEvent(
            new Event("orbitguard:satellites-loaded")
        );

    } catch (error) {

        console.error("Satellite loading error:", error);

    }

}


// ======================================
// REAL ORBITAL DEBRIS DATA
// ======================================

async function loadLiveDebris(tableBody) {

    try {

        const response = await fetch(
            `${API_BASE_URL}/live-debris`,
            { cache: "no-store" }
        );

        if (!response.ok) {
            throw new Error("Debris API request failed");
        }

        const data = await response.json();

        data.debris.forEach(debris => {

            tableBody.appendChild(
                createTrackerRow(debris, "Debris")
            );

        });

        console.log(
            "Real orbital debris loaded:",
            data.debris.length
        );

        document.dispatchEvent(
            new Event("orbitguard:debris-loaded")
        );

    } catch (error) {

        console.error("Debris loading error:", error);

    }

}


// ======================================
// INITIALIZE TRACKER
// ======================================

async function loadObjectTracker() {

    const tableBody = document.querySelector(
        "#objectTable tbody"
    );

    if (!tableBody) {
        console.error("Object tracker table not found!");
        return;
    }

    showLoadingMessage(tableBody);

    // Start both requests independently.
    // Satellite data does not wait for debris data.

    await Promise.all([
        loadLiveSatellites(tableBody),
        loadLiveDebris(tableBody)
    ]);

    if (tableBody.children.length === 0) {

        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 5;
        cell.textContent = "Unable to load orbital objects. Check backend connection.";

        row.appendChild(cell);
        tableBody.appendChild(row);

    }

    console.log("OrbitGuard tracker loading completed!");

}


// ======================================
// LOAD DATA WHEN PAGE OPENS
// ======================================

document.addEventListener("DOMContentLoaded", () => {

    loadDashboardStats();

    loadObjectTracker();

});
