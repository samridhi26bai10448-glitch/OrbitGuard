
from datetime import datetime, timezone

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sgp4.api import Satrec, jday


# ======================================
# ORBITGUARD — BACKEND
# ======================================

app = FastAPI(
    title="OrbitGuard API",
    description="Orbital debris monitoring and space sustainability platform.",
    version="2.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ======================================
# ORBITAL POSITION CALCULATIONS
# ======================================

def get_current_julian_date():
    now = datetime.now(timezone.utc)

    jd, fr = jday(
        now.year,
        now.month,
        now.day,
        now.hour,
        now.minute,
        now.second + now.microsecond / 1_000_000
    )

    return now, jd, fr


def calculate_orbital_position(line1, line2, jd, fr):
    satellite = Satrec.twoline2rv(line1, line2)

    error, position, velocity = satellite.sgp4(jd, fr)

    if error != 0:
        return None

    return {
        "position_teme_km": {
            "x": position[0],
            "y": position[1],
            "z": position[2]
        },
        "velocity_teme_km_s": {
            "x": velocity[0],
            "y": velocity[1],
            "z": velocity[2]
        }
    }


# ======================================
# CELESTRAK TLE FETCHER
# ======================================

def fetch_tle_group(group):
    url = (
        "https://celestrak.org/NORAD/elements/gp.php"
        f"?GROUP={group}&FORMAT=tle"
    )

    headers = {
        "User-Agent": "OrbitGuard/2.1 (space sustainability research)",
        "Accept": "text/plain"
    }

    response = requests.get(
        url,
        headers=headers,
        timeout=12
    )

    response.raise_for_status()

    return [
        line.strip()
        for line in response.text.splitlines()
        if line.strip()
    ]


def parse_tle_objects(lines, jd, fr):
    objects = []

    for i in range(len(lines) - 2):
        name = lines[i]

        if not lines[i + 1].startswith("1 "):
            continue

        if not lines[i + 2].startswith("2 "):
            continue

        line1 = lines[i + 1]
        line2 = lines[i + 2]

        try:
            norad_id = int(line1[2:7])

            position_data = calculate_orbital_position(
                line1,
                line2,
                jd,
                fr
            )

            if position_data is None:
                continue

            objects.append({
                "name": name,
                "norad_id": norad_id,
                **position_data
            })

        except (ValueError, IndexError):
            continue

    return objects


# ======================================
# HOME
# ======================================

@app.get("/")
def home():
    return {
        "message": "Welcome to OrbitGuard!",
        "status": "Backend is running"
    }


# ======================================
# DASHBOARD STATISTICS
# ======================================

@app.get("/stats")
def get_stats():
    return {
        "total_objects": 40000,
        "active_satellites": 11000,
        "debris_objects": 1200000,
        "debris_estimate_1mm_to_1cm": 130000000,
        "close_approaches": None,
        "data_type": "Rounded population estimates, not live catalogue counts",
        "source_note": "Approximate reference figures based on published space-debris estimates"
    }


# ======================================
# SATELLITES — ILLUSTRATIVE DATA
# ======================================

@app.get("/satellites")
def get_satellites():
    return {
        "data_type": "Illustrative demonstration data",
        "satellites": [
            {
                "id": 25544,
                "name": "ISS (ZARYA)",
                "type": "Satellite",
                "status": "Active",
                "altitude": 420,
                "velocity": 7.66
            },
            {
                "id": 33591,
                "name": "NOAA-19",
                "type": "Satellite",
                "status": "Active",
                "altitude": 870,
                "velocity": 7.45
            },
            {
                "id": 20580,
                "name": "HUBBLE SPACE TELESCOPE",
                "type": "Satellite",
                "status": "Active",
                "altitude": 540,
                "velocity": 7.59
            }
        ]
    }


# ======================================
# DEBRIS — ILLUSTRATIVE DATA
# ======================================

@app.get("/debris")
def get_debris():
    return {
        "data_type": "Illustrative demonstration data",
        "debris": [
            {
                "id": 1,
                "name": "Cosmos 2251 Fragment",
                "type": "Debris",
                "altitude": 790,
                "risk": "High"
            },
            {
                "id": 2,
                "name": "Fengyun-1C Fragment",
                "type": "Debris",
                "altitude": 850,
                "risk": "High"
            },
            {
                "id": 3,
                "name": "Iridium 33 Fragment",
                "type": "Debris",
                "altitude": 780,
                "risk": "Medium"
            }
        ]
    }


# ======================================
# CLOSE APPROACHES
# ======================================

@app.get("/close-approaches")
def get_close_approaches():
    return {
        "data_source": "OrbitGuard",
        "data_type": "Conjunction assessment not connected",
        "status": "No verified alerts available",
        "count": 0,
        "close_approaches": [],
        "message": (
            "Verified collision-risk assessment requires "
            "validated conjunction data, orbital uncertainty "
            "analysis and probability calculations. "
            "Current orbital tracking positions alone cannot "
            "establish collision risk."
        )
    }


# ======================================
# ALERTS
# ======================================

@app.get("/alerts")
def get_alerts():
    return {
        "data_type": "Demonstration information alerts",
        "alerts": [
            {
                "title": "Orbital Debris Monitoring",
                "message": "Track catalogued debris objects and their orbital positions.",
                "severity": "Information"
            },
            {
                "title": "Collision Risk Monitoring",
                "message": "Conjunction assessment requires validated orbital data and uncertainty analysis.",
                "severity": "Warning"
            },
            {
                "title": "Space Sustainability",
                "message": "Reducing orbital debris is essential for long-term space sustainability.",
                "severity": "Information"
            }
        ]
    }


# ======================================
# LIVE SATELLITE TRACKER — CELESTRAK
# ======================================

@app.get("/live-satellites")
def get_live_satellites():
    now, jd, fr = get_current_julian_date()

    groups = [
        "stations",
        "visual",
        "active"
    ]

    satellites = []
    failed_groups = []
    seen_ids = set()

    for group in groups:
        try:
            lines = fetch_tle_group(group)

            group_objects = parse_tle_objects(
                lines,
                jd,
                fr
            )

            for satellite in group_objects:
                norad_id = satellite["norad_id"]

                if norad_id not in seen_ids:
                    satellites.append(satellite)
                    seen_ids.add(norad_id)

        except requests.RequestException:
            failed_groups.append(group)

    if not satellites:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "CelesTrak satellite data is currently unavailable",
                "failed_groups": failed_groups
            }
        )

    return {
        "data_source": "CelesTrak",
        "data_type": "Catalogued satellites with SGP4-propagated positions",
        "coordinate_frame": "TEME",
        "calculated_at": now.isoformat(),
        "count": len(satellites),
        "failed_groups": failed_groups,
        "satellites": satellites
    }


# ======================================
# LIVE DEBRIS TRACKER — CELESTRAK
# ======================================

@app.get("/live-debris")
def get_live_debris():
    now, jd, fr = get_current_julian_date()

    groups = [
        "cosmos-2251-debris",
        "fengyun-1c-debris",
        "iridium-33-debris"
    ]

    debris_objects = []
    failed_groups = []
    seen_ids = set()

    for group in groups:
        try:
            lines = fetch_tle_group(group)

            group_objects = parse_tle_objects(
                lines,
                jd,
                fr
            )

            for debris in group_objects:
                norad_id = debris["norad_id"]

                if norad_id not in seen_ids:
                    debris_objects.append(debris)
                    seen_ids.add(norad_id)

        except requests.RequestException:
            failed_groups.append(group)

    if not debris_objects:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "CelesTrak debris data is currently unavailable",
                "failed_groups": failed_groups
            }
        )

    return {
        "data_source": "CelesTrak",
        "data_type": "Catalogued debris with SGP4-propagated positions",
        "coordinate_frame": "TEME",
        "calculated_at": now.isoformat(),
        "count": len(debris_objects),
        "failed_groups": failed_groups,
        "debris": debris_objects
    }
