from collections import defaultdict
from typing import Any

from app.models.schemas import (
    CausalCard,
    SimulationResult,
    StationArrival,
    TrainKinematicState,
)


def simulate_corridor_overtakes(
    target_train_no: str,
    active_trains: list[TrainKinematicState],
    topology: dict[str, Any],
    injected_delay_mins: float = 0.0,
    freight_penalties: dict[str, float] | None = None,
    current_epoch: int = 1795070000,
) -> SimulationResult:
    """
    Deterministic forward discrete-event simulator evaluating priority overtakes
    and loop-line hold conflicts across the corridor over the next 180 minutes.
    """
    stations_map = {s["station_code"]: s for s in topology["stations"]}
    trains_master_map = {t["train_no"]: t for t in topology.get("trains", [])}
    freight_map = freight_penalties or {}

    target_state = next((t for t in active_trains if t.train_no == target_train_no), None)
    target_master = trains_master_map.get(target_train_no)

    if not target_master:
        # Fallback master if not in seed list
        target_master = {
            "train_no": target_train_no,
            "train_name": target_state.train_name if target_state else "Express Train",
            "priority_rank": target_state.priority_rank if target_state else 3,
            "direction": target_state.direction if target_state else "DN",
            "max_speed_kmph": 110,
            "halts": [],
        }

    direction = target_master["direction"]
    target_rank = target_master["priority_rank"]
    target_max_speed = target_master.get("max_speed_kmph", 110)

    # Initial delay combining current state + judge injected slider
    base_delay_mins = (target_state.current_delay_mins if target_state else 0.0) + injected_delay_mins
    curr_chainage = target_state.chainage_km if target_state else 0.0

    # Filter upcoming stations in direction of travel
    all_stations = topology["stations"]
    if direction == "DN":
        upcoming_stns = [s for s in all_stations if s["chainage_km"] >= curr_chainage]
        upcoming_stns.sort(key=lambda s: s["chainage_km"])
    else:
        upcoming_stns = [s for s in all_stations if s["chainage_km"] <= curr_chainage]
        upcoming_stns.sort(key=lambda s: s["chainage_km"], reverse=True)

    if not upcoming_stns:
        upcoming_stns = sorted(all_stations, key=lambda s: s["chainage_km"], reverse=(direction == "UP"))

    # Identify trailing higher-priority trains (closing in from behind)
    trailing_high_priority: list[tuple[TrainKinematicState, dict[str, Any]]] = []
    for t in active_trains:
        if t.train_no == target_train_no or t.direction != direction:
            continue
        master = trains_master_map.get(t.train_no, {})
        rank = master.get("priority_rank", t.priority_rank)

        # Higher priority has smaller rank (e.g. 1 < 2)
        if rank < target_rank:
            is_behind = (
                (t.chainage_km < curr_chainage)
                if direction == "DN"
                else (t.chainage_km > curr_chainage)
            )
            if is_behind:
                trailing_high_priority.append((t, master))

    timeline: list[StationArrival] = []
    causal_cards: list[CausalCard] = []
    total_loop_hold_mins = 0.0
    accumulated_delay_mins = base_delay_mins
    current_sim_time = current_epoch

    loop_occupancy: dict[str, list[tuple[int, int]]] = defaultdict(list)
    halt_schedule_map = {h["station_code"]: h for h in target_master.get("halts", [])}

    prev_stn_km = curr_chainage
    overtakes_count = 0

    for stn in upcoming_stns:
        stn_code = stn["station_code"]
        stn_name = stn["station_name"]
        stn_km = stn["chainage_km"]

        # Run duration from previous station
        dist = abs(stn_km - prev_stn_km)
        run_mins = (dist / target_max_speed) * 60.0 if target_max_speed > 0 else 0.0

        # Add any active freight shadow drag on this section
        block_key = f"{direction}_{stn_code}"
        freight_drag = freight_map.get(block_key, 0.0)
        accumulated_delay_mins += freight_drag

        if freight_drag > 0.0:
            causal_cards.append(
                CausalCard(
                    event="FREIGHT_SHADOW_DRAG",
                    station_code=stn_code,
                    station_name=stn_name,
                    added_delay_mins=freight_drag,
                    human_message=f"Added +{freight_drag:.0f} min drag behind trailing freight shadow entering {stn_name}",
                )
            )

        current_sim_time += int((run_mins + freight_drag) * 60)
        arr_epoch = current_sim_time

        # Check for Overtake Conflict at this station
        scheduled_halt = halt_schedule_map.get(stn_code)
        available_loops = (
            stn["passenger_loops_dn"] if direction == "DN" else stn["passenger_loops_up"]
        )

        for trail_state, trail_master in trailing_high_priority:
            trail_speed = trail_master.get("max_speed_kmph", 130)
            trail_dist = abs(stn_km - trail_state.chainage_km)
            trail_eta_mins = (trail_dist / trail_speed) * 60.0 + trail_state.current_delay_mins
            trail_arr_epoch = current_epoch + int(trail_eta_mins * 60)

            # Conflict condition: trailing train arrives within 10 min window of target train
            headway_gap_secs = trail_arr_epoch - arr_epoch
            if -300 <= headway_gap_secs <= 600:  # Within 5 mins before or 10 mins after
                if available_loops > len(loop_occupancy[stn_code]):
                    hold_mins = 16.0  # Standard loop line hold + turnout + signal clearance
                    total_loop_hold_mins += hold_mins
                    accumulated_delay_mins += hold_mins
                    overtakes_count += 1

                    hold_card = CausalCard(
                        event="PRIORITY_OVERTAKE_HOLD",
                        station_code=stn_code,
                        station_name=stn_name,
                        added_delay_mins=hold_mins,
                        caused_by_train=f"{trail_state.train_no} {trail_state.train_name}",
                        human_message=f"Expected +{hold_mins:.0f} min hold at {stn_name} Loop Line for {trail_state.train_no} {trail_state.train_name} overtake",
                    )
                    causal_cards.append(hold_card)

                    # Book loop slot and extend simulation departure
                    loop_occupancy[stn_code].append((arr_epoch, arr_epoch + int(hold_mins * 60)))
                    current_sim_time += int(hold_mins * 60)
                    break

        dwell_mins = scheduled_halt.get("scheduled_dwell_m", 2) if scheduled_halt else 2
        dep_epoch = current_sim_time + int(dwell_mins * 60)
        current_sim_time = dep_epoch
        prev_stn_km = stn_km

        # Build timeline arrival record
        timeline.append(
            StationArrival(
                station_code=stn_code,
                station_name=stn_name,
                chainage_km=stn_km,
                sched_arr_epoch=arr_epoch - int(accumulated_delay_mins * 60),
                sched_dep_epoch=dep_epoch - int(accumulated_delay_mins * 60),
                projected_arr_epoch=arr_epoch,
                projected_dep_epoch=dep_epoch,
                raw_sim_delay_mins=round(accumulated_delay_mins, 1),
                net_delay_mins=round(accumulated_delay_mins, 1),
                is_commercial_halt=scheduled_halt.get("is_commercial_halt", True) if scheduled_halt else True,
            )
        )

    return SimulationResult(
        train_no=target_train_no,
        direction=direction,
        timeline=timeline,
        overtakes_count=overtakes_count,
        total_loop_hold_mins=round(total_loop_hold_mins, 1),
        causal_cards=causal_cards,
    )
