import { Hono } from "hono"
import { db } from "../../db/surreal.js"
import { APIService, API_DEFAULTS } from "../services/APIService.js"

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

export { weather as weatherRoutes }
