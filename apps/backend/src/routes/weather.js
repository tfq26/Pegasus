import { Hono } from "hono"
import { db } from "../../db/surreal.js"
import { APIService, API_DEFAULTS } from "../services/APIService.js"
import { getAuthToken } from "../../lib/auth.js"

const weather = new Hono()

// Initialize Weather Service instance
export const weatherService = new APIService(API_DEFAULTS.WEATHER);

weather.get("/", async (c) => {
    try {
        const [results] = await db.query("SELECT * FROM weather_data ORDER BY updated_at DESC");
        return c.json({ weather: results });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

/**
 * Sync weather data for a location and cache in SurrealDB
 * Used by weather widgets to ensure fresh data
 */
weather.post("/sync/:location", async (c) => {
    const token = getAuthToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);

    try {
        const location = c.req.param("location");
        if (!location) return c.json({ error: "Location required" }, 400);

        console.log(`[Weather] Syncing data for location: ${location}`);

        // Check if we have valid cached data
        const [cached] = await db.query(`
            SELECT * FROM weather_cache 
            WHERE location = $loc AND expires_at > time::now()
            LIMIT 1;
        `, { loc: location });

        if (cached && cached[0]) {
            console.log(`[Weather] Using cached data for ${location}`);
            return c.json({ cached: true, data: cached[0] });
        }

        // Fetch fresh data from API
        let apiKey = process.env.OPENWEATHER_API_KEY;
        const elementId = c.req.query("elementId");

        if (elementId) {
            const { SecretService } = await import("../services/SecretService.js");
            const customKey = await SecretService.getSecret(payload.sub, `widget_secret_${elementId}`);
            if (customKey) {
                console.log(`[Weather] Using custom API key for widget ${elementId}`);
                apiKey = customKey;
            }
        }

        if (!apiKey) {
            return c.json({ error: "Weather API key not configured" }, 500);
        }

        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=imperial`;
        const response = await fetch(url);

        if (!response.ok) {
            const error = await response.json();
            return c.json({ error: error.message || "Failed to fetch weather data" }, response.status);
        }

        const data = await response.json();

        // Fetch forecast data
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(location)}&appid=${apiKey}&units=imperial`;
        const forecastResponse = await fetch(forecastUrl);
        let forecast = [];

        if (forecastResponse.ok) {
            const forecastData = await forecastResponse.json();
            // Group by day and take first forecast for each day
            const dailyForecasts = new Map();
            forecastData.list.forEach(item => {
                const date = item.dt_txt.split(' ')[0];
                if (!dailyForecasts.has(date)) {
                    dailyForecasts.set(date, {
                        date,
                        temp: item.main.temp,
                        condition: item.weather[0].main,
                        icon: `https://openweathermap.org/img/wn/${item.weather[0].icon}@2x.png`
                    });
                }
            });
            forecast = Array.from(dailyForecasts.values()).slice(0, 5); // Next 5 days
        }

        // Cache the data (expires in 10 minutes)
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        await db.query(`
            INSERT INTO weather_cache (
                location, 
                temp, 
                feels_like, 
                condition, 
                icon, 
                humidity, 
                wind_speed, 
                forecast, 
                expires_at
            )
            VALUES (
                $location, 
                $temp, 
                $feels_like, 
                $condition, 
                $icon, 
                $humidity, 
                $wind_speed, 
                $forecast, 
                $expires_at
            )
            ON DUPLICATE KEY UPDATE
                temp = $temp,
                feels_like = $feels_like,
                condition = $condition,
                icon = $icon,
                humidity = $humidity,
                wind_speed = $wind_speed,
                forecast = $forecast,
                cached_at = time::now(),
                expires_at = $expires_at;
        `, {
            location,
            temp: data.main.temp,
            feels_like: data.main.feels_like,
            condition: data.weather[0].main,
            icon: `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`,
            humidity: data.main.humidity,
            wind_speed: data.wind.speed,
            forecast,
            expires_at: expiresAt
        });

        console.log(`[Weather] Cached fresh data for ${location}`);
        return c.json({ ok: true, synced: true });
    } catch (e) {
        console.error(`[Weather] Sync error:`, e);
        return c.json({ error: e.message }, 500);
    }
});

export { weather as weatherRoutes }
