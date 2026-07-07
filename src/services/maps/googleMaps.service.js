const axios = require("axios");
const env = require("../../config/env");
const { createLogger } = require("../../utils/logger");

const log = createLogger("maps:google");

/**
 * Geocodes a free-form address into [lng, lat] for storage in a Mongo 2dsphere field.
 * Returns null (never throws) when unconfigured or lookup fails, so callers can save
 * addresses without geo and it just won't show up in $near/$geoNear searches yet.
 */
async function geocodeAddress({ line1, city, state, pincode }) {
  if (!env.googleMapsServerKey) {
    log.warn("GOOGLE_MAPS_SERVER_KEY not set — skipping geocode");
    return null;
  }

  const address = [line1, city, state, pincode].filter(Boolean).join(", ");
  if (!address) return null;

  try {
    const { data } = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
      params: { address, key: env.googleMapsServerKey },
    });

    if (data.status !== "OK" || !data.results?.length) {
      log.warn("Geocode lookup failed", { address, status: data.status });
      return null;
    }

    const { lat, lng } = data.results[0].geometry.location;
    return { type: "Point", coordinates: [lng, lat] };
  } catch (err) {
    log.error("Geocode request error", err.message);
    return null;
  }
}

module.exports = { geocodeAddress };
