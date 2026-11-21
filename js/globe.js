
// ======================================
// ORBITGUARD — SPACE TRACKING GLOBE
// ======================================

const viewer = new Cesium.Viewer("cesiumContainer", {
    baseLayer: false,
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: true,
    sceneModePicker: false,
    navigationHelpButton: true,
    fullscreenButton: true,
    infoBox: false,
    selectionIndicator: false
});

window.orbitGuardViewer = viewer;


// ======================================
// PERFORMANCE SETTINGS
// ======================================

const MAX_VISIBLE_SATELLITES = 500;
const REFRESH_INTERVAL = 300000;


// ======================================
// REALISTIC EARTH IMAGERY
// ======================================

const imagery = new Cesium.UrlTemplateImageryProvider({
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    credit: "Esri World Imagery"
});

const imageryLayer =
    viewer.imageryLayers.addImageryProvider(imagery);

imageryLayer.brightness = 1.05;
imageryLayer.contrast = 1.08;
imageryLayer.saturation = 1.05;
imageryLayer.gamma = 1.05;


// ======================================
// EARTH AND SPACE APPEARANCE
// ======================================

viewer.scene.backgroundColor = Cesium.Color.BLACK;

viewer.scene.globe.enableLighting = true;
viewer.scene.globe.show = true;
viewer.scene.globe.showGroundAtmosphere = true;

viewer.scene.skyAtmosphere.show = true;


// ======================================
// CAMERA CONTROLS
// ======================================

const controls = viewer.scene.screenSpaceCameraController;

controls.enableInputs = true;
controls.enableRotate = true;
controls.enableZoom = true;
controls.enableTilt = true;
controls.enableLook = true;


// ======================================
// INITIAL CAMERA POSITION
// ======================================

viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
        78.9629,
        20.5937,
        18000000
    ),
    orientation: {
        heading: 0,
        pitch: -Cesium.Math.PI_OVER_TWO,
        roll: 0
    }
});

console.log("OrbitGuard Earth ready!");


// ======================================
// API ENDPOINTS
// ======================================

const SATELLITE_API =
    "http://127.0.0.1:8000/live-satellites";

const DEBRIS_API =
    "http://127.0.0.1:8000/live-debris";

const liveSatelliteEntities = new Map();
const liveDebrisEntities = new Map();


// ======================================
// TEME TO EARTH-FIXED CONVERSION
// ======================================

function convertTemePosition(position, calculatedAt) {

    const date = new Date(calculatedAt);

    const julianDate = Cesium.JulianDate.fromDate(date);

    const transformation =
        Cesium.Transforms.computeTemeToPseudoFixedMatrix(
            julianDate
        );

    const temePosition = new Cesium.Cartesian3(
        position.x * 1000,
        position.y * 1000,
        position.z * 1000
    );

    return Cesium.Matrix3.multiplyByVector(
        transformation,
        temePosition,
        new Cesium.Cartesian3()
    );
}


// ======================================
// OBJECT PROPERTIES
// ======================================

function createObjectProperties(
    objectType,
    noradId,
    altitudeKm,
    latitude,
    longitude,
    dataSource
) {

    return new Cesium.PropertyBag({
        objectType,
        noradId,
        altitudeKm,
        latitude,
        longitude,
        dataSource
    });
}


// ======================================
// SATELLITE TRACKING
// ======================================

async function loadLiveSatellites() {

    try {

        const response = await fetch(SATELLITE_API, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("Satellite API request failed");
        }

        const data = await response.json();

        const satellites =
            data.satellites.slice(0, MAX_VISIBLE_SATELLITES);

        satellites.forEach(satellite => {

            const fixedPosition = convertTemePosition(
                satellite.position_teme_km,
                data.calculated_at
            );

            const cartographic =
                Cesium.Cartographic.fromCartesian(fixedPosition);

            const latitude =
                Cesium.Math.toDegrees(cartographic.latitude);

            const longitude =
                Cesium.Math.toDegrees(cartographic.longitude);

            const altitudeKm =
                cartographic.height / 1000;

            const id = String(satellite.norad_id);

            const properties = createObjectProperties(
                "Satellite",
                satellite.norad_id,
                altitudeKm,
                latitude,
                longitude,
                "CelesTrak"
            );

            let entity = liveSatelliteEntities.get(id);

            if (!entity) {

                entity = viewer.entities.add({

                    id: "satellite-" + id,

                    name: satellite.name,

                    position: fixedPosition,

                    point: {
                        pixelSize: 8,
                        color: Cesium.Color.fromCssColorString("#36E5FF"),
                        outlineColor: Cesium.Color.WHITE,
                        outlineWidth: 1,
                        disableDepthTestDistance: 0
                    },

                    label: {
                        text: satellite.name,
                        font: "11px sans-serif",
                        fillColor: Cesium.Color.WHITE,
                        show: false,
                        showBackground: true,
                        backgroundColor: Cesium.Color.BLACK.withAlpha(0.7),
                        pixelOffset: new Cesium.Cartesian2(0, -16),
                        distanceDisplayCondition:
                            new Cesium.DistanceDisplayCondition(
                                0,
                                9000000
                            )
                    },

                    properties

                });

                liveSatelliteEntities.set(id, entity);

            } else {

                entity.position = fixedPosition;
                entity.name = satellite.name;
                entity.properties = properties;

            }

        });

        console.log(
            "Live satellites loaded:",
            satellites.length,
            "of",
            data.count
        );

    } catch (error) {

        console.error("Satellite loading error:", error);

    }

}


// ======================================
// DEBRIS TRACKING
// ======================================

async function loadLiveDebris() {

    try {

        console.log("Fetching orbital debris...");

        const response = await fetch(DEBRIS_API, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("Debris API request failed: " + response.status);
        }

        const data = await response.json();

        data.debris.forEach(debris => {

            const fixedPosition = convertTemePosition(
                debris.position_teme_km,
                data.calculated_at
            );

            const cartographic =
                Cesium.Cartographic.fromCartesian(fixedPosition);

            const latitude =
                Cesium.Math.toDegrees(cartographic.latitude);

            const longitude =
                Cesium.Math.toDegrees(cartographic.longitude);

            const altitudeKm =
                cartographic.height / 1000;

            const id = String(debris.norad_id);

            const properties = createObjectProperties(
                "Orbital Debris",
                debris.norad_id,
                altitudeKm,
                latitude,
                longitude,
                "CelesTrak"
            );

            let entity = liveDebrisEntities.get(id);

            if (!entity) {

                entity = viewer.entities.add({

                    id: "debris-" + id,

                    name: debris.name,

                    position: fixedPosition,

                    point: {
                        pixelSize: 2,
                        color: Cesium.Color.fromCssColorString("#FFAD55")
                            .withAlpha(0.65),
                        outlineColor: Cesium.Color.TRANSPARENT,
                        outlineWidth: 0,
                        disableDepthTestDistance: 0
                    },

                    properties

                });

                liveDebrisEntities.set(id, entity);

            } else {

                entity.position = fixedPosition;
                entity.name = debris.name;
                entity.properties = properties;

            }

        });

        console.log("Live debris loaded:", data.count);
        console.log("Debris source:", data.data_source);

    } catch (error) {

        console.error("Debris loading error:", error);

    }

}


// ======================================
// LOAD ALL ORBITAL OBJECTS
// ======================================

async function loadAllOrbitalObjects() {

    console.log("Loading orbital objects...");

    await Promise.all([
        loadLiveSatellites(),
        loadLiveDebris()
    ]);

    console.log(
        "OrbitGuard tracking complete!",
        "Satellites:", liveSatelliteEntities.size,
        "Debris:", liveDebrisEntities.size
    );

}

loadAllOrbitalObjects();

setInterval(loadAllOrbitalObjects, REFRESH_INTERVAL);


// ======================================
// OBJECT SELECTION
// ======================================

const handler = new Cesium.ScreenSpaceEventHandler(
    viewer.scene.canvas
);

handler.setInputAction(function(click) {

    const pickedObject = viewer.scene.pick(click.position);

    if (
        Cesium.defined(pickedObject) &&
        Cesium.defined(pickedObject.id) &&
        pickedObject.id.properties
    ) {

        const entity = pickedObject.id;
        const properties = entity.properties;

        const currentTime = Cesium.JulianDate.now();

        function getProperty(name) {

            const property = properties[name];

            return property
                ? property.getValue(currentTime)
                : null;

        }

        const altitude = getProperty("altitudeKm");
        const latitude = getProperty("latitude");
        const longitude = getProperty("longitude");

        document.getElementById("detailName").textContent =
            entity.name || "Unknown Object";

        document.getElementById("detailType").textContent =
            getProperty("objectType") || "Unknown";

        document.getElementById("detailAltitude").textContent =
            altitude !== null ? altitude.toFixed(2) + " km" : "Unavailable";

        document.getElementById("detailLatitude").textContent =
            latitude !== null ? latitude.toFixed(3) + "°" : "Unavailable";

        document.getElementById("detailLongitude").textContent =
            longitude !== null ? longitude.toFixed(3) + "°" : "Unavailable";

        console.log("Selected object:", entity.name);

    }

}, Cesium.ScreenSpaceEventType.LEFT_CLICK);


console.log("OrbitGuard tracking system initialized!");
