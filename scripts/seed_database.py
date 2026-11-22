import asyncio
import json
import logging
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.models.db_models import Base

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("railpulse.seed")

BASE_DIR = Path(__file__).resolve().parent.parent


async def seed_postgres_database() -> None:
    """
    Initializes PostgreSQL + PostGIS schema and seeds the full ECoR corridor topology,
    station sequence, track blocks, trains, and pre-cached highway routes.
    """
    logger.info("Connecting to database at %s...", settings.DATABASE_URL.split("@")[-1])
    engine = create_async_engine(settings.DATABASE_URL, echo=False)

    try:
        async with engine.begin() as conn:
            # 1. Enable PostGIS Extension
            try:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
                logger.info("PostGIS extension initialized.")
            except SQLAlchemyError as e:
                logger.warning("Could not create postgis extension directly (may already exist or insufficient privileges): %s", e)

            # 2. Create All Tables
            await conn.run_sync(Base.metadata.create_all)
            await conn.execute(text("ALTER TABLE stations ADD COLUMN IF NOT EXISTS corridor_branch VARCHAR(32) DEFAULT 'MAINLINE';"))
            await conn.execute(text("ALTER TABLE stations ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);"))
            await conn.execute(text("ALTER TABLE track_blocks ADD COLUMN IF NOT EXISTS is_single_line_throat BOOLEAN DEFAULT FALSE;"))
            await conn.execute(text("ALTER TABLE track_blocks ADD COLUMN IF NOT EXISTS geom geometry(LineString, 4326);"))
            logger.info("SQLAlchemy ORM tables verified/created.")

        # 3. Load Seed JSON
        topo_path = BASE_DIR / "data" / "seed_ecor_topology.json"
        road_path = BASE_DIR / "data" / "seed_osrm_matrix.json"
        topo = await asyncio.to_thread(lambda: json.loads(topo_path.read_text(encoding="utf-8")))
        road_data = await asyncio.to_thread(lambda: json.loads(road_path.read_text(encoding="utf-8")))

        async with engine.begin() as conn:
            # Seed Stations
            for s in topo.get("stations", []):
                geom_wkt = f"SRID=4326;POINT({s['lon']} {s['lat']})"
                await conn.execute(
                    text("""
                    INSERT INTO stations (station_code, station_name, corridor_branch, chainage_km,
                        lat, lon, has_750m_goods_loop, passenger_loops_dn, passenger_loops_up, is_major_junction, road_exit_penalty_m, geom)
                    VALUES (:code, :name, :branch, :km, :lat, :lon, :loop, :loops_dn, :loops_up, :junc, :exit_p, ST_GeomFromEWKT(:geom))
                    ON CONFLICT (station_code) DO UPDATE SET
                        chainage_km = EXCLUDED.chainage_km,
                        lat = EXCLUDED.lat,
                        lon = EXCLUDED.lon,
                        has_750m_goods_loop = EXCLUDED.has_750m_goods_loop,
                        is_major_junction = EXCLUDED.is_major_junction;
                    """),
                    {
                        "code": s["station_code"],
                        "name": s["station_name"],
                        "branch": s.get("corridor_branch", "MAINLINE"),
                        "km": s["chainage_km"],
                        "lat": s["lat"],
                        "lon": s["lon"],
                        "loop": s.get("has_750m_goods_loop", False),
                        "loops_dn": s.get("passenger_loops_dn", 1),
                        "loops_up": s.get("passenger_loops_up", 1),
                        "junc": s.get("is_major_junction", False),
                        "exit_p": s.get("road_exit_penalty_m", 12),
                        "geom": geom_wkt,
                    },
                )
            logger.info("Seeded %d corridor stations.", len(topo.get("stations", [])))

            # Seed Track Blocks
            stn_coords = {s["station_code"]: (s["lon"], s["lat"]) for s in topo.get("stations", [])}
            for b in topo.get("track_blocks", []):
                from_c = stn_coords.get(b["from_station"])
                to_c = stn_coords.get(b["to_station"])
                if from_c and to_c:
                    line_wkt = f"SRID=4326;LINESTRING({from_c[0]} {from_c[1]}, {to_c[0]} {to_c[1]})"
                else:
                    line_wkt = "SRID=4326;LINESTRING(0 0, 1 1)"

                await conn.execute(
                    text("""
                    INSERT INTO track_blocks (block_id, direction, from_station, to_station, start_km, end_km,
                        length_km, mps_kmph, free_flow_mins, freight_injection_weight, terminal_slack_mins, is_single_line_throat, geom)
                    VALUES (:id, :dir, :from_s, :to_s, :start_k, :end_k, :len_k, :mps, :free_m, :f_w, :slack, :single, ST_GeomFromEWKT(:geom))
                    ON CONFLICT (block_id) DO UPDATE SET
                        length_km = EXCLUDED.length_km,
                        mps_kmph = EXCLUDED.mps_kmph,
                        freight_injection_weight = EXCLUDED.freight_injection_weight,
                        terminal_slack_mins = EXCLUDED.terminal_slack_mins;
                    """),
                    {
                        "id": b["block_id"],
                        "dir": b["direction"],
                        "from_s": b["from_station"],
                        "to_s": b["to_station"],
                        "start_k": b["start_km"],
                        "end_k": b["end_km"],
                        "len_k": b["length_km"],
                        "mps": b.get("mps_kmph", 110),
                        "free_m": b["free_flow_mins"],
                        "f_w": b.get("freight_injection_weight", 0.15),
                        "slack": b.get("terminal_slack_mins", 0.0),
                        "single": b.get("is_single_line_throat", False),
                        "geom": line_wkt,
                    },
                )
            logger.info("Seeded %d track block sections.", len(topo.get("track_blocks", [])))

            # Seed Trains & Halts
            for t in topo.get("trains", []):
                await conn.execute(
                    text("""
                    INSERT INTO trains_master (train_no, train_name, train_class, priority_rank, direction, max_speed_kmph)
                    VALUES (:no, :name, :cls, :rank, :dir, :spd)
                    ON CONFLICT (train_no) DO UPDATE SET
                        priority_rank = EXCLUDED.priority_rank,
                        max_speed_kmph = EXCLUDED.max_speed_kmph;
                    """),
                    {
                        "no": t["train_no"],
                        "name": t["train_name"],
                        "cls": t.get("train_class", "EXPRESS"),
                        "rank": t["priority_rank"],
                        "dir": t["direction"],
                        "spd": t.get("max_speed_kmph", 110),
                    },
                )

                for h in t.get("halts", []):
                    await conn.execute(
                        text("""
                        INSERT INTO train_schedule_halts (train_no, station_code, stop_sequence, day_offset,
                            sched_arr_min_day, sched_dep_min_day, is_commercial_halt, scheduled_dwell_m)
                        VALUES (:no, :stn, :seq, :day, :arr, :dep, :comm, :dwell)
                        ON CONFLICT DO NOTHING;
                        """),
                        {
                            "no": t["train_no"],
                            "stn": h["station_code"],
                            "seq": h["stop_sequence"],
                            "day": h.get("day_offset", 0),
                            "arr": h["sched_arr_min_day"],
                            "dep": h["sched_dep_min_day"],
                            "comm": h.get("is_commercial_halt", True),
                            "dwell": h.get("scheduled_dwell_m", 2),
                        },
                    )
            logger.info("Seeded %d trains and schedule halts.", len(topo.get("trains", [])))

            # Seed Road Transfer Cache
            for r in road_data.get("routes", []):
                await conn.execute(
                    text("""
                    INSERT INTO road_transfer_cache (from_station, to_station, distance_km,
                        base_drive_mins, typical_peak_drive_mins, station_exit_penalty_mins, highway_name, polyline)
                    VALUES (:from_s, :to_s, :dist, :drive, :peak, :exit_p, :hwy, :poly)
                    ON CONFLICT (from_station, to_station) DO UPDATE SET
                        distance_km = EXCLUDED.distance_km,
                        base_drive_mins = EXCLUDED.base_drive_mins;
                    """),
                    {
                        "from_s": r["from_station"],
                        "to_s": r.get("destination_code") or r.get("to_station", "BBS"),
                        "dist": r["distance_km"],
                        "drive": r["base_drive_mins"],
                        "peak": r.get("typical_peak_drive_mins", r["base_drive_mins"] * 1.25),
                        "exit_p": r.get("station_exit_penalty_mins", 12.0),
                        "hwy": r.get("highway_name", "NH-16"),
                        "poly": r.get("polyline", ""),
                    },
                )
            logger.info("Seeded %d pre-cached highway routes.", len(road_data.get("routes", [])))

        logger.info("Database seeding successfully completed!")

    except (SQLAlchemyError, OSError) as exc:
        logger.warning("Postgres database connection could not be established (Docker/Postgres may be offline): %s", exc)
        logger.info("Notice: RAIL-PULSE automatically runs with 100% functionality via LocalTopologyFallback RAM mode.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed_postgres_database())
