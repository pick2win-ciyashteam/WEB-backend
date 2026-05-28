import * as s from "./countries.service.js";

/* ── Get all active countries ── */
 export const getActiveCountries = async (req, res) => {
  try {
    const result = await s.getActiveCountriesService();
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ── Get country by name ── */
 export const getCountryByName = async (req, res) => {
  try {
    const result = await s.getCountryByNameService(req.params.name);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};


