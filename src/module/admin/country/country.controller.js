import * as s from "./country.service.js";

export const addCountry = async (req, res) => {
  try {
    const result = await s.addCountryService(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};


export const getAllCountries = async (req, res) => {
  try {
    const result = await s.getAllCountriesAdminService();
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const updateCountry = async (req, res) => {
  try {
    const result = await s.updateCountryService(req.params.id, req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const deleteCountry = async (req, res) => {
  try {
    const result = await s.deleteCountryService(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const toggleCountry = async (req, res) => {
  try {
    const result = await s.toggleCountryService(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};