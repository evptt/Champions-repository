import asyncio
import logging
import math
import os
import re
import sqlite3
import sys
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from telegram import (
	InlineKeyboardButton,
	InlineKeyboardMarkup,
	KeyboardButton,
	ReplyKeyboardMarkup,
	ReplyKeyboardRemove,
	Update,
)
from telegram.ext import (
	Application,
	ApplicationBuilder,
	CallbackQueryHandler,
	CommandHandler,
	ConversationHandler,
	ContextTypes,
	MessageHandler,
	filters,
)


logging.basicConfig(
	level=logging.INFO,
	format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("trip_reminder_bot")


TOKEN = "8843240155:AAE30qDlgwKcWcPItYzNzzZA3NYJ3PilYyk"
DB_PATH = os.getenv("TRIP_REMINDER_DB", "trip_reminder.sqlite3")
SCAN_INTERVAL_SECONDS = 60
DEFAULT_BUFFER_PERCENT = 10.0

ADD_TITLE, ADD_DESTINATION, ADD_ARRIVAL, ADD_MODE, ADD_REMINDER, ADD_CONFIRM = range(6)
EDIT_SELECT, EDIT_FIELD, EDIT_VALUE, EDIT_CONFIRM_DELETE = range(6, 10)
SETTINGS_BUFFER, LOCATION_WAIT = range(10, 12)

MODE_OPTIONS = {
	"car": {"label": "Личный автомобиль", "profile": "driving", "speed_kmh": 35.0},
	"walk": {"label": "Пешком", "profile": "walking", "speed_kmh": 5.0},
	"bike": {"label": "Велосипед", "profile": "cycling", "speed_kmh": 15.0},
	"transit": {"label": "Общественный транспорт", "profile": None, "speed_kmh": 22.0},
}

FIELD_LABELS = {
	"title": "название",
	"destination_query": "место",
	"arrival_time": "время прибытия",
	"transport_mode": "способ передвижения",
	"reminder_before_minutes": "напоминание за N минут",
}


@dataclass
class GeoPoint:
	lat: float
	lon: float
	label: str


def now_local() -> datetime:
	return datetime.now().replace(second=0, microsecond=0)


def format_dt(value: datetime) -> str:
	return value.strftime("%Y-%m-%d %H:%M")


def parse_dt(value: str) -> datetime:
	return datetime.strptime(value.strip(), "%Y-%m-%d %H:%M")


def parse_int(value: str) -> int:
	return int(value.strip())


def parse_float(value: str) -> float:
	return float(value.strip().replace(",", "."))


def parse_coordinates(text: str) -> Optional[GeoPoint]:
	match = re.match(
		r"^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$",
		text,
	)
	if not match:
		return None
	lat = float(match.group(1))
	lon = float(match.group(2))
	if not (-90 <= lat <= 90 and -180 <= lon <= 180):
		return None
	return GeoPoint(lat=lat, lon=lon, label=f"{lat:.6f}, {lon:.6f}")


@contextmanager
def db_connection() -> sqlite3.Connection:
	conn = sqlite3.connect(DB_PATH)
	conn.row_factory = sqlite3.Row
	try:
		yield conn
		conn.commit()
	finally:
		conn.close()


def init_db() -> None:
	with db_connection() as conn:
		conn.execute(
			"""
			CREATE TABLE IF NOT EXISTS settings (
				user_id INTEGER PRIMARY KEY,
				buffer_percent REAL NOT NULL DEFAULT 10.0
			)
			"""
		)
		conn.execute(
			"""
			CREATE TABLE IF NOT EXISTS locations (
				user_id INTEGER PRIMARY KEY,
				lat REAL NOT NULL,
				lon REAL NOT NULL,
				label TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
			"""
		)
		conn.execute(
			"""
			CREATE TABLE IF NOT EXISTS trips (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				title TEXT NOT NULL,
				destination_query TEXT NOT NULL,
				destination_label TEXT NOT NULL,
				dest_lat REAL NOT NULL,
				dest_lon REAL NOT NULL,
				arrival_time TEXT NOT NULL,
				transport_mode TEXT NOT NULL,
				reminder_before_minutes INTEGER NOT NULL,
				reminder_sent INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
			"""
		)


def ensure_user_settings(user_id: int) -> dict[str, Any]:
	with db_connection() as conn:
		conn.execute(
			"INSERT OR IGNORE INTO settings(user_id, buffer_percent) VALUES (?, ?)",
			(user_id, DEFAULT_BUFFER_PERCENT),
		)
		row = conn.execute(
			"SELECT user_id, buffer_percent FROM settings WHERE user_id = ?",
			(user_id,),
		).fetchone()
	return dict(row)


def get_user_location(user_id: int) -> Optional[dict[str, Any]]:
	with db_connection() as conn:
		row = conn.execute(
			"SELECT user_id, lat, lon, label, updated_at FROM locations WHERE user_id = ?",
			(user_id,),
		).fetchone()
	return dict(row) if row else None


def save_user_location(user_id: int, lat: float, lon: float, label: str) -> None:
	with db_connection() as conn:
		conn.execute(
			"""
			INSERT INTO locations(user_id, lat, lon, label, updated_at)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(user_id) DO UPDATE SET
				lat = excluded.lat,
				lon = excluded.lon,
				label = excluded.label,
				updated_at = excluded.updated_at
			""",
			(user_id, lat, lon, label, format_dt(now_local())),
		)


def geocode_destination_sync(query: str) -> Optional[GeoPoint]:
	query = query.strip()
	coordinate = parse_coordinates(query)
	if coordinate:
		return coordinate

	params = urlencode(
		{
			"q": query,
			"format": "jsonv2",
			"limit": 1,
		}
	)
	url = f"https://nominatim.openstreetmap.org/search?{params}"
	request = Request(
		url,
		headers={"User-Agent": "TripReminderBot/1.0 (+https://example.local)"},
	)
	with urlopen(request, timeout=15) as response:
		payload = response.read().decode("utf-8")
	import json

	data = json.loads(payload)
	if not data:
		return None
	item = data[0]
	return GeoPoint(lat=float(item["lat"]), lon=float(item["lon"]), label=item["display_name"])


def osrm_duration_minutes_sync(
	start_lat: float,
	start_lon: float,
	dest_lat: float,
	dest_lon: float,
	profile: str,
) -> Optional[float]:
	url = (
		f"https://router.project-osrm.org/route/v1/{profile}/"
		f"{start_lon},{start_lat};{dest_lon},{dest_lat}?overview=false&alternatives=false&steps=false"
	)
	request = Request(url, headers={"User-Agent": "TripReminderBot/1.0"})
	with urlopen(request, timeout=15) as response:
		payload = response.read().decode("utf-8")
	import json

	data = json.loads(payload)
	if data.get("code") != "Ok" or not data.get("routes"):
		return None
	return float(data["routes"][0]["duration"]) / 60.0


def haversine_km(start_lat: float, start_lon: float, dest_lat: float, dest_lon: float) -> float:
	radius_km = 6371.0
	lat1 = math.radians(start_lat)
	lat2 = math.radians(dest_lat)
	d_lat = math.radians(dest_lat - start_lat)
	d_lon = math.radians(dest_lon - start_lon)
	a = (
		math.sin(d_lat / 2) ** 2
		+ math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
	)
	c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
	return radius_km * c


def estimate_travel_minutes_sync(
	start_lat: float,
	start_lon: float,
	dest_lat: float,
	dest_lon: float,
	transport_mode: str,
) -> float:
	mode = MODE_OPTIONS[transport_mode]
	profile = mode["profile"]
	if profile:
		try:
			duration = osrm_duration_minutes_sync(start_lat, start_lon, dest_lat, dest_lon, profile)
			if duration is not None:
				return max(duration, 1.0)
		except Exception:
			logger.exception("OSRM request failed, using fallback estimate")

	distance_km = haversine_km(start_lat, start_lon, dest_lat, dest_lon)
	return max(distance_km / mode["speed_kmh"] * 60.0, 1.0)


def get_trip_by_id(trip_id: int) -> Optional[dict[str, Any]]:
	with db_connection() as conn:
		row = conn.execute("SELECT * FROM trips WHERE id = ?", (trip_id,)).fetchone()
	return dict(row) if row else None


def list_trips_for_user(user_id: int) -> list[dict[str, Any]]:
	with db_connection() as conn:
		rows = conn.execute(
			"SELECT * FROM trips WHERE user_id = ? ORDER BY arrival_time ASC, id ASC",
			(user_id,),
		).fetchall()
	return [dict(row) for row in rows]


def create_trip(user_id: int, data: dict[str, Any]) -> int:
	timestamp = format_dt(now_local())
	with db_connection() as conn:
		cursor = conn.execute(
			"""
			INSERT INTO trips(
				user_id, title, destination_query, destination_label, dest_lat, dest_lon,
				arrival_time, transport_mode, reminder_before_minutes, reminder_sent,
				created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
			""",
			(
				user_id,
				data["title"],
				data["destination_query"],
				data["destination_label"],
				data["dest_lat"],
				data["dest_lon"],
				data["arrival_time"],
				data["transport_mode"],
				data["reminder_before_minutes"],
				timestamp,
				timestamp,
			),
		)
	return int(cursor.lastrowid)


def update_trip_field(trip_id: int, field: str, value: Any) -> None:
	with db_connection() as conn:
		conn.execute(
			f"UPDATE trips SET {field} = ?, updated_at = ?, reminder_sent = 0 WHERE id = ?",
			(value, format_dt(now_local()), trip_id),
		)


def delete_trip(trip_id: int) -> None:
	with db_connection() as conn:
		conn.execute("DELETE FROM trips WHERE id = ?", (trip_id,))


def set_user_buffer_percent(user_id: int, buffer_percent: float) -> None:
	with db_connection() as conn:
		conn.execute(
			"""
			INSERT INTO settings(user_id, buffer_percent) VALUES (?, ?)
			ON CONFLICT(user_id) DO UPDATE SET buffer_percent = excluded.buffer_percent
			""",
			(user_id, buffer_percent),
		)


def get_buffer_percent(user_id: int) -> float:
	return float(ensure_user_settings(user_id)["buffer_percent"])


def transport_label(mode: str) -> str:
	return MODE_OPTIONS.get(mode, {"label": mode}).get("label", mode)


def trip_summary(trip: dict[str, Any]) -> str:
	trip_time = datetime.strptime(trip["arrival_time"], "%Y-%m-%d %H:%M")
	status = "прошедшая" if trip_time < now_local() else "предстоящая"
	return (
		f"<b>{trip['title']}</b>\n"
		f"Статус: {status}\n"
		f"Место: {trip['destination_label']}\n"
		f"Время прибытия: {trip['arrival_time']}\n"
		f"Транспорт: {transport_label(trip['transport_mode'])}\n"
		f"Напомнить за: {trip['reminder_before_minutes']} мин.\n"
		f"ID: {trip['id']}"
	)


def trips_keyboard(trips: list[dict[str, Any]]) -> InlineKeyboardMarkup:
    buttons = []
    current = now_local()
    for trip in trips:
        arrival = datetime.strptime(trip["arrival_time"], "%Y-%m-%d %H:%M")
        is_past = arrival < current
        row = []
        if is_past:
            row.append(InlineKeyboardButton(f"{trip['title']}", callback_data=f"trip:view:{trip['id']}"))
            row.append(InlineKeyboardButton("Удалить", callback_data=f"trip:delete:{trip['id']}"))
        else:
            row.append(InlineKeyboardButton(f"Изменить {trip['title']}", callback_data=f"trip:edit:{trip['id']}"))
            row.append(InlineKeyboardButton("Удалить", callback_data=f"trip:delete:{trip['id']}"))
        buttons.append(row)
    if not buttons:
        buttons.append([InlineKeyboardButton("➕ Новая поездка", callback_data="trip:new")])
    return InlineKeyboardMarkup(buttons)


def field_keyboard(trip_id: int, trip: dict[str, Any]) -> InlineKeyboardMarkup:
    arrival = datetime.strptime(trip["arrival_time"], "%Y-%m-%d %H:%M")
    buttons = [
        [InlineKeyboardButton("Название", callback_data=f"editfield:{trip_id}:title")],
        [InlineKeyboardButton("Место", callback_data=f"editfield:{trip_id}:destination_query")],
        [InlineKeyboardButton("Время", callback_data=f"editfield:{trip_id}:arrival_time")],
        [InlineKeyboardButton("Способ", callback_data=f"editfield:{trip_id}:transport_mode")],
        [InlineKeyboardButton("Напоминание", callback_data=f"editfield:{trip_id}:reminder_before_minutes")],
        [InlineKeyboardButton("Удалить", callback_data=f"trip:delete:{trip_id}")],
        [InlineKeyboardButton("🔙 Назад к списку", callback_data="back_to_list")]
    ]
    return InlineKeyboardMarkup(buttons)


def mode_keyboard() -> InlineKeyboardMarkup:
	return InlineKeyboardMarkup(
		[
			[InlineKeyboardButton("Авто", callback_data="mode:car"), InlineKeyboardButton("Пешком", callback_data="mode:walk")],
			[InlineKeyboardButton("Велосипед", callback_data="mode:bike"), InlineKeyboardButton("Общественный транспорт", callback_data="mode:transit")],
		]
	)


def confirm_keyboard(prefix: str, yes_data: str, no_data: str = "cancel") -> InlineKeyboardMarkup:
	return InlineKeyboardMarkup(
		[[InlineKeyboardButton("Подтвердить", callback_data=yes_data), InlineKeyboardButton("Отмена", callback_data=no_data)]]
	)


async def send_main_menu(update: Update, text: str) -> None:
	keyboard = ReplyKeyboardMarkup(
		[
			[KeyboardButton("Новая поездка"), KeyboardButton("Список поездок")],
			[KeyboardButton("Моя геолокация"), KeyboardButton("Настройки")],
		],
		resize_keyboard=True,
	)
	if update.message:
		await update.message.reply_text(text, reply_markup=keyboard)
	elif update.effective_message:
		await update.effective_message.reply_text(text, reply_markup=keyboard)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
	text = (
		"Бот планирует поездки и напоминает о выезде с учётом маршрута.\n\n"
		"Команды:\n"
		"/newtrip — добавить поездку\n"
		"/trips — список поездок\n"
		"/location — сохранить текущую геопозицию\n"
		"/settings — настроить запас времени\n"
		"/help — справка\n\n"
		"Для корректных напоминаний отправьте текущую геопозицию через /location."
	)
	await send_main_menu(update, text)


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
	await start(update, context)


async def location_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
	keyboard = ReplyKeyboardMarkup(
		[[KeyboardButton("Отправить геопозицию", request_location=True)]],
		resize_keyboard=True,
		one_time_keyboard=True,
	)
	await update.message.reply_text(
		"Отправьте текущую геопозицию одним сообщением. Она будет использоваться для расчёта маршрута и времени выезда.",
		reply_markup=keyboard,
	)
	return LOCATION_WAIT


async def location_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
	message = update.message
	if not message or not message.location:
		await message.reply_text("Нужно отправить именно геопозицию, а не текст.")
		return LOCATION_WAIT
	save_user_location(
		update.effective_user.id,
		message.location.latitude,
		message.location.longitude,
		"Текущая геопозиция из Telegram",
	)
	await message.reply_text("Геопозиция сохранена.", reply_markup=ReplyKeyboardRemove())
	return ConversationHandler.END


async def settings_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
	user_id = update.effective_user.id
	buffer_percent = get_buffer_percent(user_id)
	await update.message.reply_text(
		f"Текущий запас времени: {buffer_percent:.1f}%.\nВведите новое значение от 0 до 100.",
		reply_markup=ReplyKeyboardRemove(),
	)
	return SETTINGS_BUFFER


async def settings_buffer_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
	try:
		value = parse_float(update.message.text)
		if not 0 <= value <= 100:
			raise ValueError
	except Exception:
		await update.message.reply_text("Введите число от 0 до 100, например 10 или 15.5.")
		return SETTINGS_BUFFER

	set_user_buffer_percent(update.effective_user.id, value)
	await send_main_menu(update, f"Запас времени обновлён: {value:.1f}%")
	return ConversationHandler.END


async def newtrip_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
	context.user_data["trip_data"] = {}
	await update.message.reply_text("Введите название поездки, например: Встреча с клиентом")
	return ADD_TITLE


async def add_title(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
	title = update.message.text.strip()
	if len(title) < 2:
		await update.message.reply_text("Название слишком короткое. Введите ещё раз.")
		return ADD_TITLE
	context.user_data["trip_data"]["title"] = title
	await update.message.reply_text(
		"Введите место поездки. Можно адрес, название точки или координаты в формате `55.751244, 37.618423`.",
		parse_mode="Markdown",
	)
	return ADD_DESTINATION


async def add_destination(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
	query = update.message.text.strip()
	try:
		geo = await asyncio.to_thread(geocode_destination_sync, query)
	except Exception:
		logger.exception("Geocoding failed")
		geo = None

	if not geo:
		await update.message.reply_text(
			"Не удалось найти место. Отправьте адрес, название объекта или координаты в формате `lat, lon`.",
			parse_mode="Markdown",
		)
		return ADD_DESTINATION

	context.user_data["trip_data"].update(
		{
			"destination_query": query,
			"destination_label": geo.label,
			"dest_lat": geo.lat,
			"dest_lon": geo.lon,
		}
	)
	await update.message.reply_text(
		"Введите время прибытия в формате `YYYY-MM-DD HH:MM`\nНапример: `2026-07-10 18:30`",
		parse_mode="Markdown",
	)
	return ADD_ARRIVAL


async def add_arrival(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
	try:
		arrival = parse_dt(update.message.text)
		if arrival <= now_local():
			raise ValueError
	except Exception:
		await update.message.reply_text("Введите будущее время в формате `YYYY-MM-DD HH:MM`.", parse_mode="Markdown")
		return ADD_ARRIVAL

	context.user_data["trip_data"]["arrival_time"] = format_dt(arrival)
	await update.message.reply_text("Выберите способ передвижения.", reply_markup=mode_keyboard())
	return ADD_MODE


async def add_mode_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
	query = update.callback_query
	await query.answer()
	mode = query.data.split(":", 1)[1]
	context.user_data["trip_data"]["transport_mode"] = mode
	await query.edit_message_text("Сколько минут до выезда нужно напомнить? Введите число.")
	return ADD_REMINDER


async def add_reminder(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
	try:
		minutes = parse_int(update.message.text)
		if minutes < 0 or minutes > 24 * 60:
			raise ValueError
	except Exception:
		await update.message.reply_text("Введите целое число минут, например 30 или 45.")
		return ADD_REMINDER

	context.user_data["trip_data"]["reminder_before_minutes"] = minutes
	data = context.user_data["trip_data"]
	trip_text = (
		"Проверьте параметры поездки:\n\n"
		f"Название: {data['title']}\n"
		f"Место: {data['destination_label']}\n"
		f"Прибытие: {data['arrival_time']}\n"
		f"Способ: {transport_label(data['transport_mode'])}\n"
		f"Напомнить за: {minutes} мин.\n"
	)
	await update.message.reply_text(trip_text, reply_markup=confirm_keyboard("add", "add:confirm", "cancel"))
	return ADD_CONFIRM


async def add_confirm_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
	query = update.callback_query
	await query.answer()
	if query.data == "cancel":
		context.user_data.pop("trip_data", None)
		await query.edit_message_text("Создание поездки отменено.")
		return ConversationHandler.END

	user_id = update.effective_user.id
	data = context.user_data.get("trip_data", {})
	trip_id = create_trip(user_id, data)
	context.user_data.pop("trip_data", None)
	await query.edit_message_text(f"Поездка сохранена. ID: {trip_id}")

	if not get_user_location(user_id):
		await query.message.reply_text("Для точных напоминаний отправьте текущую геопозицию через /location.")
	return ConversationHandler.END


async def trips_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
	trips = list_trips_for_user(update.effective_user.id)
	if not trips:
		await update.message.reply_text("Пока нет запланированных поездок. Создайте первую через /newtrip.")
		return

	text = ["Ваши поездки:"]
	for trip in trips:
		arrival = datetime.strptime(trip["arrival_time"], "%Y-%m-%d %H:%M")
		status = "прошедшая" if arrival < now_local() else "предстоящая"
		text.append(f"• {trip['title']} — {trip['arrival_time']} ({status})")
	await update.message.reply_text("\n".join(text), reply_markup=trips_keyboard(trips))


async def handle_trip_view(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    trip_id = int(query.data.split(":")[-1])
    trip = get_trip_by_id(trip_id)
    if not trip or trip["user_id"] != update.effective_user.id:
        await query.edit_message_text("Поездка не найдена.")
        return
    
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("🔙 Назад к списку", callback_data="back_to_list")]
    ])
    
    await query.edit_message_text(
        trip_summary(trip),
        reply_markup=keyboard,
        parse_mode="HTML"
    )

async def handle_back_to_list(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    
    trips = list_trips_for_user(update.effective_user.id)
    if not trips:
        await query.edit_message_text("Пока нет запланированных поездок. Создайте первую через /newtrip.")
        return
    
    text = ["Ваши поездки:"]
    for trip in trips:
        arrival = datetime.strptime(trip["arrival_time"], "%Y-%m-%d %H:%M")
        status = "прошедшая" if arrival < now_local() else "предстоящая"
        text.append(f"• {trip['title']} — {trip['arrival_time']} ({status})")
    
    await query.edit_message_text(
        "\n".join(text),
        reply_markup=trips_keyboard(trips)
    )

async def handle_trip_edit(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
	query = update.callback_query
	await query.answer()
	trip_id = int(query.data.split(":")[-1])
	trip = get_trip_by_id(trip_id)
	if not trip or trip["user_id"] != update.effective_user.id:
		await query.edit_message_text("Поездка не найдена.")
		return
	if datetime.strptime(trip["arrival_time"], "%Y-%m-%d %H:%M") < now_local():
		await query.edit_message_text("Прошедшую поездку можно только просматривать.")
		return
	context.user_data["edit_trip_id"] = trip_id
	await query.edit_message_text(trip_summary(trip), reply_markup=field_keyboard(trip_id, trip), parse_mode="HTML")


async def handle_edit_field(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    _, trip_id_str, field = query.data.split(":", 2)
    trip_id = int(trip_id_str)
    trip = get_trip_by_id(trip_id)
    if not trip or trip["user_id"] != update.effective_user.id:
        await query.edit_message_text("Поездка не найдена.")
        return ConversationHandler.END
    if datetime.strptime(trip["arrival_time"], "%Y-%m-%d %H:%M") < now_local():
        await query.edit_message_text("Прошедшую поездку можно только просматривать.")
        return ConversationHandler.END

    context.user_data["edit_trip_id"] = trip_id
    context.user_data["edit_field"] = field

    prompts = {
        "title": "Введите новое название поездки.",
        "destination_query": "Введите новый адрес, название точки или координаты.",
        "arrival_time": "Введите новое время в формате `YYYY-MM-DD HH:MM`.",
        "transport_mode": "Введите способ: авто, пешком, велосипед, транспорт.",
        "reminder_before_minutes": "Введите количество минут до выезда.",
    }
    await query.edit_message_text(prompts[field], parse_mode="Markdown")
    return EDIT_VALUE


async def edit_value(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
	trip_id = context.user_data.get("edit_trip_id")
	field = context.user_data.get("edit_field")
	trip = get_trip_by_id(int(trip_id)) if trip_id else None
	if not trip or trip["user_id"] != update.effective_user.id:
		await update.message.reply_text("Поездка не найдена.")
		return ConversationHandler.END

	raw_value = update.message.text.strip()
	new_value: Any

	try:
		if field == "title":
			if len(raw_value) < 2:
				raise ValueError
			new_value = raw_value
		elif field == "destination_query":
			geo = await asyncio.to_thread(geocode_destination_sync, raw_value)
			if not geo:
				raise ValueError
			update_trip_field(trip["id"], "destination_query", raw_value)
			update_trip_field(trip["id"], "destination_label", geo.label)
			update_trip_field(trip["id"], "dest_lat", geo.lat)
			update_trip_field(trip["id"], "dest_lon", geo.lon)
			await update.message.reply_text("Место обновлено.")
			context.user_data.pop("edit_trip_id", None)
			context.user_data.pop("edit_field", None)
			return ConversationHandler.END
		elif field == "arrival_time":
			new_value = format_dt(parse_dt(raw_value))
		elif field == "transport_mode":
			normalized = raw_value.lower()
			if normalized in {"авто", "машина", "car"}:
				new_value = "car"
			elif normalized in {"пешком", "walk", "пеший"}:
				new_value = "walk"
			elif normalized in {"велосипед", "bike", "вел"}:
				new_value = "bike"
			elif normalized in {"транспорт", "общественный транспорт", "transit", "bus"}:
				new_value = "transit"
			else:
				raise ValueError
		elif field == "reminder_before_minutes":
			new_value = parse_int(raw_value)
			if new_value < 0 or new_value > 24 * 60:
				raise ValueError
		else:
			raise ValueError
	except Exception:
		await update.message.reply_text("Значение не распознано. Попробуйте ещё раз.")
		return EDIT_VALUE

	update_trip_field(trip["id"], field, new_value)
	context.user_data.pop("edit_trip_id", None)
	context.user_data.pop("edit_field", None)
	await update.message.reply_text("Изменение сохранено.")
	return ConversationHandler.END


async def handle_delete_trip(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    trip_id = int(query.data.split(":")[-1])
    trip = get_trip_by_id(trip_id)
    if not trip or trip["user_id"] != update.effective_user.id:
        await query.edit_message_text("Поездка не найдена.")
        return
    context.user_data["delete_trip_id"] = trip_id
    await query.edit_message_text(
        trip_summary(trip) + "\n\nУдалить эту поездку?",
        reply_markup=confirm_keyboard("delete", f"delete:confirm:{trip_id}", f"trip:view:{trip_id}"),
        parse_mode="HTML",
    )


async def handle_delete_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
	query = update.callback_query
	await query.answer()
	parts = query.data.split(":")
	if len(parts) != 3:
		await query.edit_message_text("Некорректная команда.")
		return
	trip_id = int(parts[2])
	trip = get_trip_by_id(trip_id)
	if not trip or trip["user_id"] != update.effective_user.id:
		await query.edit_message_text("Поездка не найдена.")
		return
	delete_trip(trip_id)
	context.user_data.pop("delete_trip_id", None)
	await query.edit_message_text("Поездка удалена.")


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
	context.user_data.pop("trip_data", None)
	context.user_data.pop("edit_trip_id", None)
	context.user_data.pop("edit_field", None)
	context.user_data.pop("delete_trip_id", None)
	await update.message.reply_text("Действие отменено.", reply_markup=ReplyKeyboardRemove())
	return ConversationHandler.END


async def text_menu_router(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
	text = (update.message.text or "").strip().lower()
	if text == "новая поездка":
		await newtrip_command(update, context)
	elif text == "список поездок":
		await trips_command(update, context)
	elif text == "моя геолокация":
		await location_command(update, context)
	elif text == "настройки":
		await settings_command(update, context)
	else:
		await update.message.reply_text("Используйте команды /help, /newtrip, /trips, /location или /settings.")


async def process_reminders(bot: Any) -> None:
	now = now_local()
	with db_connection() as conn:
		trips = conn.execute(
			"""
			SELECT * FROM trips
			WHERE reminder_sent = 0 AND arrival_time > ?
			ORDER BY arrival_time ASC
			""",
			(format_dt(now),),
		).fetchall()

	for row in trips:
		trip = dict(row)
		user_id = trip["user_id"]
		location = get_user_location(user_id)
		if not location:
			continue

		try:
			travel_minutes = await asyncio.to_thread(
				estimate_travel_minutes_sync,
				location["lat"],
				location["lon"],
				trip["dest_lat"],
				trip["dest_lon"],
				trip["transport_mode"],
			)
		except Exception:
			logger.exception("Failed to estimate travel time for trip %s", trip["id"])
			continue

		buffer_percent = get_buffer_percent(user_id)
		remind_before = trip["reminder_before_minutes"] + travel_minutes * (1 + buffer_percent / 100.0)
		arrival = datetime.strptime(trip["arrival_time"], "%Y-%m-%d %H:%M")
		due_time = arrival - timedelta(minutes=remind_before)
		if now >= due_time:
			text = (
				f"Напоминание о поездке: <b>{trip['title']}</b>\n"
				f"Место: {trip['destination_label']}\n"
				f"Время прибытия: {trip['arrival_time']}\n"
				f"Сейчас уехать нужно примерно за {remind_before:.0f} мин. до прибытия.\n"
				f"Текущая геолокация: {location['label']}"
			)
			await bot.send_message(chat_id=user_id, text=text, parse_mode="HTML")
			with db_connection() as conn:
				conn.execute("UPDATE trips SET reminder_sent = 1, updated_at = ? WHERE id = ?", (format_dt(now_local()), trip["id"]))


async def reminder_job(context: ContextTypes.DEFAULT_TYPE) -> None:
	await process_reminders(context.bot)


async def reminder_loop(application: Application) -> None:
	while True:
		try:
			await process_reminders(application.bot)
		except asyncio.CancelledError:
			raise
		except Exception:
			logger.exception("Reminder loop failed")
		await asyncio.sleep(SCAN_INTERVAL_SECONDS)


async def post_init(application: Application) -> None:
	if application.job_queue is not None:
		application.job_queue.run_repeating(reminder_job, interval=SCAN_INTERVAL_SECONDS, first=10)
	else:
		logger.warning("JobQueue is unavailable; using a background reminder loop")
		application.create_task(reminder_loop(application))


async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
	logger.exception("Unhandled exception while processing update", exc_info=context.error)


def build_application() -> Application:
	if not TOKEN:
		raise RuntimeError("Set TELEGRAM_BOT_TOKEN environment variable.")

	application = Application.builder().token(TOKEN).post_init(post_init).build()

	add_conversation = ConversationHandler(
		entry_points=[CommandHandler("newtrip", newtrip_command), MessageHandler(filters.Regex(r"^Новая поездка$"), newtrip_command)],
		states={
			ADD_TITLE: [MessageHandler(filters.TEXT & ~filters.COMMAND, add_title)],
			ADD_DESTINATION: [MessageHandler(filters.TEXT & ~filters.COMMAND, add_destination)],
			ADD_ARRIVAL: [MessageHandler(filters.TEXT & ~filters.COMMAND, add_arrival)],
			ADD_MODE: [CallbackQueryHandler(add_mode_callback, pattern=r"^mode:")],
			ADD_REMINDER: [MessageHandler(filters.TEXT & ~filters.COMMAND, add_reminder)],
			ADD_CONFIRM: [CallbackQueryHandler(add_confirm_callback, pattern=r"^(add:confirm|cancel)$")],
		},
		fallbacks=[CommandHandler("cancel", cancel)],
		allow_reentry=True,
	)

	settings_conversation = ConversationHandler(
		entry_points=[CommandHandler("settings", settings_command), MessageHandler(filters.Regex(r"^Настройки$"), settings_command)],
		states={
			SETTINGS_BUFFER: [MessageHandler(filters.TEXT & ~filters.COMMAND, settings_buffer_received)],
		},
		fallbacks=[CommandHandler("cancel", cancel)],
		allow_reentry=True,
	)

	location_conversation = ConversationHandler(
		entry_points=[CommandHandler("location", location_command), MessageHandler(filters.Regex(r"^Моя геолокация$"), location_command)],
		states={
			LOCATION_WAIT: [MessageHandler(filters.LOCATION, location_received), MessageHandler(filters.TEXT & ~filters.COMMAND, location_received)],
		},
		fallbacks=[CommandHandler("cancel", cancel)],
		allow_reentry=True,
	)

	edit_conversation = ConversationHandler(
		entry_points=[CallbackQueryHandler(handle_trip_edit, pattern=r"^trip:edit:"), CallbackQueryHandler(handle_edit_field, pattern=r"^editfield:")],
		states={
			EDIT_VALUE: [MessageHandler(filters.TEXT & ~filters.COMMAND, edit_value)],
		},
		fallbacks=[CommandHandler("cancel", cancel)],
		allow_reentry=True,
	)

	application.add_handler(CommandHandler("start", start))
	application.add_handler(CommandHandler("help", help_command))
	application.add_handler(CommandHandler("trips", trips_command))
	application.add_handler(add_conversation)
	application.add_handler(settings_conversation)
	application.add_handler(location_conversation)
	application.add_handler(edit_conversation)
	application.add_handler(CallbackQueryHandler(handle_trip_view, pattern=r"^trip:view:"))
	application.add_handler(CallbackQueryHandler(handle_back_to_list, pattern=r"^back_to_list$"))
	application.add_handler(CallbackQueryHandler(handle_delete_trip, pattern=r"^trip:delete:"))
	application.add_handler(CallbackQueryHandler(handle_delete_confirm, pattern=r"^delete:confirm:"))
	application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_menu_router))
	application.add_error_handler(on_error)

	return application


def main() -> None:
	init_db()
	application = build_application()
	logger.info("Bot started")
	application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
	try:
		main()
	except KeyboardInterrupt:
		sys.exit(0)