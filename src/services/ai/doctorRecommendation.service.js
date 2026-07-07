const DoctorProfile = require("../../models/DoctorProfile");
const Specialization = require("../../models/Specialization");

/**
 * Heuristic ranking (rating desc, experience desc) over verified/listed doctors matching
 * the given specialization names — placeholder for a real recommendation model later.
 */
async function recommendDoctors({ specializationNames = [], lat, lng, radiusKm = 25, limit = 10 }) {
  const query = { "verification.status": "verified", isListed: true };

  if (specializationNames.length) {
    const specs = await Specialization.find({ name: { $in: specializationNames } }).select("_id");
    query.specializations = { $in: specs.map((s) => s._id) };
  }

  if (lat && lng) {
    const EARTH_RADIUS_KM = 6378.1;
    query["address.geo"] = {
      $geoWithin: { $centerSphere: [[Number(lng), Number(lat)], Number(radiusKm) / EARTH_RADIUS_KM] },
    };
  }

  return DoctorProfile.find(query)
    .populate("user", "name")
    .populate("specializations", "name")
    .sort({ ratingAvg: -1, experienceYears: -1 })
    .limit(limit);
}

module.exports = { recommendDoctors };
