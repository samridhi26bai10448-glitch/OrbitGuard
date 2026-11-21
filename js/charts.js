
// ======================================
// ORBITGUARD — LIVE DEBRIS ANALYTICS
// Uses actual records loaded in the tracker table
// ======================================

let objectChartInstance = null;
let altitudeChartInstance = null;

function getTrackedObjects() {
    const rows = document.querySelectorAll("#objectTable tbody tr");
    const objects = [];

    rows.forEach(row => {
        const cells = row.querySelectorAll("td");

        // Ignore loading and empty-state messages
        if (cells.length < 5) return;

        const name = cells[0].textContent.trim();
        const type = cells[1].textContent.trim().toLowerCase();
        const altitude = parseFloat(cells[2].textContent.replace(/,/g, ""));
        const velocity = parseFloat(cells[3].textContent.replace(/,/g, ""));

        if (!name || !Number.isFinite(altitude)) return;

        objects.push({
            name,
            type,
            altitude,
            velocity
        });
    });

    return objects;
}


// ======================================
// CHART 1 — OBJECT COMPOSITION
// ======================================

function updateObjectChart(objects) {
    const canvas = document.getElementById("objectChart");

    if (!canvas || typeof Chart === "undefined") return;

    const satellites = objects.filter(o =>
        o.type.includes("satellite")
    ).length;

    const debris = objects.filter(o =>
        o.type.includes("debris")
    ).length;

    if (objectChartInstance) {
        objectChartInstance.destroy();
    }

    objectChartInstance = new Chart(canvas, {
        type: "doughnut",

        data: {
            labels: ["Satellites", "Debris"],

            datasets: [{
                data: [satellites, debris],
                backgroundColor: ["#9b8cff", "#ff9b71"],
                borderColor: "#101426",
                borderWidth: 4,
                hoverOffset: 12
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        color: "#d8d2ef",
                        padding: 20
                    }
                },

                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${context.raw} tracked objects`;
                        }
                    }
                }
            },

            cutout: "65%"
        }
    });
}


// ======================================
// CHART 2 — ALTITUDE DISTRIBUTION
// ======================================

function updateAltitudeChart(objects) {
    const canvas = document.getElementById("altitudeChart");

    if (!canvas || typeof Chart === "undefined") return;

    const ranges = [
        { label: "Below 500 km", min: 0, max: 500 },
        { label: "500–1,000 km", min: 500, max: 1000 },
        { label: "1,000–2,000 km", min: 1000, max: 2000 },
        { label: "2,000–10,000 km", min: 2000, max: 10000 },
        { label: "Above 10,000 km", min: 10000, max: Infinity }
    ];

    const counts = ranges.map(range =>
        objects.filter(o =>
            o.altitude >= range.min &&
            o.altitude < range.max
        ).length
    );

    if (altitudeChartInstance) {
        altitudeChartInstance.destroy();
    }

    altitudeChartInstance = new Chart(canvas, {
        type: "bar",

        data: {
            labels: ranges.map(r => r.label),

            datasets: [{
                label: "Tracked objects",
                data: counts,
                backgroundColor: [
                    "#9b8cff",
                    "#a98cff",
                    "#c18cff",
                    "#e08cff",
                    "#ff9b71"
                ],
                borderRadius: 7,
                borderSkipped: false
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: false
                },

                tooltip: {
                    callbacks: {
                        label: context =>
                            `${context.raw} tracked objects`
                    }
                }
            },

            scales: {
                x: {
                    ticks: { color: "#c8c0e4" },
                    grid: { display: false }
                },

                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "#c8c0e4",
                        precision: 0
                    },
                    grid: {
                        color: "rgba(190,180,230,0.10)"
                    }
                }
            }
        }
    });
}


// ======================================
// REFRESH ALL ANALYTICS
// ======================================

function updateOrbitGuardAnalytics() {
    const objects = getTrackedObjects();

    if (objects.length === 0) {
        console.log("Waiting for live tracker records...");
        return;
    }

    updateObjectChart(objects);
    updateAltitudeChart(objects);

    console.log(
        "Live analytics updated:",
        objects.length,
        "tracked objects"
    );
}


// ======================================
// AUTOMATIC UPDATES
// ======================================

document.addEventListener("DOMContentLoaded", () => {
    updateOrbitGuardAnalytics();

    const tableBody = document.querySelector("#objectTable tbody");

    if (tableBody) {
        const observer = new MutationObserver(() => {
            updateOrbitGuardAnalytics();
        });

        observer.observe(tableBody, {
            childList: true,
            subtree: true
        });
    }
});

window.addEventListener("orbitguard:satellites-loaded",
    updateOrbitGuardAnalytics
);

window.addEventListener("orbitguard:debris-loaded",
    updateOrbitGuardAnalytics
);
