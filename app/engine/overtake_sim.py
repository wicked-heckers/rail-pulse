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
    delay_shift_mins: float = 0.0,
    loop_hold_override_mins: float | None = None,
) -> SimulationResult:
    """
    Deterministic forward discrete-event simulator evaluating priority overtakes
    and loop-line hold conflicts across the corridor over the next 180 minutes.
    """
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
    # Advance projected arrival clock by injected demo delay while keeping fixed sched_arr_epoch invariant
    current_sim_time = current_epoch + int(delay_shift_mins * 60)

    loop_occupancy: dict[str, list[tuple[int, int]]] = defaultdict(list)
    has_explicit_halts = bool(target_master.get("halts"))
    halt_schedule_map = {h["station_code"]: h for h in target_master.get("halts", [])}
    block_lookup = {
        b["block_id"]: (
            b["direction"],
            min(float(b["start_km"]), float(b["end_km"])),
            max(float(b["start_km"]), float(b["end_km"])),
        )
        for b in topology.get("track_blocks", [])
    }

    prev_stn_km = curr_chainage
    prev_stn_code: str | None = target_state.current_station if target_state else None
    overtakes_count = 0

    for stn in upcoming_stns:
        stn_code = stn["station_code"]
        stn_name = stn["station_name"]
        stn_km = stn["chainage_km"]

        # Run duration from previous station
        dist = abs(stn_km - prev_stn_km)
        run_mins = (dist / target_max_speed) * 60.0 if target_max_speed > 0 else 0.0

        # Add any active freight shadow drag proportional to remaining overlap on this segment
        seg_lo = min(prev_stn_km, stn_km)
        seg_hi = max(prev_stn_km, stn_km)
        freight_drag = 0.0
        matched_block = False
        for blk_id, pen_mins in freight_map.items():
            bounds = block_lookup.get(blk_id)
            if bounds and bounds[0] == direction:
                _, blk_lo, blk_hi = bounds
                overlap = max(0.0, min(seg_hi, blk_hi) - max(seg_lo, blk_lo))
                blk_len = max(1.0, blk_hi - blk_lo)
                if overlap > 0.0:
                    freight_drag += float(pen_mins) * (overlap / blk_len)
                    matched_block = True
        if not matched_block:
            if prev_stn_code:
                block_key = f"{direction}_{prev_stn_code}_{stn_code}"
                freight_drag = freight_map.get(block_key, freight_map.get(stn_code, 0.0))
            else:
                freight_drag = freight_map.get(stn_code, 0.0)

        accumulated_delay_mins += freight_drag

        if freight_drag > 0.0:
            causal_cards.append(
                CausalCard(
                    event="FREIGHT_SHADOW_DRAG",
                    station_code=stn_code,
                    station_name=stn_name,
                    added_delay_mins=round(freight_drag, 1),
                    human_message=f"Added +{freight_drag:.0f} min drag behind trailing freight shadow entering {stn_name}",
                )
            )

        current_sim_time += int((run_mins + freight_drag) * 60)
        arr_epoch = current_sim_time
        arr_delay_mins = accumulated_delay_mins

        # Check for Overtake Conflict at this station
        scheduled_halt = halt_schedule_map.get(stn_code)
        available_loops = (
            stn["passenger_loops_dn"] if direction == "DN" else stn["passenger_loops_up"]
        )

        # If train is currently in an active loop overtake hold at this exact station, honor remaining hold
        if (
            dist < 0.5
            and target_state
            and target_state.current_station == stn_code
            and loop_hold_override_mins is not None
            and loop_hold_override_mins > 0.0
        ):
            hold_mins = round(float(loop_hold_override_mins), 1)
            total_loop_hold_mins += hold_mins
            overtakes_count += 1
            causal_cards.append(
                CausalCard(
                    event="PRIORITY_OVERTAKE_HOLD",
                    station_code=stn_code,
                    station_name=stn_name,
                    added_delay_mins=hold_mins,
                    caused_by_train="22895 Howrah-Puri Vande Bharat Express",
                    human_message=f"Holding at {stn_name} Loop Line (~{hold_mins:.0f}m left) for priority overtake clearance",
                )
            )
            loop_occupancy[stn_code].append((arr_epoch, arr_epoch + int(hold_mins * 60)))
            current_sim_time += int(hold_mins * 60)
        else:
            for trail_state, trail_master in trailing_high_priority:
                trail_speed = (
                    trail_state.speed_kmph
                    if trail_state.speed_kmph and trail_state.speed_kmph > 50.0
                    else trail_master.get("max_speed_kmph", 130)
                )
                trail_dist = abs(stn_km - trail_state.chainage_km)
                trail_eta_mins = (trail_dist / trail_speed) * 60.0 + trail_state.current_delay_mins
                if stn_code == "BBS" and direction == "DN":
                    brag_bounds = block_lookup.get("DN_CTC_BRAG")
                    if brag_bounds and "DN_CTC_BRAG" in freight_map and trail_state.chainage_km < brag_bounds[2]:
                        rem_frac = max(
                            0.0,
                            (brag_bounds[2] - max(trail_state.chainage_km, brag_bounds[1]))
                            / max(1.0, brag_bounds[2] - brag_bounds[1]),
                        )
                        trail_eta_mins += float(freight_map["DN_CTC_BRAG"]) * rem_frac
                trail_arr_epoch = current_epoch + int(trail_eta_mins * 60)

                # Conflict condition: trailing train arrives within overtake window and loop available
                max_gap_secs = 600 if base_delay_mins >= 25.0 else 240
                headway_gap_secs = trail_arr_epoch - arr_epoch
                if (-300 <= headway_gap_secs <= max_gap_secs) and (
                    available_loops > len(loop_occupancy[stn_code])
                ):
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

                    # EC-08: Cascaded Double Priority Overtake check
                    for sec_state, sec_master in trailing_high_priority:
                        if sec_state.train_no == trail_state.train_no:
                            continue
                        sec_speed = sec_master.get("max_speed_kmph", 130)
                        sec_dist = abs(stn_km - sec_state.chainage_km)
                        sec_eta_mins = (sec_dist / sec_speed) * 60.0 + sec_state.current_delay_mins
                        sec_arr_epoch = current_epoch + int(sec_eta_mins * 60)
                        sec_gap_secs = sec_arr_epoch - current_sim_time
                        if -180 <= sec_gap_secs <= 600:
                            second_hold_mins = 10.0
                            total_loop_hold_mins += second_hold_mins
                            accumulated_delay_mins += second_hold_mins
                            overtakes_count += 1
                            causal_cards.append(
                                CausalCard(
                                    event="CASCADE_DOUBLE_OVERTAKE",
                                    station_code=stn_code,
                                    station_name=stn_name,
                                    added_delay_mins=second_hold_mins,
                                    caused_by_train=f"{sec_state.train_no} {sec_state.train_name}",
                                    human_message=f"Extended +{second_hold_mins:.0f} min loop hold at {stn_name} for 2nd overtake by {sec_state.train_no} {sec_state.train_name}",
                                )
                            )
                            current_sim_time += int(second_hold_mins * 60)
                            break
                    break


        if dist < 0.5:
            if (
                target_state
                and target_state.speed_kmph == 0.0
                and target_state.current_delay_mins > 0.0
                and scheduled_halt
            ):
                dwell_mins = scheduled_halt.get("scheduled_dwell_m", 2)
            else:
                dwell_mins = 0
        elif has_explicit_halts:
            dwell_mins = scheduled_halt.get("scheduled_dwell_m", 2) if scheduled_halt else 0
        else:
            dwell_mins = 2 if stn.get("is_major_junction", False) and stn_km not in (0.0, 206.0) else 0
        dep_epoch = current_sim_time + int(dwell_mins * 60)
        current_sim_time = dep_epoch
        prev_stn_km = stn_km
        prev_stn_code = stn_code

        # Build timeline arrival record
        timeline.append(
            StationArrival(
                station_code=stn_code,
                station_name=stn_name,
                chainage_km=stn_km,
                sched_arr_epoch=arr_epoch - int(arr_delay_mins * 60),
                sched_dep_epoch=dep_epoch - int(accumulated_delay_mins * 60),
                projected_arr_epoch=arr_epoch,
                projected_dep_epoch=dep_epoch,
                raw_sim_delay_mins=round(arr_delay_mins, 1),
                net_delay_mins=round(arr_delay_mins, 1),
                is_commercial_halt=scheduled_halt.get("is_commercial_halt", True)
                if scheduled_halt
                else bool(stn.get("is_major_junction", False)),
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
