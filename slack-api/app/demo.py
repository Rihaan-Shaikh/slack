# Demo Trip Seeding & Open-Meteo Live Weather Integration for Phase 6
import httpx
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from app.database import (
    db_create_trip,
    db_create_booking,
    db_create_dependency,
    db_add_trip_member,
    db_add_activity_log,
    db_get_trip,
    db_list_bookings,
)
from app.models import TripCreate, BookingCreate, DependencyCreate

# Major European Airport coordinates for Open-Meteo queries
AIRPORT_COORDINATES = {
    "ZRH": {"name": "Zurich Airport", "city": "Zurich", "lat": 47.4582, "lon": 8.5555},
    "GVA": {"name": "Geneva Airport", "city": "Geneva", "lat": 46.2381, "lon": 6.1089},
    "LHR": {"name": "London Heathrow", "city": "London", "lat": 51.4700, "lon": -0.4543},
    "CDG": {"name": "Paris Charles de Gaulle", "city": "Paris", "lat": 49.0097, "lon": 2.5479},
    "MXP": {"name": "Milan Malpensa", "city": "Milan", "lat": 45.6301, "lon": 8.7255},
}

# WMO Weather interpretation codes
WMO_WEATHER_CODES = {
    0: ("Clear sky", "normal"),
    1: ("Mainly clear", "normal"),
    2: ("Partly cloudy", "normal"),
    3: ("Overcast", "minor"),
    45: ("Fog", "delay"),
    48: ("Depositing rime fog", "delay"),
    51: ("Light drizzle", "minor"),
    53: ("Moderate drizzle", "delay"),
    55: ("Dense drizzle", "delay"),
    61: ("Slight rain", "minor"),
    63: ("Moderate rain", "delay"),
    65: ("Heavy rain", "severe"),
    71: ("Slight snow", "delay"),
    73: ("Moderate snow", "severe"),
    75: ("Heavy snow", "severe"),
    80: ("Rain showers", "delay"),
    81: ("Moderate rain showers", "delay"),
    82: ("Violent rain showers", "severe"),
    95: ("Thunderstorm", "severe"),
    96: ("Thunderstorm with slight hail", "severe"),
    99: ("Thunderstorm with heavy hail", "severe"),
}


def seed_standard_demo_trip() -> Dict[str, Any]:
    """
    Seed a complete, realistic multi-city Alpine Odyssey trip:
    - 7 bookings
    - 1 deliberately tight connection: LX 354 -> Shuttle (45m gap, 30m buffer -> +15m slack)
    - 1 deliberately overlapping pair: Cable Car Tour & Glacier Hike
    - 5 chained dependencies
    - Auto-registered owner and activity feed entries
    """
    now = datetime.now(timezone.utc)
    base_date = (now + timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)

    trip_in = TripCreate(
        name="Alpine Odyssey (Zurich → Geneva → Chamonix)",
        owner_id=uuid4(),
    )
    trip = db_create_trip(trip_in)
    trip_id = trip.id

    # 1. Booking 1: Flight LX 354 (ZRH -> GVA)
    t1_start = base_date
    t1_end = base_date + timedelta(hours=1, minutes=30)
    b1 = db_create_booking(
        trip_id,
        BookingCreate(
            type="flight",
            title="Swiss Intl Air LX 354 (ZRH → GVA)",
            vendor="Swiss International Air Lines",
            location="Zurich Airport (ZRH)",
            start_time=t1_start,
            end_time=t1_end,
            cost=340.0,
            cancellation_policy="Non-refundable within 24h of departure",
            metadata={"flight_number": "LX354", "terminal": "A", "seat": "12F", "origin": "ZRH", "dest": "GVA"},
        ),
    )

    # 2. Booking 2: Transfer (GVA -> Chamonix)
    # Gap from B1: 45 minutes (10:15 - 09:30). Required buffer: 30 minutes -> Slack = +15 minutes (TIGHT!)
    t2_start = t1_end + timedelta(minutes=45)
    t2_end = t2_start + timedelta(hours=1, minutes=30)
    b2 = db_create_booking(
        trip_id,
        BookingCreate(
            type="transfer",
            title="Chamonix Express Shuttle (GVA → Chamonix)",
            vendor="Chamonix Valley Shuttles",
            location="Geneva Airport Terminal 1",
            start_time=t2_start,
            end_time=t2_end,
            cost=55.0,
            cancellation_policy="Full refund up to 2 hours before departure",
            metadata={"vehicle": "Mercedes Sprinter", "operator": "Chamonix Express", "booking_ref": "CHX-8921"},
        ),
    )

    # 3. Booking 3: Hotel Check-in
    t3_start = t2_end + timedelta(minutes=15)
    t3_end = base_date + timedelta(days=2, hours=2)  # Day 3 at 10:00
    b3 = db_create_booking(
        trip_id,
        BookingCreate(
            type="hotel",
            title="Grand Hotel Mont-Blanc Check-in",
            vendor="Mont-Blanc Luxury Collection",
            location="62 Allée du Majestic, Chamonix",
            start_time=t3_start,
            end_time=t3_end,
            cost=520.0,
            cancellation_policy="Free cancellation until 48 hours prior",
            metadata={"room_type": "Alpine Mountain View Suite", "confirmation": "MB-4401"},
        ),
    )

    # 4. Booking 4: Activity - Cable Car Tour
    t4_start = t2_end + timedelta(hours=2, minutes=15)  # 14:00
    t4_end = t4_start + timedelta(hours=3)               # 17:00
    b4 = db_create_booking(
        trip_id,
        BookingCreate(
            type="activity",
            title="Aiguille du Midi Cable Car Tour",
            vendor="Chamonix Guides Guild",
            location="Aiguille du Midi Base Station",
            start_time=t4_start,
            end_time=t4_end,
            cost=110.0,
            cancellation_policy="Full refund if weather cancels lift operations",
            metadata={"altitude_meters": 3842, "guide": "Marc Dupont"},
        ),
    )

    # 5. Booking 5: Activity - Glacier Hike & Ice Cave (DELIBERATELY OVERLAPPING PAIR)
    # Starts at 15:30 while Cable Car runs until 17:00!
    t5_start = t4_start + timedelta(hours=1, minutes=30)  # 15:30
    t5_end = t5_start + timedelta(hours=3)                # 18:30
    b5 = db_create_booking(
        trip_id,
        BookingCreate(
            type="activity",
            title="Mer de Glace Hike & Ice Cave",
            vendor="Montenvers Glacier Tours",
            location="Montenvers Railway Station",
            start_time=t5_start,
            end_time=t5_end,
            cost=85.0,
            cancellation_policy="Non-refundable within 12h",
            metadata={"equipment_provided": True, "overlap_note": "Alternative mountain excursion option"},
        ),
    )

    # 6. Booking 6: Transfer - Mont-Blanc Express Train (Day 3)
    t6_start = base_date + timedelta(days=2, hours=2, minutes=45)  # Day 3 10:45
    t6_end = t6_start + timedelta(hours=1, minutes=30)              # Day 3 12:15
    b6 = db_create_booking(
        trip_id,
        BookingCreate(
            type="transfer",
            title="Mont-Blanc Express Scenic Train (Chamonix → Martigny)",
            vendor="SNCF / SBB",
            location="Chamonix-Mont-Blanc Station",
            start_time=t6_start,
            end_time=t6_end,
            cost=45.0,
            cancellation_policy="Standard rail exchange policy",
            metadata={"class": "First Class Panoramic", "line": "Saint-Gervais to Martigny"},
        ),
    )

    # 7. Booking 7: Return Flight - British Airways BA 731 (Day 3 GVA -> LHR)
    t7_start = base_date + timedelta(days=2, hours=7)             # Day 3 15:00
    t7_end = t7_start + timedelta(hours=1, minutes=45)            # Day 3 16:45
    b7 = db_create_booking(
        trip_id,
        BookingCreate(
            type="flight",
            title="British Airways BA 731 (GVA → LHR)",
            vendor="British Airways",
            location="Geneva Airport (GVA)",
            start_time=t7_start,
            end_time=t7_end,
            cost=280.0,
            cancellation_policy="Flexible rebooking ticket with airline fee waiver",
            metadata={"flight_number": "BA731", "terminal": "T1", "origin": "GVA", "dest": "LHR"},
        ),
    )

    # Connect dependencies
    # Dep 1: Flight LX 354 -> Shuttle (min buffer 30m, gap 45m -> slack +15m TIGHT)
    d1 = db_create_dependency(
        trip_id,
        DependencyCreate(
            from_booking_id=b1.id,
            to_booking_id=b2.id,
            min_buffer_minutes=30,
            dependency_type="temporal",
        ),
    )

    # Dep 2: Shuttle -> Hotel (min buffer 15m, gap 15m -> slack 0m TIGHT)
    d2 = db_create_dependency(
        trip_id,
        DependencyCreate(
            from_booking_id=b2.id,
            to_booking_id=b3.id,
            min_buffer_minutes=15,
            dependency_type="temporal",
        ),
    )

    # Dep 3: Shuttle -> Cable Car (min buffer 60m, gap 135m -> slack +75m SAFE)
    d3 = db_create_dependency(
        trip_id,
        DependencyCreate(
            from_booking_id=b2.id,
            to_booking_id=b4.id,
            min_buffer_minutes=60,
            dependency_type="temporal",
        ),
    )

    # Dep 4: Hotel -> Train (min buffer 30m, gap 45m -> slack +15m TIGHT)
    d4 = db_create_dependency(
        trip_id,
        DependencyCreate(
            from_booking_id=b3.id,
            to_booking_id=b6.id,
            min_buffer_minutes=30,
            dependency_type="temporal",
        ),
    )

    # Dep 5: Train -> BA 731 (min buffer 120m, gap 165m -> slack +45m SAFE)
    d5 = db_create_dependency(
        trip_id,
        DependencyCreate(
            from_booking_id=b6.id,
            to_booking_id=b7.id,
            min_buffer_minutes=120,
            dependency_type="temporal",
        ),
    )

    # Seed members & activity logs
    db_add_trip_member(trip_id, "aisha@slacktravel.demo", "Aisha (Owner)", role="owner")
    db_add_trip_member(trip_id, "charlie@slacktravel.demo", "Charlie (Editor)", role="editor")
    db_add_trip_member(trip_id, "bob@slacktravel.demo", "Bob (Viewer)", role="viewer")

    db_add_activity_log(
        trip_id,
        "System Demo Engine",
        "system@slacktravel.demo",
        "TRIP_SEEDED",
        "Alpine Odyssey Demo Trip seeded with 7 bookings, 1 tight layover (+15m), and 1 overlapping activity pair",
        {"bookings_count": 7, "tight_connections": 3, "demo_mode": True},
    )

    # Pre-filled sample disruption payload for 1-click execution
    sample_disruption_payload = {
        "booking_id": str(b1.id),
        "booking_title": b1.title,
        "disruption_type": "delay",
        "delay_minutes": 60,
        "description": "Air traffic control flow restriction & thunderstorm holding pattern at Zurich (ZRH)",
        "expected_impact": "Causes LX 354 to land at 10:30, missing the 10:15 Chamonix Shuttle (-45m slack violation)",
    }

    return {
        "trip": trip,
        "bookings": [b1, b2, b3, b4, b5, b6, b7],
        "dependencies": [d1, d2, d3, d4, d5],
        "sample_disruption": sample_disruption_payload,
        "tight_booking_id": str(b2.id),
        "overlapping_pair": [str(b4.id), str(b5.id)],
    }


def seed_stress_test_trip() -> Dict[str, Any]:
    """
    Seed a 16-booking, 5-day Grand European Tour to stress-test D3 affine measure-then-fit layout:
    - 16 bookings across 5 days
    - 14 chained dependencies
    - Multiple parallel tracks & tight transitions
    """
    now = datetime.now(timezone.utc)
    base_date = (now + timedelta(days=2)).replace(hour=7, minute=0, second=0, microsecond=0)

    trip_in = TripCreate(
        name="Grand European Tour (16 Bookings Stress Test)",
        owner_id=uuid4(),
    )
    trip = db_create_trip(trip_in)
    trip_id = trip.id

    bookings_data = [
        # Day 1: London -> Paris
        ("flight", "BA 304: LHR → CDG", "British Airways", "London Heathrow", 0, 0, 1, 15, 210.0),
        ("transfer", "RER B Express: CDG → Gare du Nord", "RATP", "Paris CDG", 0, 2, 0, 45, 15.0),
        ("hotel", "Hotel Le Marais Paris (Check-in)", "Accor", "Paris 4th Arr", 0, 3, 23, 0, 380.0),
        ("activity", "Louvre Museum Private Tour", "Louvre Experiences", "Paris", 0, 4, 3, 0, 95.0),
        ("activity", "Seine Dinner Cruise", "Bateaux Mouches", "Pont de l'Alma", 0, 7, 2, 30, 140.0),
        # Day 2: Paris -> Zurich -> Milan
        ("transfer", "Metro: Marais to Gare de Lyon", "RATP", "Paris", 1, 0, 0, 30, 5.0),
        ("transfer", "TGV Lyria: Paris → Zurich HB", "SNCF / SBB", "Paris Gare de Lyon", 1, 1, 4, 0, 160.0),
        ("transfer", "EuroCity: Zurich HB → Milano Centrale", "SBB / Trenitalia", "Zurich HB", 1, 5, 3, 20, 90.0),
        ("hotel", "Grand Hotel Milan (Check-in)", "Marriott", "Milan", 1, 8, 23, 0, 410.0),
        # Day 3: Milan -> Florence
        ("activity", "Duomo di Milano Rooftop Walk", "Milan Culture", "Piazza del Duomo", 2, 2, 2, 0, 45.0),
        ("transfer", "Frecciarossa 9511: Milan → Florence", "Trenitalia", "Milano Centrale", 2, 5, 1, 45, 75.0),
        ("hotel", "Boutique Hotel Ponte Vecchio", "Tuscany Stays", "Florence", 2, 7, 23, 0, 320.0),
        # Day 4: Florence -> Rome
        ("activity", "Uffizi Gallery Masterpieces Tour", "Florence Walks", "Florence", 3, 2, 2, 30, 80.0),
        ("transfer", "Frecciarossa 9619: Florence → Rome Termini", "Trenitalia", "Firenze SMN", 3, 5, 1, 35, 65.0),
        ("hotel", "Hotel Quirinale Roma", "Rome Hotels", "Rome", 3, 7, 23, 0, 290.0),
        # Day 5: Rome Return Flight
        ("flight", "Air France AF 1205: FCO → CDG → LHR", "Air France", "Rome Fiumicino", 4, 4, 3, 0, 310.0),
    ]

    created_bookings = []
    for b_type, title, vendor, loc, day_off, hr_off, dur_hr, dur_min, cost in bookings_data:
        st = base_date + timedelta(days=day_off, hours=hr_off)
        et = st + timedelta(hours=dur_hr, minutes=dur_min)
        b = db_create_booking(
            trip_id,
            BookingCreate(
                type=b_type,
                title=title,
                vendor=vendor,
                location=loc,
                start_time=st,
                end_time=et,
                cost=cost,
            ),
        )
        created_bookings.append(b)

    # Chain consecutive bookings with dependencies
    created_deps = []
    for i in range(len(created_bookings) - 1):
        from_b = created_bookings[i]
        to_b = created_bookings[i + 1]
        gap_mins = (to_b.start_time - from_b.end_time).total_seconds() / 60.0
        min_buf = 30 if gap_mins > 45 else 15
        dep = db_create_dependency(
            trip_id,
            DependencyCreate(
                from_booking_id=from_b.id,
                to_booking_id=to_b.id,
                min_buffer_minutes=min_buf,
                dependency_type="temporal",
            ),
        )
        created_deps.append(dep)

    db_add_activity_log(
        trip_id,
        "System Stress Tester",
        "system@slacktravel.demo",
        "TRIP_STRESS_SEEDED",
        f"16-Booking Stress Test Trip seeded across 5 calendar days with {len(created_deps)} chained dependencies",
        {"bookings_count": 16, "dependencies_count": len(created_deps)},
    )

    return {
        "trip": trip,
        "bookings_count": len(created_bookings),
        "dependencies_count": len(created_deps),
    }


async def fetch_live_airport_weather(airport_code: str = "ZRH") -> Dict[str, Any]:
    """
    Query Open-Meteo REST API (public, no key required) for real-time airport weather conditions.
    """
    code = airport_code.upper().strip()
    airport_info = AIRPORT_COORDINATES.get(code, AIRPORT_COORDINATES["ZRH"])

    lat = airport_info["lat"]
    lon = airport_info["lon"]
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m"

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                current = data.get("current", {})
                wcode = current.get("weather_code", 0)
                desc, severity = WMO_WEATHER_CODES.get(wcode, ("Overcast", "minor"))
                temp = current.get("temperature_2m", 15.0)
                wind = current.get("wind_speed_10m", 10.0)
                gusts = current.get("wind_gusts_10m", 15.0)
                precip = current.get("precipitation", 0.0)

                # Estimated delay in minutes based on real atmospheric severity
                suggested_delay = (
                    90 if severity == "severe" or gusts > 45 or precip > 10
                    else 45 if severity == "delay" or gusts > 30 or precip > 2
                    else 25 if severity == "minor"
                    else 30  # Baseline demo delay
                )

                return {
                    "airport": code,
                    "airport_name": airport_info["name"],
                    "city": airport_info["city"],
                    "weather_description": desc,
                    "severity": severity,
                    "temperature_c": temp,
                    "wind_speed_kmh": wind,
                    "wind_gusts_kmh": gusts,
                    "precipitation_mm": precip,
                    "suggested_delay_minutes": suggested_delay,
                    "live_source": "Open-Meteo Public API",
                }
    except Exception:
        pass

    return {
        "airport": code,
        "airport_name": airport_info["name"],
        "city": airport_info["city"],
        "weather_description": "Thunderstorm and gusting winds",
        "severity": "severe",
        "temperature_c": 11.4,
        "wind_speed_kmh": 38.5,
        "wind_gusts_kmh": 54.0,
        "precipitation_mm": 12.8,
        "suggested_delay_minutes": 60,
        "live_source": "Deterministic Weather Profile",
    }
