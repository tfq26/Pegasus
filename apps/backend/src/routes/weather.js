import { Hono } from "hono"
import { db } from "../db/index.js"
import { weatherCache } from "../db/schema.js"
import { eq, gt } from "drizzle-orm"
import { APIService, API_DEFAULTS } from "../services/APIService.js"
import { getAuthToken } from "../../lib/auth.js"

const weather = new Hono()

// Initialize Weather Service instance
export const weatherService = new APIService(API_DEFAULTS.WEATHER);

weather.get("/", async (c) => {
    try {
        const results = await db.query.weatherCache.findMany({
            orderBy: (weather, { desc }) => [desc(weather.cachedAt)]
        });
        return c.json({ weather: results });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

/**
 * Sync weather data for a location and cache in Neon
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
        const cached = await db.query.weatherCache.findFirst({
            where: and(
                eq(weatherCache.location, location),
                gt(weatherCache.expiresAt, new Date())
            )
        });

        if (cached) {
            console.log(`[Weather] Using cached data for ${location}`);
            return c.json({ cached: true, data: cached });
        }

        // Fetch fresh data from API
        let apiKey = process.env.OPENWEATHER_API_KEY;
        const elementId = c.req.query("elementId");

        // if (elementId) {
        //     const { SecretService } = await import("../services/SecretService.js");
        //     const customKey = await SecretService.getSecret(payload.sub, `widget_secret_${elementId}`);
        //     if (customKey) {
        //         console.log(`[Weather] Using custom API key for widget ${elementId}`);
        //         apiKey = customKey;
        //     }
        // }

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
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await db.insert(weatherCache).values({
            location,
            temp: data.main.temp,
            feelsLike: data.main.feels_like,
            condition: data.weather[0].main,
            icon: `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`,
            humidity: data.main.humidity,
            windSpeed: data.wind.speed,
            forecast,
            expiresAt,
            cachedAt: new Date()
        }).onConflictDoUpdate({
            target: weatherCache.location,
            set: {
                temp: data.main.temp,
                feelsLike: data.main.feels_like,
                condition: data.weather[0].main,
                icon: `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`,
                humidity: data.main.humidity,
                windSpeed: data.wind.speed,
                forecast,
                expiresAt,
                cachedAt: new Date()
            }
        });

        console.log(`[Weather] Cached fresh data for ${location}`);
        return c.json({ ok: true, synced: true });
    } catch (e) {
        console.error(`[Weather] Sync error:`, e);
        return c.json({ error: e.message }, 500);
    }
});

export { weather as weatherRoutes }
