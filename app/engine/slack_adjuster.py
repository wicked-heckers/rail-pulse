from typing import Any

from app.models.schemas import StationArrival


def calculate_usable_slack(
    total_slack_mins: float,
    rain_mm_hr: float = 0.0,
    freight_probability: float = 0.0,
) -> float:
    """
    Computes usable recovery slack based on weather drag and freight congestion.
    Caps recovery efficiency to 75% when tracks are wet or congested.
    """
    if total_slack_mins <= 0.0:
        return 0.0

    efficiency = 1.00
    if rain_mm_hr > 10.0 or freight_probability > 0.60:
        efficiency = 0.75  # 25% slack loss due to caution orders or wet rail braking

    return round(total_slack_mins * efficiency, 1)


def apply_slack_to_timeline(
    timeline: list[StationArrival],
    track_blocks: list[dict[str, Any]],
    direction: str,
    rain_mm_hr: float = 0.0,
    freight_probability: float = 0.0,
) -> list[StationArrival]:
    """
    Subtracts sectional timetable slack from projected delay across the corridor.
    Enforces the mandatory floor clamp: total delay at intermediate commercial halts
    can NEVER be negative (a train cannot depart earlier than published timetable).
    """
    # Build map of terminal slack per destination station
    slack_by_dest: dict[str, float] = {}
    for block in track_blocks:
        if block["direction"] == direction and block.get("terminal_slack_mins", 0.0) > 0.0:
            slack_by_dest[block["to_station"]] = block["terminal_slack_mins"]

    cumulative_slack = 0.0
    adjusted_timeline: list[StationArrival] = []

    for arrival in timeline:
        stn_code = arrival.station_code
        if stn_code in slack_by_dest:
            cumulative_slack += slack_by_dest[stn_code]

        usable_slack = calculate_usable_slack(cumulative_slack, rain_mm_hr, freight_probability)

        # Apply slack subtraction
        raw_delay = arrival.raw_sim_delay_mins
        net_delay = max(0.0, round(raw_delay - usable_slack, 1))

        # Adjust projected arrival and departure
        sched_arr = arrival.sched_arr_epoch
        sched_dep = arrival.sched_dep_epoch
        proj_arr = sched_arr + int(net_delay * 60)

        # Train can never depart earlier than scheduled departure time
        dwell_secs = max(60, arrival.projected_dep_epoch - arrival.projected_arr_epoch)
        proj_dep = max(sched_dep, proj_arr + dwell_secs)

        adjusted_timeline.append(
            StationArrival(
                station_code=arrival.station_code,
                station_name=arrival.station_name,
                chainage_km=arrival.chainage_km,
                sched_arr_epoch=sched_arr,
                sched_dep_epoch=sched_dep,
                projected_arr_epoch=proj_arr,
                projected_dep_epoch=proj_dep,
                raw_sim_delay_mins=raw_delay,
                net_delay_mins=net_delay,
                is_commercial_halt=arrival.is_commercial_halt,
                causal_cards=arrival.causal_cards,
            )
        )

    return adjusted_timeline
