from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class StationModel(Base):
    __tablename__ = "stations"

    station_code = Column(String(10), primary_key=True)
    station_name = Column(String(100), nullable=False)
    corridor_branch = Column(String(32), default="MAINLINE")
    chainage_km = Column(Float, nullable=False, index=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    has_750m_goods_loop = Column(Boolean, default=False)
    passenger_loops_dn = Column(SmallInteger, default=1)
    passenger_loops_up = Column(SmallInteger, default=1)
    is_major_junction = Column(Boolean, default=False)
    road_exit_penalty_m = Column(SmallInteger, default=12)

    # Relationships
    outgoing_blocks = relationship("TrackBlockModel", foreign_keys="TrackBlockModel.from_station", back_populates="origin_station")
    incoming_blocks = relationship("TrackBlockModel", foreign_keys="TrackBlockModel.to_station", back_populates="destination_station")
    schedule_halts = relationship("ScheduleHaltModel", back_populates="station")


class TrackBlockModel(Base):
    __tablename__ = "track_blocks"

    block_id = Column(String(32), primary_key=True)
    direction = Column(String(4), nullable=False, index=True)  # 'UP' or 'DN'
    from_station = Column(String(10), ForeignKey("stations.station_code"), nullable=False)
    to_station = Column(String(10), ForeignKey("stations.station_code"), nullable=False)
    start_km = Column(Float, nullable=False)
    end_km = Column(Float, nullable=False)
    length_km = Column(Float, nullable=False)
    mps_kmph = Column(SmallInteger, nullable=False, default=110)
    free_flow_mins = Column(Float, nullable=False)
    freight_injection_weight = Column(Float, default=0.15)
    terminal_slack_mins = Column(Float, default=0.0)
    is_single_line_throat = Column(Boolean, default=False)

    # Relationships
    origin_station = relationship("StationModel", foreign_keys=[from_station], back_populates="outgoing_blocks")
    destination_station = relationship("StationModel", foreign_keys=[to_station], back_populates="incoming_blocks")


class TrainMasterModel(Base):
    __tablename__ = "trains_master"

    train_no = Column(String(10), primary_key=True)
    train_name = Column(String(100), nullable=False)
    train_class = Column(String(25), nullable=False)  # 'VANDE_BHARAT', 'SUPERFAST', 'MAIL_EXP', etc.
    priority_rank = Column(SmallInteger, nullable=False)  # 1 (Highest) to 5 (Lowest)
    direction = Column(String(4), nullable=False)  # 'UP' or 'DN'
    max_speed_kmph = Column(SmallInteger, nullable=False, default=110)

    halts = relationship("ScheduleHaltModel", back_populates="train", cascade="all, delete-orphan", order_by="ScheduleHaltModel.stop_sequence")


class ScheduleHaltModel(Base):
    __tablename__ = "train_schedule_halts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    train_no = Column(String(10), ForeignKey("trains_master.train_no"), nullable=False)
    station_code = Column(String(10), ForeignKey("stations.station_code"), nullable=False)
    stop_sequence = Column(SmallInteger, nullable=False)
    day_offset = Column(SmallInteger, default=0)
    sched_arr_min_day = Column(SmallInteger, nullable=False)  # Minutes from 00:00 IST (0-1439)
    sched_dep_min_day = Column(SmallInteger, nullable=False)
    is_commercial_halt = Column(Boolean, default=True, nullable=False)
    scheduled_dwell_m = Column(SmallInteger, default=2)

    train = relationship("TrainMasterModel", back_populates="halts")
    station = relationship("StationModel", back_populates="schedule_halts")


class RoadTransferCacheModel(Base):
    __tablename__ = "road_transfer_cache"

    from_station = Column(String(10), ForeignKey("stations.station_code"), primary_key=True)
    to_station = Column(String(10), primary_key=True)
    highway_name = Column(String(50))
    distance_km = Column(Float, nullable=False)
    base_drive_mins = Column(Float, nullable=False)
    typical_peak_drive_mins = Column(Float, nullable=False)
    station_exit_penalty_mins = Column(Float, default=12.0)
    polyline = Column(Text, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
