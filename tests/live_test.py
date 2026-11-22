import httpx
import json

client = httpx.Client(base_url="http://127.0.0.1:8000")

print("--- 1. HEALTH CHECK ---")
h = client.get("/api/v1/health").json()
print("Health:", h)

print("\n--- 2. INITIAL FORECAST (Train 12821 Dhauli Express) ---")
f1 = client.get("/api/v1/trains/12821/forecast").json()
print("Train:", f1["train_name"], "| Current Delay:", f1["current_delay_mins"])
print("Naive NTES ETA:", f1["naive_ntes_eta_epoch"])
print(f"Quantile ETA: P10={f1['p10_eta_epoch']} | P50={f1['p50_eta_epoch']} | P90={f1['p90_eta_epoch']}")

print("\n--- 3. RESCUE EVALUATION (Before delay injection) ---")
r1 = client.post(
    "/api/v1/rescue/evaluate",
    json={
        "train_no": "12821",
        "destination_code": "BBS",
        "connection_deadline_utc": 1795075800,
        "transfer_buffer_mins": 15,
        "passenger_status": "ON_BOARD",
    },
).json()
print("Survival Probability:", f"{r1['survival_probability_pct']}%", "| Risk:", r1["risk_level"], "| Bailout Recommended:", r1["bailout_recommended"])

print("\n--- 4. INJECTING +30 MIN DELAY ---")
inj = client.post("/api/v1/demo/inject-delay", json={"train_no": "12821", "added_delay_mins": 30.0}).json()
print("Injection Response:", inj)

print("\n--- 5. UPDATED FORECAST (After delay injection) ---")
f2 = client.get("/api/v1/trains/12821/forecast").json()
print("Current Delay:", f2["current_delay_mins"])
print(f"Updated Quantile ETA: P10={f2['p10_eta_epoch']} | P50={f2['p50_eta_epoch']} | P90={f2['p90_eta_epoch']}")
print(f"Causal Disruption Events ({len(f2['causal_cards'])}):")
for c in f2["causal_cards"]:
    print(f"  * [{c['event']}] at {c['station_name']} (+{c['added_delay_mins']}m): {c['human_message']}")

print("\n--- 6. UPDATED RESCUE EVALUATION ---")
r2 = client.post(
    "/api/v1/rescue/evaluate",
    json={
        "train_no": "12821",
        "destination_code": "BBS",
        "connection_deadline_utc": 1795075800,
        "transfer_buffer_mins": 15,
        "passenger_status": "ON_BOARD",
    },
).json()
print("Survival Probability:", f"{r2['survival_probability_pct']}%", "| Risk:", r2["risk_level"], "| Bailout Recommended:", r2["bailout_recommended"])
if r2.get("bailout_plan"):
    p = r2["bailout_plan"]
    print(f"  -> Recommended Deboard Station: {p['deboard_station_name']} ({p['deboard_station_code']})")
    print(f"  -> Road Mode: {p['road_mode']} (drive: {p['road_drive_mins']} mins, exit: {p['station_exit_mins']} mins)")
    print(f"  -> Saves: {p['minutes_saved']} mins vs staying on train")
    print(f"  -> Road Connection Survival: {p['road_survival_pct']}%")
    print(f"  -> Advisory: {p['human_guidance']}")
