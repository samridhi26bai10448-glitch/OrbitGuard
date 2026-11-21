
from datetime import datetime, timezone
import time
import threading

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sgp4.api import Satrec, jday


# ======================================
# ORBITGUARD — BACKEND
# ======================================

app = FastAPI(
    title="OrbitGuard API",
    description="Orbital debris monitoring and space sustainability platform.",
    version="2.2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://samridhi26bai10448-glitch.github.io",
        "http://localhost:5500",
        "http://127.0.0.1:5500"
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ======================================
# HTTP SESSION + RETRIES
# ======================================

session = requests.Session()

retry_strategy = Retry(
    total=2,
    connect=2,
    read=2,
    backoff_factor=0.5,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["GET"],
    respect_retry_after_header=True
)

adapter = HTTPAdapter(max_retries=retry_strategy)

session.mount("https://", adapter)
session.mount("http://", adapter)

session.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; OrbitGuard/2.2; orbital research)",
    "Accept": "text/plain, */*"
})


# ======================================
# TLE CACHE
# ======================================

# Cache successful TLE downloads in memory.
# Fresh cache: 5 minutes.
# Maximum stale fallback: 24 hours.

tle_cache = {}
cache_lock = threading.Lock()

CACHE_TTL = 300
MAX_STALE_SECONDS = 86400


def fetch_tle_group(group):

    current_time = time.time()

    with cache_lock:
        cached = tle_cache.get(group)

    # Reuse recently downloaded TLE data.
    if cached:
        age = current_time - cached["timestamp"]

        if age < CACHE_TTL:
            return cached["lines"], "cached"

    url = (
        "https://celestrak.org/NORAD/elements/gp.php"
        f"?GROUP={group}&FORMAT=tle"
    )

    try:
        response = session.get(
            url,
            timeout=(6, 15)
        )

        response.raise_for_status()

        lines = [
            line.strip()
            for line in response.text.splitlines()
            if line.strip()
        ]

        # Reject invalid or empty responses.
        valid_tle = any(
            lines[i + 1].startswith("1 ")
            and lines[i + 2].startswith("2 ")
            for i in range(len(lines) - 2)
        )

        if not valid_tle:
            raise ValueError(
                f"Invalid TLE response for group: {group}"
            )

        with cache_lock:
            tle_cache[group] = {
                "lines": lines,
                "timestamp": time.time()
            }

        return lines, "live"

    except (requests.RequestException, ValueError):

        # Use the last successful download if available.
        if cached:
            age = time.time() - cached["timestamp"]

            if age <= MAX_STALE_SECONDS:
                return cached["lines"], "cached"

        raise


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
# TLE PARSER
# ======================================

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
# COMMON ORBITAL GROUP LOADER
# ======================================

def load_orbital_groups(groups):

    now, jd, fr = get_current_julian_date()

    objects = []
    failed_groups = []
    cached_groups = []
    seen_ids = set()

    for group in groups:

        try:
            lines, source = fetch_tle_group(group)

            if source == "cached":
                cached_groups.append(group)

            group_objects = parse_tle_objects(
                lines,
                jd,
                fr
            )

            for obj in group_objects:

                norad_id = obj["norad_id"]

                if norad_id not in seen_ids:
                    objects.append(obj)
                    seen_ids.add(norad_id)

        except (requests.RequestException, ValueError) as error:

            print(
                f"OrbitGuard: Could not load {group}: {error}"
            )

            failed_groups.append(group)

    if not objects:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Orbital catalogue data is unavailable",
                "failed_groups": failed_groups,
                "hint": (
                    "CelesTrak is unavailable and no usable "
                    "cached catalogue exists yet."
                )
            }
        )

    if cached_groups and failed_groups:
        data_status = "partial_cached"
    elif cached_groups:
        data_status = "cached"
    elif failed_groups:
        data_status = "partial_live"
    else:
        data_status = "live"

    return {
        "now": now,
        "objects": objects,
        "failed_groups": failed_groups,
        "cached_groups": cached_groups,
        "data_status": data_status
    }


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
# LIVE SATELLITE TRACKER
# ======================================

@app.get("/live-satellites")
def get_live_satellites():

    groups = [
        "stations",
        "visual",
        "active"
    ]

    result = load_orbital_groups(groups)

    satellites = result["objects"]

    return {
        "data_source": "CelesTrak",
        "data_type": "Catalogued satellites with SGP4-propagated positions",
        "coordinate_frame": "TEME",
        "calculated_at": result["now"].isoformat(),
        "data_status": result["data_status"],
        "count": len(satellites),
        "failed_groups": result["failed_groups"],
        "cached_groups": result["cached_groups"],
        "satellites": satellites
    }


# ======================================
# LIVE DEBRIS TRACKER
# ======================================

@app.get("/live-debris")
def get_live_debris():

    groups = [
        "cosmos-2251-debris",
        "fengyun-1c-debris",
        "iridium-33-debris"
    ]

    result = load_orbital_groups(groups)

    debris_objects = result["objects"]

    return {
        "data_source": "CelesTrak",
        "data_type": "Catalogued debris with SGP4-propagated positions",
        "coordinate_frame": "TEME",
        "calculated_at": result["now"].isoformat(),
        "data_status": result["data_status"],
        "count": len(debris_objects),
        "failed_groups": result["failed_groups"],
        "cached_groups": result["cached_groups"],
        "debris": debris_objects
    }
