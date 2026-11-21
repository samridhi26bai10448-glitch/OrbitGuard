
// ======================================
// ORBITGUARD PAGE NAVIGATION
// ======================================

const navLinks = document.querySelectorAll(".sidebar nav a");

const pageSections = [
    document.getElementById("dashboard"),
    document.getElementById("satellite-tracker"),
    document.getElementById("debris-monitor"),
    document.getElementById("close-approaches"),
    document.getElementById("space-sustainability")
].filter(Boolean);


function showSection(sectionId) {

    pageSections.forEach(section => {
        section.style.display =
            section.id === sectionId ? "block" : "none";
    });

    navLinks.forEach(link => {
        link.classList.toggle(
            "active",
            link.getAttribute("href") === "#" + sectionId
        );
    });

    history.replaceState(null, "", "#" + sectionId);

    window.scrollTo(0, 0);

    if (sectionId === "dashboard" && window.orbitGuardViewer) {
        setTimeout(() => {
            window.orbitGuardViewer.resize();
        }, 100);
    }
}


// Navigation listeners
navLinks.forEach(link => {

    link.addEventListener("click", function(event) {

        event.preventDefault();

        const sectionId = this.getAttribute("href").substring(1);

        showSection(sectionId);

    });

});


// Initial section
const initialSection = window.location.hash.substring(1);

const validSection = pageSections.some(
    section => section.id === initialSection
);

showSection(validSection ? initialSection : "dashboard");


// ======================================
// OBJECT SEARCH & TYPE FILTER
// ======================================

const searchInput = document.getElementById("searchObject");
const typeFilter = document.getElementById("objectTypeFilter");


function filterObjects() {

    const searchValue = searchInput
        ? searchInput.value.trim().toLowerCase()
        : "";

    const selectedType = typeFilter
        ? typeFilter.value.toLowerCase()
        : "all";

    const tableRows = document.querySelectorAll(
        "#objectTable tbody tr"
    );

    tableRows.forEach(row => {

        if (row.cells.length < 2) return;

        const rowText = row.textContent.toLowerCase();

        const objectType = row.cells[1].textContent
            .trim()
            .toLowerCase();

        const matchesSearch = rowText.includes(searchValue);

        let matchesType = false;

        if (selectedType === "all") {
            matchesType = true;
        } else if (selectedType === "satellite") {
            matchesType = objectType === "satellite";
        } else if (selectedType === "debris") {
            matchesType =
                objectType === "debris" ||
                objectType === "orbital debris";
        }

        row.style.display =
            matchesSearch && matchesType ? "" : "none";

    });

}


if (searchInput) {
    searchInput.addEventListener("input", filterObjects);
}

if (typeFilter) {
    typeFilter.addEventListener("change", filterObjects);
}


// Reapply filters when API data arrives
document.addEventListener(
    "orbitguard:satellites-loaded",
    filterObjects
);

document.addEventListener(
    "orbitguard:debris-loaded",
    filterObjects
);


// ======================================
// ALERT PRIORITY FILTER
// ======================================

const alertFilter = document.getElementById("alertFilter");

if (alertFilter) {

    const alertItems = document.querySelectorAll(
        ".alerts-section .alert-item"
    );

    alertFilter.addEventListener("change", function() {

        const selectedPriority = this.value;

        alertItems.forEach(item => {

            if (
                selectedPriority === "all" ||
                item.dataset.priority === selectedPriority
            ) {
                item.style.display = "flex";
            } else {
                item.style.display = "none";
            }

        });

    });

}


// ======================================
// LIVE TRACKER STATISTICS
// ======================================

let satellitesLoaded = false;
let debrisLoaded = false;


function updateTrackerStats() {

    const rows = document.querySelectorAll(
        "#objectTable tbody tr"
    );

    let satelliteCount = 0;
    let debrisCount = 0;

    rows.forEach(row => {

        if (row.cells.length < 2) return;

        const type = row.cells[1].textContent
            .trim()
            .toLowerCase();

        if (type === "satellite") {
            satelliteCount++;
        }

        if (
            type === "debris" ||
            type === "orbital debris"
        ) {
            debrisCount++;
        }

    });


    const satelliteElement =
        document.getElementById("trackerSatelliteCount");

    const debrisElement =
        document.getElementById("trackerDebrisCount");

    const totalElement =
        document.getElementById("trackerTotalCount");

    const statusElement =
        document.getElementById("trackerStatus");

    const updatedElement =
        document.getElementById("trackerLastUpdated");


    if (satelliteElement) {
        satelliteElement.textContent =
            satelliteCount.toLocaleString();
    }

    if (debrisElement) {
        debrisElement.textContent =
            debrisCount.toLocaleString();
    }

    if (totalElement) {
        totalElement.textContent =
            (satelliteCount + debrisCount).toLocaleString();
    }


    if (satellitesLoaded && debrisLoaded) {

        if (statusElement) {
            statusElement.textContent = "ONLINE";
        }

        if (updatedElement) {
            updatedElement.textContent =
                "Last updated: " + new Date().toLocaleTimeString();
        }

    } else {

        if (statusElement) {
            statusElement.textContent = "LOADING";
        }

    }

}


// API loading events
document.addEventListener(
    "orbitguard:satellites-loaded",
    () => {
        satellitesLoaded = true;
        updateTrackerStats();
    }
);

document.addEventListener(
    "orbitguard:debris-loaded",
    () => {
        debrisLoaded = true;
        updateTrackerStats();
    }
);


console.log("OrbitGuard navigation and filters ready!");
console.log("OrbitGuard live tracker statistics ready!");
